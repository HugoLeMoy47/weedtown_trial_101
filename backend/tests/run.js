// Runner de las pruebas de integración.
//
// Hace todo el montaje para que `npm test` sea un solo comando: valida que la
// base apuntada NO sea la de desarrollo, aplica las migraciones, levanta el
// backend en su propio puerto, corre las suites y limpia.
//
// Uso:  npm test        (desde backend/)
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ENV_TEST = path.join(ROOT, '.env.test');
const ENV_DEV = path.join(ROOT, '.env');

function abortar(mensaje) {
  console.error(`\n✗ ${mensaje}\n`);
  process.exit(1);
}

// ---------- 1. Cargar y validar el entorno de pruebas ----------

// En local el entorno viene de .env.test; en CI ya está inyectado como variables
// del proceso (ahí no hay archivo, y la base es un Postgres efímero del runner).
// Los guardias de abajo se aplican igual en los dos casos.
let fuenteEntorno;
if (fs.existsSync(ENV_TEST)) {
  // override: true — el entorno de pruebas manda sobre cualquier variable heredada
  require('dotenv').config({ path: ENV_TEST, override: true });
  fuenteEntorno = '.env.test';
} else if (process.env.CI && process.env.DATABASE_URL) {
  fuenteEntorno = 'las variables de entorno del CI';
} else {
  abortar(
    'Falta backend/.env.test.\n' +
    '  Copia .env.test.example y complétalo. La suite borra datos, así que\n' +
    '  necesita una base separada de la de desarrollo.'
  );
}

const urlPruebas = process.env.DATABASE_URL || '';

// Guardia 1: la URL debe declarar un schema propio. Sin esto, Prisma escribiría
// en "public", que es donde viven los datos reales.
const schema = /[?&]schema=([^&]+)/.exec(urlPruebas)?.[1];
if (!schema || schema === 'public') {
  abortar(
    `DATABASE_URL (de ${fuenteEntorno}) no declara un schema de pruebas.\n` +
    '  Agrega ?schema=weedtown_test (o apunta a otra base por completo).\n' +
    '  Sin esto las pruebas borrarían datos del esquema "public".'
  );
}

// Guardia 2: aunque tenga schema, nunca puede ser idéntica a la de desarrollo.
if (fs.existsSync(ENV_DEV)) {
  const dev = /^DATABASE_URL="?([^"\n]+)"?/m.exec(fs.readFileSync(ENV_DEV, 'utf8'))?.[1];
  if (dev && dev === urlPruebas) {
    abortar(`DATABASE_URL (de ${fuenteEntorno}) es idéntica a la de .env. Usa una base o un schema aparte.`);
  }
}

if (!process.env.JWT_SECRET) abortar(`Falta JWT_SECRET en ${fuenteEntorno}.`);

const PORT = process.env.PORT || 4010;
const entornoHijo = { ...process.env };

console.log(`\nEntorno: ${fuenteEntorno}  ·  schema "${schema}"  ·  backend en el puerto ${PORT}`);

// ---------- 2. Aplicar migraciones al schema de pruebas ----------

console.log('\nAplicando migraciones…');
const migracion = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: ROOT,
  env: entornoHijo,
  encoding: 'utf8',
  shell: process.platform === 'win32'
});
if (migracion.status !== 0) {
  console.error(migracion.stdout || '');
  console.error(migracion.stderr || '');
  abortar('No se pudieron aplicar las migraciones a la base de pruebas.');
}
console.log('  migraciones al día');

// ---------- 3. Levantar el backend ----------

let servidor = null;

// 120 intentos × 500 ms = 60 s. Eran 40 (20 s) y quedaba JUSTO en el filo:
// levantar el backend en frío tarda ~19 s en una máquina Windows sin caché de
// disco caliente, y de eso 8 s son `require('swagger-ui-express')` y 2.4 s
// `chatSocket`. La suite fallaba de forma intermitente con "el backend no
// respondió", que suena a un bug del backend y no lo era.
//
// Lo que se mide aquí es "¿está arriba?", no "¿arrancó rápido?": un techo
// generoso no hace más lenta ninguna corrida exitosa —se sale en cuanto
// responde— y elimina un falso negativo que cuesta media hora de diagnóstico
// cada vez que aparece.
async function esperarSalud(intentos = 120) {
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/health`);
      if (res.ok) return true;
    } catch { /* todavía no responde */ }
    // Señal de vida a los 20 s, para que una espera larga no se vea colgada.
    if (i === 40) console.log('  (tarda más de lo normal; sigue intentando)');
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

function apagarServidor() {
  if (!servidor || servidor.killed) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(servidor.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    servidor.kill('SIGTERM');
  }
}

async function main() {
  console.log('\nLevantando el backend de pruebas…');
  // `pipe` y no `ignore`: la salida del backend se guarda pero NO se imprime
  // mientras todo va bien (ensuciaría el reporte de la suite). Solo se muestra
  // si no arranca — antes se descartaba, así que un fallo de arranque decía
  // únicamente "no respondió" y había que reproducirlo a mano para ver por qué.
  servidor = spawn('node', ['app.js'], { cwd: ROOT, env: entornoHijo, stdio: ['ignore', 'pipe', 'pipe'] });
  let salidaBackend = '';
  const recolectar = (d) => { salidaBackend += d; };
  servidor.stdout.on('data', recolectar);
  servidor.stderr.on('data', recolectar);
  servidor.on('error', e => abortar(`No se pudo iniciar el backend: ${e.message}`));

  if (!await esperarSalud()) {
    apagarServidor();
    if (salidaBackend.trim()) {
      console.error('\n  Lo que alcanzó a decir el backend:\n');
      console.error(salidaBackend.split('\n').map(l => `    ${l}`).join('\n'));
    } else {
      console.error('\n  El backend no imprimió NADA: se quedó cargando módulos o murió al instante.');
    }
    abortar(`El backend no respondió en http://localhost:${PORT}/health`);
  }
  console.log('  backend listo');

  // ---------- 4. Correr las suites ----------

  // Filtro opcional por nombre de archivo (npm test -- smoke.test.js), para
  // "test:smoke": correr una sola suite chica sin esperar las 259 pruebas.
  const filtro = process.argv.slice(2);
  const suites = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.test.js'))
    .filter(f => filtro.length === 0 || filtro.includes(f))
    .sort();

  if (filtro.length && suites.length === 0) {
    abortar(`Ningún archivo coincide con el filtro: ${filtro.join(', ')}`);
  }

  const resultados = [];
  for (const archivo of suites) {
    const run = require(path.join(__dirname, archivo));
    console.log(`\n${'─'.repeat(58)}\n${archivo}`);
    resultados.push(await run());
  }

  // ---------- 5. Resumen ----------

  const total = resultados.reduce((a, r) => a + r.pass + r.fail, 0);
  const fallas = resultados.reduce((a, r) => a + r.fail, 0);

  console.log(`\n${'─'.repeat(58)}`);
  for (const r of resultados) {
    console.log(`  ${r.name}: ${r.pass}/${r.pass + r.fail}`);
    for (const f of r.failures) console.log(`      ✗ ${f}`);
  }
  console.log(`\n  ${total - fallas}/${total} pruebas OK${fallas ? ` · ${fallas} FALLAS` : ''}\n`);

  return fallas;
}

main()
  .then(async (fallas) => {
    apagarServidor();
    await require('../src/lib/prisma').$disconnect();
    process.exit(fallas ? 1 : 0);
  })
  .catch(async (e) => {
    console.error('\n✗ Error corriendo las pruebas:', e);
    apagarServidor();
    await require('../src/lib/prisma').$disconnect().catch(() => {});
    process.exit(1);
  });
