#!/usr/bin/env node
// Asigna el rol de una cuenta desde la línea de comandos.
//
// Existe para resolver el huevo y la gallina: el panel solo deja gestionar roles
// a un ADMIN, y al principio no hay ninguno. Requiere acceso al servidor y a las
// credenciales de la base, así que no abre ninguna superficie nueva en la API.
//
// Uso:
//   npm run rol -- --listar
//   npm run rol -- --handle=hugolemoy --rol=ADMIN
//   npm run rol -- --id=3 --rol=MOD
require('dotenv').config();
const prisma = require('../src/lib/prisma');

const ROLES = ['USER', 'MOD', 'ADMIN'];

function args() {
  const out = {};
  for (const a of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

function ayuda() {
  console.log(`
Gestión de roles de WeedTown

  npm run rol -- --listar                                  Cuentas con rol MOD o ADMIN
  npm run rol -- --buscar=hugo                             Buscar por handle o nombre
  npm run rol -- --handle=<handle> --rol=<USER|MOD|ADMIN>  Asignar rol por handle
  npm run rol -- --id=<id>         --rol=<USER|MOD|ADMIN>  Asignar rol por id

El handle es el identificador público de WeedTown (por ejemplo "hugolemoy"),
no la dirección de Mastodon: es único, así que nunca hay ambigüedad.
`);
}

(async () => {
  const a = args();

  if (a.ayuda || a.help || Object.keys(a).length === 0) {
    ayuda();
    return;
  }

  if (a.listar) {
    const conRol = await prisma.user.findMany({
      where: { role: { in: ['MOD', 'ADMIN'] } },
      select: { id: true, handle: true, name: true, role: true },
      orderBy: [{ role: 'asc' }, { id: 'asc' }]
    });
    if (!conRol.length) {
      console.log('\nNo hay ninguna cuenta con rol MOD o ADMIN todavía.');
      console.log('Asigna el primero con:  npm run rol -- --handle=<tu-handle> --rol=ADMIN\n');
      return;
    }
    console.log('\nCuentas con rol:\n');
    for (const u of conRol) {
      console.log(`  [${u.role.padEnd(5)}] #${String(u.id).padStart(4)}  @${u.handle}  (${u.name})`);
    }
    console.log('');
    return;
  }

  if (a.buscar) {
    const encontradas = await prisma.user.findMany({
      where: {
        OR: [
          { handle: { contains: String(a.buscar), mode: 'insensitive' } },
          { name: { contains: String(a.buscar), mode: 'insensitive' } },
          { displayName: { contains: String(a.buscar), mode: 'insensitive' } }
        ]
      },
      select: { id: true, handle: true, name: true, role: true },
      take: 25
    });
    if (!encontradas.length) {
      console.log(`\nNinguna cuenta coincide con "${a.buscar}".\n`);
      return;
    }
    console.log(`\n${encontradas.length} coincidencia(s):\n`);
    for (const u of encontradas) {
      console.log(`  [${u.role.padEnd(5)}] #${String(u.id).padStart(4)}  @${u.handle}  (${u.name})`);
    }
    console.log('');
    return;
  }

  const rol = a.rol ? String(a.rol).toUpperCase() : null;
  if (!rol || !ROLES.includes(rol)) {
    console.error(`\n✗ Falta --rol y debe ser uno de: ${ROLES.join(', ')}\n`);
    process.exitCode = 1;
    return;
  }

  let objetivo = null;
  if (a.id) {
    objetivo = await prisma.user.findUnique({
      where: { id: Number(a.id) },
      select: { id: true, handle: true, name: true, role: true }
    });
    if (!objetivo) {
      console.error(`\n✗ No existe ninguna cuenta con id ${a.id}.\n`);
      process.exitCode = 1;
      return;
    }
  } else if (a.handle) {
    // El handle es único en toda la plataforma: no hay ambigüedad que resolver
    const propuesto = String(a.handle).replace(/^@/, '').toLowerCase();
    objetivo = await prisma.user.findUnique({
      where: { handle: propuesto },
      select: { id: true, handle: true, name: true, role: true }
    });
    if (!objetivo) {
      console.error(`\n✗ No existe ninguna cuenta con handle "${propuesto}".`);
      console.error('  Búscala con:  npm run rol -- --buscar=<texto>\n');
      process.exitCode = 1;
      return;
    }
  } else {
    console.error('\n✗ Indica la cuenta con --handle o --id.\n');
    process.exitCode = 1;
    return;
  }

  if (objetivo.role === rol) {
    console.log(`\n@${objetivo.handle} ya tenía el rol ${rol}. Sin cambios.\n`);
    return;
  }

  await prisma.user.update({ where: { id: objetivo.id }, data: { role: rol } });
  console.log(`\n✓ @${objetivo.handle} (#${objetivo.id}): ${objetivo.role} → ${rol}\n`);
})()
  .catch(e => {
    console.error('\n✗ Error:', e.message, '\n');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
