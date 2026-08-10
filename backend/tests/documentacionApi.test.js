// Ciclo 12A: que la documentación de la API no se desfase sola.
//
// POR QUÉ EXISTE. El ciclo 10E encontró que `swagger.json` llevaba **21 rutas
// sin documentar y una fantasma**, y solo 8 eran de la ola en curso: las otras
// 13 se habían acumulado durante ciclos anteriores. No fue el descuido de
// nadie en particular — era que no existía ningún paso que lo impidiera, y una
// documentación desfasada no rompe nada, así que nunca hay un momento en que
// duela lo suficiente para arreglarla.
//
// Esta prueba es ese paso. `/api-docs` no es un adorno: se sirve con "Try it
// out" apuntando al backend real, así que una ruta ausente es una ruta que
// nadie sabe que existe, y una ruta fantasma manda a probar algo que no está.
//
// NO valida el contenido de cada entrada —parámetros, respuestas, ejemplos—.
// Eso es criterio humano. Valida lo único que se puede comprobar solo: que la
// LISTA de rutas coincida con la realidad.
const fs = require('fs');
const path = require('path');
const { suite } = require('./lib');

const RAIZ = path.join(__dirname, '..');

// Rutas que existen pero se definen fuera de `src/routes/`, así que el barrido
// de abajo no las ve. Se listan a mano y con su motivo: la alternativa es que
// la prueba las reporte como "documentadas pero inexistentes" cada vez, y una
// prueba que grita en falso se termina ignorando.
const FUERA_DEL_BARRIDO = [
  'GET /health' // vive en app.js: es del proceso, no de un router de negocio
];

/** Prefijo de montaje de cada archivo de rutas, leído de app.js. */
function montajes() {
  const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
  const mapa = {};
  for (const m of app.matchAll(/app\.use\(\s*'([^']+)'\s*,\s*require\('\.\/src\/routes\/(\w+)'\)\s*\)/g)) {
    mapa[m[2]] = m[1];
  }
  return mapa;
}

/** Las rutas que el servidor monta de verdad, en notación OpenAPI. */
function rutasReales() {
  const mapa = montajes();
  const dir = path.join(RAIZ, 'src', 'routes');
  const fuera = [];
  const rutas = new Set();
  for (const archivo of fs.readdirSync(dir)) {
    const base = archivo.replace(/\.js$/, '');
    const prefijo = mapa[base];
    // Un archivo de rutas que app.js no monta no sirve a nadie: es tan
    // reportable como una ruta sin documentar.
    if (prefijo === undefined) { fuera.push(archivo); continue; }
    const src = fs.readFileSync(path.join(dir, archivo), 'utf8');
    for (const m of src.matchAll(/router\.(get|post|put|delete|patch)\(\s*'([^']*)'/g)) {
      const ruta = (prefijo + m[2]).replace(/\/$/, '') || prefijo;
      // Express usa `:id`; OpenAPI usa `{id}`. Sin normalizar, TODA ruta con
      // parámetro se reportaría como divergente.
      rutas.add(`${m[1].toUpperCase()} ${ruta.replace(/:(\w+)/g, '{$1}')}`);
    }
  }
  return { rutas, sinMontar: fuera };
}

function rutasDocumentadas() {
  const sw = JSON.parse(fs.readFileSync(path.join(RAIZ, 'swagger.json'), 'utf8'));
  const rutas = new Set();
  for (const [ruta, ops] of Object.entries(sw.paths)) {
    for (const metodo of Object.keys(ops)) rutas.add(`${metodo.toUpperCase()} ${ruta}`);
  }
  return rutas;
}

module.exports = async function run() {
  const { results, check } = suite('DocumentacionApi', 'wtdocapi');

  const { rutas: reales, sinMontar } = rutasReales();
  const documentadas = rutasDocumentadas();
  FUERA_DEL_BARRIDO.forEach(r => reales.add(r));

  const sinDocumentar = [...reales].filter(r => !documentadas.has(r)).sort();
  const fantasma = [...documentadas].filter(r => !reales.has(r)).sort();

  console.log(`\n  — ${reales.size} rutas montadas · ${documentadas.size} documentadas en swagger.json —`);

  check(
    'todas las rutas montadas están en swagger.json',
    sinDocumentar.length === 0,
    sinDocumentar.length
      ? `\n      Faltan por documentar en backend/swagger.json:\n${sinDocumentar.map(r => `        · ${r}`).join('\n')}`
      : ''
  );

  check(
    'swagger.json no documenta rutas que no existen',
    fantasma.length === 0,
    fantasma.length
      ? `\n      Documentadas pero NO montadas (bórralas de swagger.json, o móntalas):\n${fantasma.map(r => `        · ${r}`).join('\n')}` +
        `\n      Si alguna se define fuera de src/routes/, agrégala a FUERA_DEL_BARRIDO en esta prueba.`
      : ''
  );

  check(
    'no hay archivos en src/routes/ que app.js no monte',
    sinMontar.length === 0,
    sinMontar.length ? `\n      Sin montar en app.js: ${sinMontar.join(', ')}` : ''
  );

  return results;
};
