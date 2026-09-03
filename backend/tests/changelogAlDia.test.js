// Ciclo 15E: que CHANGELOG.md no se quede atrás de backend/src o frontend/src.
//
// POR QUÉ EXISTE. El ciclo 14 entró a `main` sin plan, sin prompt y sin
// entrada de bitácora: nueve días de código en producción sin ningún registro
// de qué se tocó ni por qué. `.planeacion/` está en `.gitignore` a propósito
// (el razonamiento de producto no es público) — pero eso significa que CI no
// puede exigir la bitácora, porque el runner no la tiene delante. El registro
// del CAMBIO (qué se tocó, en dos líneas) es distinto del RAZONAMIENTO
// (trampas, opciones descartadas) y sí puede vivir versionado: en
// CHANGELOG.md. Esta prueba es el mismo mecanismo que `documentacionApi.js`
// (12A) usó contra el desfase de Swagger, aplicado al desfase de bitácora.
//
// QUÉ COMPARA. No mira commit por commit — un PR de diez commits solo
// necesita UNA entrada de CHANGELOG.md en todo el rango, no una por commit.
// El punto de comparación es, en orden:
//   1. pull_request: merge-base entre HEAD y origin/<rama base> (GITHUB_BASE_REF).
//   2. push directo: el SHA "before" que trae el propio evento.
//   3. Fuera de CI (local): merge-base con origin/main si existe.
// Si ninguno aplica, o el checkout es superficial y no tiene el commit base
// (actions/checkout trae fetch-depth 1 por defecto — este workflow pide
// fetch-depth 0 en el job de backend, ver .github/workflows/ci.yml), la
// prueba se omite explícitamente en vez de fallar en falso: no tener con qué
// comparar no es lo mismo que "no cambió nada".
//
// CÓMO SE SALTA A PROPÓSITO. `[skip changelog]` en el mensaje del último
// commit del rango. Deja rastro en el historial, que es el punto: un guardia
// que se puede evadir sin dejar huella no es un guardia.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { suite } = require('./lib');

const RAIZ = path.join(__dirname, '..', '..');

function git(args) {
  return execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8' }).trim();
}

function refExiste(ref) {
  try {
    git(['rev-parse', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

function esRepoSuperficial() {
  try {
    return git(['rev-parse', '--is-shallow-repository']) === 'true';
  } catch {
    return false;
  }
}

/** @returns {string|null} SHA del punto de comparación, o null si no hay ninguno fiable. */
function puntoDeComparacion() {
  const evento = process.env.GITHUB_EVENT_NAME;

  if (evento === 'pull_request' && process.env.GITHUB_BASE_REF) {
    const base = `origin/${process.env.GITHUB_BASE_REF}`;
    if (refExiste(base)) {
      try {
        return git(['merge-base', 'HEAD', base]);
      } catch { /* sigue con el siguiente intento */ }
    }
  }

  if (evento === 'push' && process.env.GITHUB_EVENT_PATH && fs.existsSync(process.env.GITHUB_EVENT_PATH)) {
    try {
      const payload = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
      const before = payload.before;
      // Todo ceros = rama nueva sin historia previa que comparar (GitHub lo
      // documenta así para el primer push de una rama).
      if (before && !/^0+$/.test(before) && refExiste(before)) return before;
    } catch { /* sigue con el siguiente intento */ }
  }

  if (refExiste('origin/main')) {
    try {
      return git(['merge-base', 'HEAD', 'origin/main']);
    } catch { /* sin punto de comparación */ }
  }

  return null;
}

module.exports = async function run() {
  const { results, check } = suite('ChangelogAlDia', 'wtchangelog');

  const base = puntoDeComparacion();
  if (!base) {
    console.log('  (sin punto de comparación disponible — se omite el guardia de CHANGELOG.md)');
    return results;
  }

  if (esRepoSuperficial() && !refExiste(`${base}^{commit}`)) {
    console.log(`  (checkout superficial sin el commit base ${base.slice(0, 7)} — se omite el guardia; el job de backend debe pedir fetch-depth: 0)`);
    return results;
  }

  const commitsEnRango = git(['log', '--format=%H', `${base}..HEAD`]).split('\n').filter(Boolean);
  if (!commitsEnRango.length) {
    console.log('  (sin commits nuevos sobre el punto de comparación — nada que revisar)');
    return results;
  }

  const mensajeUltimoCommit = git(['log', '-1', '--format=%B']);
  if (/\[skip changelog\]/i.test(mensajeUltimoCommit)) {
    check('[skip changelog] declarado en el último commit: guardia omitido a propósito', true);
    return results;
  }

  const archivosTocados = git(['diff', '--name-only', `${base}..HEAD`]).split('\n').filter(Boolean);
  const tocaCodigo = archivosTocados.some(f => f.startsWith('backend/src/') || f.startsWith('frontend/src/'));
  const tocaChangelog = archivosTocados.includes('CHANGELOG.md');

  console.log(`  — ${commitsEnRango.length} commit(s) sobre ${base.slice(0, 7)}, ${archivosTocados.length} archivo(s) tocado(s) —`);

  check(
    'CHANGELOG.md tiene entrada por los cambios de backend/src o frontend/src en este rango',
    !tocaCodigo || tocaChangelog,
    tocaCodigo && !tocaChangelog
      ? `\n      El rango ${base.slice(0, 7)}..HEAD toca backend/src/ o frontend/src/ sin tocar CHANGELOG.md.\n` +
        '      Agrega una entrada, o termina el mensaje del commit con [skip changelog] si de verdad no aplica.'
      : ''
  );

  return results;
};
