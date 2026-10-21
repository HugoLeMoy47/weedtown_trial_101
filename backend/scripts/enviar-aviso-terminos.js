// Simulación del aviso de actualización de los Términos (ciclos 21 y 22.1).
//
// ESTE SCRIPT YA NO ENVÍA. Solo cuenta a quién se le avisaría y muestra el correo, contra la
// base a la que apunte el entorno. El ENVÍO real (y la prueba a tu propia dirección) lo hace el
// propio backend en producción, porque ahí viven la clave de Resend y la base viva, y porque deja
// constancia en la base: ver `POST /api/interno/aviso-terminos` y `src/lib/avisoTerminos.js`.
//
// Uso (desde backend/):
//   node scripts/enviar-aviso-terminos.js                          contra el entorno por defecto (.env)
//   node scripts/enviar-aviso-terminos.js --env=.env.test.local    contra otro entorno
//
// Qué imprime: la base a la que apunta (host y schema, para que se vea ANTES de confiar en el
// número), cuántas cuentas con dirección de contacto aún no aceptan la versión vigente, cuántas ya
// tienen constancia de aviso, y el texto exacto del correo. No toca nada.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const argumentos = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));

const archivoEnv = path.resolve(ROOT, argumentos.env || '.env');
if (!fs.existsSync(archivoEnv)) {
  console.error(`\n✗ No existe el archivo de entorno ${archivoEnv}.\n`);
  process.exit(1);
}
require('dotenv').config({ path: archivoEnv, override: true });

const prisma = require('../src/lib/prisma');
const mailer = require('../src/lib/mailer');
const { TERMINOS_VIGENTES, limiteDeTerminos } = require('../src/lib/terminos');
const { armarMensaje, enviarAvisoTerminos, fechaLarga } = require('../src/lib/avisoTerminos');

(async () => {
  const url = process.env.DATABASE_URL || '';
  const host = /@([^:/?]+)/.exec(url)?.[1] || '(desconocido)';
  const schema = /[?&]schema=([^&]+)/.exec(url)?.[1] || 'public';
  const limite = limiteDeTerminos();

  console.log('\n— Aviso de actualización de los Términos (SIMULACIÓN) —');
  console.log(`  entorno : ${path.basename(archivoEnv)}`);
  console.log(`  base    : ${host} · schema "${schema}"`);
  console.log(`  versión : ${TERMINOS_VIGENTES}   ·   límite: ${limite} (${fechaLarga(limite)})`);

  const resultado = await enviarAvisoTerminos({
    prisma, mailer, versionVigente: TERMINOS_VIGENTES, limite, urlBase: process.env.FRONTEND_URL, enviar: false
  });
  console.log(`\n  Cuentas con dirección que aún no aceptan y sin constancia de aviso: ${resultado.pendientes}`);
  console.log(`  Se avisarían en la primera llamada (tope por llamada)              : ${resultado.seEnviarianAhora}`);
  console.log(`  Primeras direcciones (enmascaradas)                                : ${resultado.muestra.join(', ') || '(ninguna)'}`);

  const m = armarMensaje({ limite, urlBase: process.env.FRONTEND_URL });
  console.log(`\n  Asunto: ${m.asunto}\n  ────────\n${m.texto.split('\n').map(l => `  ${l}`).join('\n')}\n  ────────`);
  console.log('\n  No se envió nada. El envío real se arma y se dispara desde el backend (ver README).\n');
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('\n✗ Error:', e.message);
  try { await prisma.$disconnect(); } catch { /* nada */ }
  process.exit(1);
});
