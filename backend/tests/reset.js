// Reinicia el schema de pruebas desde cero: lo tira y lo vuelve a crear,
// luego reaplica las migraciones. Para cuando quedó en un estado raro (una
// corrida se cayó a la mitad, un esquema viejo con columnas que ya no
// existen) y limpiar suite por suite no alcanza.
//
// Uso:  npm run test:reset   (desde backend/)
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ENV_TEST = path.join(ROOT, '.env.test');
const ENV_DEV = path.join(ROOT, '.env');

function abortar(mensaje) {
  console.error(`\n✗ ${mensaje}\n`);
  process.exit(1);
}

if (!fs.existsSync(ENV_TEST)) {
  abortar('Falta backend/.env.test — este script solo opera sobre la base de pruebas.');
}
require('dotenv').config({ path: ENV_TEST, override: true });

const urlPruebas = process.env.DIRECT_URL || process.env.DATABASE_URL || '';
const schema = /[?&]schema=([^&]+)/.exec(urlPruebas)?.[1];

// Mismos guardias que tests/run.js: nunca operar sobre "public" ni sobre la
// URL de desarrollo, así este script no pueda tirar un schema que no es suyo.
if (!schema || schema === 'public') {
  abortar('DATABASE_URL/DIRECT_URL (de .env.test) no declara un ?schema= distinto de "public".');
}
if (fs.existsSync(ENV_DEV)) {
  const dev = /^DATABASE_URL="?([^"\n]+)"?/m.exec(fs.readFileSync(ENV_DEV, 'utf8'))?.[1];
  if (dev && dev === process.env.DATABASE_URL) {
    abortar('DATABASE_URL de .env.test es idéntica a la de .env. Me niego a tirar ese schema.');
  }
}

async function main() {
  console.log(`Reiniciando el schema de pruebas "${schema}"…`);
  const client = new Client({ connectionString: urlPruebas });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.query(`CREATE SCHEMA "${schema}"`);
    console.log('  schema recreado');
  } finally {
    await client.end();
  }

  console.log('Aplicando migraciones…');
  const migracion = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: ROOT,
    env: { ...process.env },
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (migracion.status !== 0) abortar('Las migraciones no se pudieron aplicar al schema recién creado.');

  console.log('\n  listo — el schema de pruebas quedó vacío y al día\n');
}

main().catch(e => {
  console.error('\n✗ Error reiniciando el schema de pruebas:', e);
  process.exit(1);
});
