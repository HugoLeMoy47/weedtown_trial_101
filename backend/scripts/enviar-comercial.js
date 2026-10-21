// Enviar una campaña de comunicación comercial (ciclo 22, B26).
//
// ES UNA PRUEBA, SALVO QUE SE DIGA LO CONTRARIO. Sin banderas dice a cuántas personas
// y a quiénes (enmascarados) les escribiría y cómo se vería el correo. No manda nada.
//
// Uso (desde backend/):
//   node scripts/enviar-comercial.js --campana=scripts/campanas/ejemplo.json
//   node scripts/enviar-comercial.js --campana=<archivo> --env=.env.produccion
//   node scripts/enviar-comercial.js --campana=<archivo> --env=.env.produccion --enviar --confirmo=<N>
//
// PARA ENVIAR hacen falta TRES cosas a la vez, a propósito: `--enviar`; `--confirmo=<N>`
// con N igual a los pendientes que la prueba mostró (obliga a haber visto el tamaño de la
// lista); y `MAIL_DRIVER=resend` en el entorno elegido.
//
// QUÉ GARANTIZA, y no depende de este script sino de `src/lib/correos.js`:
//   · solo recibe quien tiene el consentimiento `comunicaciones_comerciales` ACTIVO y de
//     la versión vigente (se vuelve a comprobar al mandar cada correo);
//   · un correo al día por persona, y un tope diario para toda la plataforma;
//   · el pie con quién lo envía y el enlace firmado de baja en un clic, más las cabeceras
//     `List-Unsubscribe` — se agregan solos: la campaña no los escribe.
//
// QUÉ GUARDA. `.planeacion/envios/comercial_<id>.json` (sin versionar): hash de (campaña,
// persona), no direcciones. Volver a correrlo no repite a nadie; los que no cupieron en
// el tope del día quedan para el siguiente.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..');

const argumentos = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));

function abortar(mensaje) {
  console.error(`\n✗ ${mensaje}\n`);
  process.exit(1);
}

if (!argumentos.campana || argumentos.campana === true) abortar('Falta --campana=<archivo.json>.');
const archivoEnv = path.resolve(ROOT, argumentos.env || '.env');
if (!fs.existsSync(archivoEnv)) abortar(`No existe el archivo de entorno ${archivoEnv}.`);
const archivoCampana = path.resolve(process.cwd(), argumentos.campana);
if (!fs.existsSync(archivoCampana)) abortar(`No existe la campaña ${archivoCampana}.`);
require('dotenv').config({ path: archivoEnv, override: true });

const prisma = require('../src/lib/prisma');
const mailer = require('../src/lib/mailer');
const { validarCampana, destinatariosComerciales, planificarCampana, huella } = require('../src/lib/campanas');
const { enviarCorreo, maximoPorDia } = require('../src/lib/correos');
const { enmascarar } = require('../src/lib/avisoTerminos');
const { agregarPie } = require('../src/lib/correos');

const enviar = argumentos.enviar === true;
const maximo = argumentos.maximo ? Number(argumentos.maximo) : maximoPorDia();
if (!Number.isInteger(maximo) || maximo < 1 || maximo > 100) abortar('--maximo debe ser un entero entre 1 y 100.');

let campana;
try {
  campana = validarCampana(JSON.parse(fs.readFileSync(archivoCampana, 'utf8')));
} catch (e) {
  abortar(`Campaña no válida: ${e.message}`);
}

const carpeta = path.join(REPO, '.planeacion', 'envios');
const rutaRegistro = path.join(carpeta, `comercial_${campana.id}.json`);
const cargarRegistro = () => (fs.existsSync(rutaRegistro) ? JSON.parse(fs.readFileSync(rutaRegistro, 'utf8')) : { campana: campana.id, enviados: {} });

(async () => {
  const url = process.env.DATABASE_URL || '';
  const host = /@([^:/?]+)/.exec(url)?.[1] || '(desconocido)';
  const schema = /[?&]schema=([^&]+)/.exec(url)?.[1] || 'public';

  console.log('\n— Campaña de comunicación comercial —');
  console.log(`  campaña     : ${campana.id}`);
  console.log(`  entorno     : ${path.basename(archivoEnv)}`);
  console.log(`  base        : ${host} · schema "${schema}"`);
  console.log(`  correo      : driver "${mailer.driver}"`);

  const lista = await destinatariosComerciales(prisma);
  const registro = cargarRegistro();
  const plan = planificarCampana({ lista, registro, maximo })(campana.id);

  console.log(`\n  Personas con consentimiento comercial ACTIVO y correo: ${plan.total}`);
  console.log(`  Ya recibieron esta campaña (registro)                : ${plan.yaEnviadas}`);
  console.log(`  Pendientes                                           : ${plan.pendientes}`);
  console.log(`  ...que ya recibieron un correo HOY (esperan a mañana): ${plan.recibieronHoy}`);
  console.log(`  Se enviarían en esta corrida (tope ${maximo})           : ${plan.ahora.length}`);
  console.log(`\n  Primeras direcciones: ${plan.ahora.slice(0, 8).map(p => enmascarar(p.email)).join(', ') || '(ninguna)'}`);

  const pieVista = agregarPie({
    texto: campana.texto, html: campana.html, finalidad: 'comunicaciones_comerciales',
    urls: { pagina: '<enlace firmado de baja de cada persona>', api: '' }
  });
  console.log(`\n  Asunto: ${campana.asunto}\n  ────────\n${pieVista.texto.split('\n').map(l => `  ${l}`).join('\n')}\n  ────────`);

  if (!enviar) {
    console.log('\n  PRUEBA: no se envió nada y no se tocó ningún registro.');
    console.log(`  Para enviar: --enviar --confirmo=${plan.pendientes}  (con MAIL_DRIVER=resend)\n`);
    await prisma.$disconnect();
    return;
  }

  if (mailer.driver !== 'resend') abortar(`MAIL_DRIVER es "${mailer.driver}": con ese driver no se envía nada y el registro lo daría por enviado. Usa un entorno con MAIL_DRIVER=resend.`);
  if (String(argumentos.confirmo) !== String(plan.pendientes)) abortar(`--confirmo debe ser ${plan.pendientes} (los pendientes que acabas de ver). Recibido: ${argumentos.confirmo ?? '(nada)'}.`);
  if (plan.ahora.length === 0) { console.log('\n  No hay nada que enviar hoy.\n'); await prisma.$disconnect(); return; }

  console.log(`\n  Enviando ${plan.ahora.length} correos…`);
  const cuenta = { enviados: 0, omitidos: {}, fallidos: [] };
  for (const p of plan.ahora) {
    const r = await enviarCorreo({ userId: p.id, finalidad: 'comunicaciones_comerciales', asunto: campana.asunto, texto: campana.texto, html: campana.html, mailer });
    if (r.enviado) {
      registro.enviados[huella(p.id, campana.id)] = new Date().toISOString();
      cuenta.enviados++;
    } else if (r.motivo === 'fallo') {
      cuenta.fallidos.push({ correo: enmascarar(p.email), error: r.error });
    } else {
      cuenta.omitidos[r.motivo] = (cuenta.omitidos[r.motivo] || 0) + 1;
    }
    await new Promise(res => setTimeout(res, 600));
  }
  fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(rutaRegistro, JSON.stringify(registro, null, 2));
  console.log(`\n  Enviados: ${cuenta.enviados}  ·  Omitidos: ${JSON.stringify(cuenta.omitidos)}  ·  Fallidos: ${cuenta.fallidos.length}`);
  for (const f of cuenta.fallidos) console.log(`    ✗ ${f.correo}: ${f.error}`);
  console.log(`  Registro: ${rutaRegistro}\n`);
  await prisma.$disconnect();
  if (cuenta.fallidos.length) process.exit(1);
})().catch(async (e) => {
  console.error('\n✗ Error:', e.message);
  try { await prisma.$disconnect(); } catch { /* nada */ }
  process.exit(1);
});
