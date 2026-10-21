// Aviso único de la actualización de los Términos (ciclo 21).
//
// ES UNA PRUEBA, SALVO QUE SE DIGA LO CONTRARIO. Sin banderas, este script solo
// dice a quién le escribiría y cómo se vería el correo. No manda nada y no toca
// ningún registro.
//
// Uso (desde backend/):
//   node scripts/enviar-aviso-terminos.js                          prueba (no manda nada)
//   node scripts/enviar-aviso-terminos.js --env=.env.produccion    prueba contra otro entorno
//   node scripts/enviar-aviso-terminos.js --env=.env.produccion --enviar --confirmo=<N>
//
// PARA ENVIAR DE VERDAD hacen falta TRES cosas a la vez, a propósito:
//   1. --enviar
//   2. --confirmo=<N>, con N igual al total de pendientes que la prueba mostró.
//      Obliga a haber visto el tamaño de la lista: si cambió, no manda.
//   3. MAIL_DRIVER=resend en el entorno elegido. Con el driver `log` el «envío»
//      solo imprimiría, y el registro lo daría por enviado: el script se niega.
//
// QUÉ GUARDA Y DÓNDE. `.planeacion/envios/aviso_terminos_<versión>.json` (carpeta
// sin versionar): el hash de cada dirección ya avisada y la fecha. No guarda
// direcciones. Si se vuelve a correr, no repite a nadie; si hay más pendientes
// que el tope por corrida (--maximo, 80 por defecto: el tier gratuito de Resend
// admite ~100 al día), se corre de nuevo al día siguiente.
//
// QUÉ LEE. La base a la que apunte el entorno elegido: DATABASE_URL. La prueba
// imprime el host y el schema para que se vea ANTES de enviar contra qué base se
// va a trabajar.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..');

const argumentos = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));

function abortar(mensaje) {
  console.error(`\n✗ ${mensaje}\n`);
  process.exit(1);
}

const archivoEnv = path.resolve(ROOT, argumentos.env || '.env');
if (!fs.existsSync(archivoEnv)) abortar(`No existe el archivo de entorno ${archivoEnv}.`);
require('dotenv').config({ path: archivoEnv, override: true });

const prisma = require('../src/lib/prisma');
const mailer = require('../src/lib/mailer');
const { TERMINOS_VIGENTES, limiteDeTerminos } = require('../src/lib/terminos');
const { MAXIMO_POR_DEFECTO, destinatarios, armarMensaje, planificar, enviarLote, enmascarar, fechaLarga } = require('../src/lib/avisoTerminos');

const enviar = argumentos.enviar === true;
const maximo = argumentos.maximo ? Number(argumentos.maximo) : MAXIMO_POR_DEFECTO;
if (!Number.isInteger(maximo) || maximo < 1 || maximo > 100) abortar('--maximo debe ser un entero entre 1 y 100.');

const carpeta = path.join(REPO, '.planeacion', 'envios');
const rutaRegistro = path.join(carpeta, `aviso_terminos_${TERMINOS_VIGENTES}.json`);

function cargarRegistro() {
  if (!fs.existsSync(rutaRegistro)) return { version: TERMINOS_VIGENTES, enviados: {} };
  const r = JSON.parse(fs.readFileSync(rutaRegistro, 'utf8'));
  if (r.version !== TERMINOS_VIGENTES) abortar(`El registro ${rutaRegistro} es de otra versión de los Términos.`);
  return r;
}

function guardarRegistro(r) {
  fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(rutaRegistro, JSON.stringify(r, null, 2));
}

(async () => {
  const url = process.env.DATABASE_URL || '';
  const host = /@([^:/?]+)/.exec(url)?.[1] || '(desconocido)';
  const schema = /[?&]schema=([^&]+)/.exec(url)?.[1] || 'public';
  const limite = limiteDeTerminos();

  console.log('\n— Aviso de actualización de los Términos —');
  console.log(`  entorno     : ${path.basename(archivoEnv)}`);
  console.log(`  base        : ${host} · schema "${schema}"`);
  console.log(`  correo      : driver "${mailer.driver}"`);
  console.log(`  versión     : ${TERMINOS_VIGENTES}   ·   límite: ${limite} (${fechaLarga(limite)})`);

  const lista = await destinatarios(prisma, TERMINOS_VIGENTES);
  const registro = cargarRegistro();
  const plan = planificar({ lista, registro, maximo });
  const mensaje = armarMensaje({ limite, urlBase: process.env.FRONTEND_URL });

  console.log(`\n  Cuentas con correo que aún no aceptan la versión vigente: ${plan.total}`);
  console.log(`  Ya avisadas (registro)                                  : ${plan.yaAvisadas}`);
  console.log(`  Pendientes                                              : ${plan.pendientes}`);
  console.log(`  Se enviarían en esta corrida (tope ${maximo})             : ${plan.ahora.length}`);
  console.log(`\n  Primeras direcciones: ${plan.ahora.slice(0, 8).map(enmascarar).join(', ') || '(ninguna)'}`);
  console.log(`\n  Asunto: ${mensaje.asunto}\n  ────────\n${mensaje.texto.split('\n').map(l => `  ${l}`).join('\n')}\n  ────────`);

  if (!enviar) {
    console.log('\n  PRUEBA: no se envió nada y no se tocó ningún registro.');
    console.log(`  Para enviar: --enviar --confirmo=${plan.pendientes}  (con MAIL_DRIVER=resend)\n`);
    await prisma.$disconnect();
    return;
  }

  if (mailer.driver !== 'resend') abortar(`MAIL_DRIVER es "${mailer.driver}": con ese driver no se envía nada y el registro lo daría por enviado. Usa un entorno con MAIL_DRIVER=resend.`);
  if (String(argumentos.confirmo) !== String(plan.pendientes)) abortar(`--confirmo debe ser ${plan.pendientes} (los pendientes que acabas de ver). Recibido: ${argumentos.confirmo ?? '(nada)'}.`);
  if (plan.ahora.length === 0) { console.log('\n  No hay nada que enviar.\n'); await prisma.$disconnect(); return; }

  console.log(`\n  Enviando ${plan.ahora.length} correos…`);
  const resultado = await enviarLote({ ahora: plan.ahora, mailer, registro, mensaje, enviar: true });
  guardarRegistro(registro);
  console.log(`\n  Enviados: ${resultado.enviados}  ·  Fallidos: ${resultado.fallidos.length}`);
  for (const f of resultado.fallidos) console.log(`    ✗ ${f.correo}: ${f.error}`);
  console.log(`  Registro: ${rutaRegistro}\n`);
  await prisma.$disconnect();
  if (resultado.fallidos.length) process.exit(1);
})().catch(async (e) => {
  console.error('\n✗ Error:', e.message);
  try { await prisma.$disconnect(); } catch { /* nada */ }
  process.exit(1);
});
