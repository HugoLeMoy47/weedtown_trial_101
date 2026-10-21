// Crear la cuenta oficial @weedtown (ciclo 22.1).
//
// POR QUÉ UN SCRIPT. `weedtown` es un handle RESERVADO (src/lib/handle.js): ninguna persona
// puede registrarlo desde la app, justamente para que nadie suplante a la cuenta oficial. Así
// que se crea a mano, directo en la base, una sola vez. Es la misma operación que ya existe
// para los roles (`npm run rol`): requiere acceso a las credenciales de la base, no abre ninguna
// superficie nueva en la API.
//
// CÓMO SE ENTRA DESPUÉS. La cuenta no tiene contraseña (ninguna cuenta la tiene): se entra con
// un ENLACE MÁGICO que llega al correo que se le asigne aquí. Por eso hace falta un buzón al que
// se pueda acceder (p. ej. el correo con dominio weedtown que se está creando) y que el dominio
// esté verificado en Resend (ya lo está). En weedtown.social/login se escribe ese correo, llega el
// enlace y se entra. Es una cuenta de correo como cualquier otra: pasa por la cuarentena de altas
// de 3 horas para abrir chats nuevos.
//
// ES UNA PRUEBA, SALVO QUE SE DIGA LO CONTRARIO. Sin `--crear` solo dice qué haría.
//
// Uso (desde backend/):
//   node scripts/crear-cuenta-oficial.js --email=hola@tudominio.mx
//   node scripts/crear-cuenta-oficial.js --email=hola@tudominio.mx --rol=MOD
//   node scripts/crear-cuenta-oficial.js --email=hola@tudominio.mx --crear --confirmo=weedtown
//   (--env=<archivo> para apuntar a otro entorno; --rol=USER|MOD|ADMIN, por defecto USER)
//
// Para CREAR hacen falta DOS cosas a la vez: `--crear` y `--confirmo=weedtown` (el handle que se va
// a crear: obliga a haber leído lo que dijo la prueba). Antes de tocar nada comprueba que el
// handle esté libre y que la dirección no pertenezca ya a otra cuenta.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const argumentos = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));

const abortar = (m) => { console.error(`\n✗ ${m}\n`); process.exit(1); };

const archivoEnv = path.resolve(ROOT, argumentos.env || '.env');
if (!fs.existsSync(archivoEnv)) abortar(`No existe el archivo de entorno ${archivoEnv}.`);
require('dotenv').config({ path: archivoEnv, override: true });

const prisma = require('../src/lib/prisma');
const avatar = require('../src/lib/avatar');
const { FORMATO_CORREO, normalizar, enmascarar } = require('../src/lib/contacto');

const HANDLE = 'weedtown';
const NOMBRE = 'WeedTown';
const ROLES = ['USER', 'MOD', 'ADMIN'];

const correo = normalizar(argumentos.email);
const rol = (argumentos.rol || 'USER').toUpperCase();
if (!FORMATO_CORREO.test(correo)) abortar('Falta --email=<correo> (con forma de correo).');
if (!ROLES.includes(rol)) abortar(`--rol debe ser uno de ${ROLES.join(', ')}.`);

(async () => {
  const url = process.env.DATABASE_URL || '';
  const host = /@([^:/?]+)/.exec(url)?.[1] || '(desconocido)';
  const schema = /[?&]schema=([^&]+)/.exec(url)?.[1] || 'public';

  console.log('\n— Cuenta oficial —');
  console.log(`  entorno : ${path.basename(archivoEnv)}`);
  console.log(`  base    : ${host} · schema "${schema}"`);
  console.log(`  handle  : @${HANDLE}   nombre: ${NOMBRE}   rol: ${rol}`);
  console.log(`  entra con el correo: ${enmascarar(correo)} (enlace mágico)`);

  const existente = await prisma.user.findUnique({ where: { handle: HANDLE }, select: { id: true, deletedAt: true } });
  if (existente) abortar(`@${HANDLE} ya existe en esta base (id ${existente.id}${existente.deletedAt ? ', eliminada' : ''}). No se crea nada.`);
  const identidad = await prisma.identity.findUnique({ where: { provider_externalId: { provider: 'EMAIL', externalId: correo } } });
  if (identidad) abortar('Esa dirección ya pertenece a otra cuenta: usa otra para la oficial.');

  if (argumentos.crear !== true) {
    console.log('\n  PRUEBA: el handle y la dirección están libres. No se creó nada.');
    console.log(`  Para crearla: --crear --confirmo=${HANDLE}\n`);
    await prisma.$disconnect();
    return;
  }
  if (argumentos.confirmo !== HANDLE) abortar(`--confirmo debe ser "${HANDLE}". Recibido: ${argumentos.confirmo ?? '(nada)'}.`);

  const user = await prisma.user.create({
    data: {
      handle: HANDLE,
      name: NOMBRE,
      avatar: avatar.urlDeAvatar(HANDLE),
      role: rol,
      identities: { create: { provider: 'EMAIL', externalId: correo, originHandle: correo } }
    },
    select: { id: true, handle: true, role: true }
  });
  console.log(`\n  ✓ Creada: @${user.handle} (id ${user.id}, rol ${user.role}).`);
  console.log('  Para entrar: weedtown.social/login → escribe ese correo → abre el enlace que llega.');
  console.log('  Marca la casilla de Términos al entrar: así queda registrada su aceptación.\n');
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('\n✗ Error:', e.message);
  try { await prisma.$disconnect(); } catch { /* nada */ }
  process.exit(1);
});
