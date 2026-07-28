#!/usr/bin/env node
// Asigna el rol de una cuenta desde la línea de comandos.
//
// Existe para resolver el huevo y la gallina: el panel solo deja gestionar roles
// a un ADMIN, y al principio no hay ninguno. Requiere acceso al servidor y a las
// credenciales de la base, así que no abre ninguna superficie nueva en la API.
//
// Uso:
//   npm run rol -- --listar
//   npm run rol -- --acct=hugo@mastodon.social --rol=ADMIN
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

  npm run rol -- --listar                              Cuentas con rol MOD o ADMIN
  npm run rol -- --buscar=hugo                         Buscar una cuenta por nombre o acct
  npm run rol -- --acct=<acct> --rol=<USER|MOD|ADMIN>  Asignar rol por acct
  npm run rol -- --id=<id>    --rol=<USER|MOD|ADMIN>   Asignar rol por id

El acct es el que devuelve Mastodon (por ejemplo "hugo" o "hugo@otra.instancia").
Si hay varias coincidencias, el script las muestra y no cambia nada.
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
      select: { id: true, acct: true, name: true, mastodonInstance: true, role: true },
      orderBy: [{ role: 'asc' }, { id: 'asc' }]
    });
    if (!conRol.length) {
      console.log('\nNo hay ninguna cuenta con rol MOD o ADMIN todavía.');
      console.log('Asigna el primero con:  npm run rol -- --acct=<tu-acct> --rol=ADMIN\n');
      return;
    }
    console.log('\nCuentas con rol:\n');
    for (const u of conRol) {
      console.log(`  [${u.role.padEnd(5)}] #${String(u.id).padStart(4)}  ${u.acct}@${u.mastodonInstance}  (${u.name})`);
    }
    console.log('');
    return;
  }

  if (a.buscar) {
    const encontradas = await prisma.user.findMany({
      where: {
        OR: [
          { acct: { contains: String(a.buscar), mode: 'insensitive' } },
          { name: { contains: String(a.buscar), mode: 'insensitive' } },
          { displayName: { contains: String(a.buscar), mode: 'insensitive' } }
        ]
      },
      select: { id: true, acct: true, name: true, mastodonInstance: true, role: true },
      take: 25
    });
    if (!encontradas.length) {
      console.log(`\nNinguna cuenta coincide con "${a.buscar}".\n`);
      return;
    }
    console.log(`\n${encontradas.length} coincidencia(s):\n`);
    for (const u of encontradas) {
      console.log(`  [${u.role.padEnd(5)}] #${String(u.id).padStart(4)}  ${u.acct}@${u.mastodonInstance}  (${u.name})`);
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
      select: { id: true, acct: true, name: true, mastodonInstance: true, role: true }
    });
    if (!objetivo) {
      console.error(`\n✗ No existe ninguna cuenta con id ${a.id}.\n`);
      process.exitCode = 1;
      return;
    }
  } else if (a.acct) {
    // El acct puede venir como "hugo" o "hugo@instancia"
    const [acct, instancia] = String(a.acct).split('@').filter(Boolean).length > 1
      ? [String(a.acct).split('@')[0], String(a.acct).split('@').slice(1).join('@')]
      : [String(a.acct), null];

    const candidatas = await prisma.user.findMany({
      where: { acct: { equals: acct, mode: 'insensitive' }, ...(instancia && { mastodonInstance: instancia }) },
      select: { id: true, acct: true, name: true, mastodonInstance: true, role: true }
    });
    if (!candidatas.length) {
      console.error(`\n✗ No existe ninguna cuenta con acct "${a.acct}".`);
      console.error('  Búscala con:  npm run rol -- --buscar=<texto>\n');
      process.exitCode = 1;
      return;
    }
    if (candidatas.length > 1) {
      console.error(`\n✗ "${a.acct}" coincide con ${candidatas.length} cuentas. Usa --id para desambiguar:\n`);
      for (const u of candidatas) {
        console.error(`    #${u.id}  ${u.acct}@${u.mastodonInstance}  (${u.name})`);
      }
      console.error('');
      process.exitCode = 1;
      return;
    }
    objetivo = candidatas[0];
  } else {
    console.error('\n✗ Indica la cuenta con --acct o --id.\n');
    process.exitCode = 1;
    return;
  }

  if (objetivo.role === rol) {
    console.log(`\n${objetivo.acct}@${objetivo.mastodonInstance} ya tenía el rol ${rol}. Sin cambios.\n`);
    return;
  }

  await prisma.user.update({ where: { id: objetivo.id }, data: { role: rol } });
  console.log(`\n✓ ${objetivo.acct}@${objetivo.mastodonInstance} (#${objetivo.id}): ${objetivo.role} → ${rol}\n`);
})()
  .catch(e => {
    console.error('\n✗ Error:', e.message, '\n');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
