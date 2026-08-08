#!/usr/bin/env node
// Siembra un escenario de desarrollo en la base LOCAL.
//
// Por qué existe: desde que desarrollo y producción usan bases distintas
// (2026-08-08), la base de desarrollo arranca vacía — que es lo correcto, pero
// deja la app sin nada que mostrar. Y varias verificaciones del producto no se
// pueden hacer con una sola cuenta: "este posteo lo ve una amistad pero no un
// extraño" necesita una amistad Y un extraño Y un bloqueo, montados a mano
// cada vez.
//
// Este script arma ese escenario en segundos, y es idempotente: si ya está
// sembrado, no duplica nada.
//
// NO ES UN SEED DE PRODUCCIÓN. No lo uses para poblar nada real: las cuentas
// que crea son de mentira, con correos @dev.local que no existen.
//
//   node scripts/sembrar-dev.js            → siembra (o no hace nada si ya está)
//   node scripts/sembrar-dev.js --rehacer  → borra lo sembrado y lo vuelve a crear
//   node scripts/sembrar-dev.js --borrar   → solo borra lo sembrado
require('dotenv').config();
const prisma = require('../src/lib/prisma');
const avatar = require('../src/lib/avatar');
const { encode } = require('../src/lib/geogrid');

const DOMINIO = 'dev.local'; // Reservado por RFC 6761: ningún correo real puede caer aquí.

// El reparto está diseñado contra lo que hay que PODER VERIFICAR, no contra
// una idea de "usuarios de ejemplo": cada cuenta existe para cubrir un caso.
const CUENTAS = [
  {
    handle: 'luna', name: 'Luna', papel: 'la protagonista: perfil lleno, posteos de ambas visibilidades',
    bio: 'Cultivo en maceta y tomo mucho café. Aquí para aprender.',
    aboutMe: 'Llevo tres años en esto. Pregúntame de sustratos, con confianza.',
    age: 29, gender: 'femenino', zona: [19.4326, -99.1332]   // CDMX centro
  },
  { handle: 'mora', name: 'Mora', papel: 'AMISTAD de luna: ve sus posteos de solo-amigos',
    bio: 'Indicas y series.', aboutMe: 'Me escondo en el sofá.', age: 34, gender: 'femenino',
    zona: [19.4290, -99.1400] },                              // celda vecina
  { handle: 'tuco', name: 'Tuco', papel: 'EXTRAÑO con sesión: no ve lo de solo-amigos',
    bio: 'Recién llegado.', age: 22, gender: 'masculino', zona: [19.4326, -99.1332] }, // misma celda que luna
  { handle: 'nube', name: 'Nube', papel: 'BLOQUEADA por luna: para ella, luna no existe',
    bio: 'Paisajes.' },
  { handle: 'sol',  name: 'Sol',  papel: 'SOLICITUD pendiente hacia luna',
    bio: 'Buscando con quién rolar.' }
];
const HANDLES = CUENTAS.map(c => c.handle);

const POSTEOS = [
  { autor: 'luna', visibility: 'PUBLIC',  content: 'Primera cosecha del año. Chiquita pero mía.',
    tags: [{ tag: 'primeracosecha', displayTag: 'PrimeraCosecha' }, { tag: 'cultivo', displayTag: 'cultivo' }] },
  { autor: 'luna', visibility: 'FRIENDS', content: 'Esto solo lo cuento aquí: se me murió la segunda planta.',
    tags: [{ tag: 'soloamigos', displayTag: 'SoloAmigos' }] },
  { autor: 'luna', visibility: 'PUBLIC',  content: 'Un posteo sin hashtags, para probar ese caso.', tags: [] },
  { autor: 'mora', visibility: 'PUBLIC',  content: 'Recomiéndenme documentales, ando sin nada que ver.',
    tags: [{ tag: 'recomendaciones', displayTag: 'recomendaciones' }] },
  { autor: 'tuco', visibility: 'PUBLIC',  content: 'Hola, acabo de llegar a WeedTown.',
    tags: [{ tag: 'presentaciones', displayTag: 'Presentaciones' }] }
];

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  const schema = url.searchParams.get('schema') || 'public (default)';
  console.log(`\nBase: ${url.hostname} · schema ${schema} · entorno ${process.env.NODE_ENV || 'desarrollo'}\n`);

  // --- Guardián 1: nunca en producción ---
  if (process.env.NODE_ENV === 'production') {
    console.error('✗ NODE_ENV=production. Este script no siembra en producción.');
    process.exit(1);
  }

  // --- Guardián 2: nunca sobre datos que no sembró este script ---
  // Es la defensa que de verdad importa. Si la base tiene UNA sola cuenta que
  // no está en la lista de arriba, asumimos que son datos de alguien y no se
  // toca nada — sin importar a qué base apunte el .env.
  const ajenas = await prisma.user.count({ where: { handle: { notIn: HANDLES } } });
  if (ajenas > 0) {
    console.error(`✗ Hay ${ajenas} cuenta(s) que este script no creó.`);
    console.error('  No se toca nada: puede ser una base real. Si de verdad querías');
    console.error('  sembrar aquí, vacíala tú a propósito primero.');
    process.exit(1);
  }

  if (flag('--rehacer') || flag('--borrar')) {
    await borrar();
    if (flag('--borrar')) { console.log('\nListo: escenario borrado.\n'); return; }
  }

  const yaEsta = await prisma.user.count({ where: { handle: { in: HANDLES } } });
  if (yaEsta === CUENTAS.length) {
    console.log('El escenario ya está sembrado. Nada que hacer.');
    console.log('Para rehacerlo desde cero: node scripts/sembrar-dev.js --rehacer\n');
    return resumen();
  }

  // --- Cuentas ---
  const porHandle = {};
  for (const c of CUENTAS) {
    const email = `${c.handle}@${DOMINIO}`;
    const semilla = avatar.semillaDesde(email);
    porHandle[c.handle] = await prisma.user.upsert({
      where: { handle: c.handle },
      update: {},
      create: {
        handle: c.handle,
        name: c.name,
        bio: c.bio ?? null,
        aboutMe: c.aboutMe ?? null,
        age: c.age ?? null,
        gender: c.gender ?? null,
        avatar: avatar.urlDeAvatar(semilla),
        // Celda de Cerca, para el ciclo 10C. Se calcula con el mismo geogrid
        // que usa el cliente: acá no hay coordenadas reales de nadie.
        nearbyCell: c.zona ? encode(c.zona[0], c.zona[1]) : null,
        nearbyUpdatedAt: c.zona ? new Date() : null,
        // Identidad de correo: es lo que permite ENTRAR como esta cuenta desde
        // el navegador. Con MAIL_DRIVER=log el enlace mágico se imprime en la
        // consola del backend, así que no hace falta un buzón de verdad.
        identities: {
          create: { provider: 'EMAIL', externalId: email, originHandle: email }
        }
      }
    });
    console.log(`  ✓ @${c.handle.padEnd(5)} — ${c.papel}`);
  }

  // --- Relaciones ---
  const id = (h) => porHandle[h].id;
  await prisma.friendRequest.create({
    data: { requesterId: id('luna'), addresseeId: id('mora'), status: 'ACCEPTED', respondedAt: new Date() }
  });
  await prisma.friendRequest.create({
    data: { requesterId: id('sol'), addresseeId: id('luna'), status: 'PENDING' }
  });
  await prisma.block.create({ data: { blockerId: id('luna'), blockedId: id('nube') } });
  console.log('\n  ✓ luna ↔ mora son amigas · sol tiene solicitud pendiente a luna · luna bloqueó a nube');

  // --- Posteos con hashtags ---
  for (const p of POSTEOS) {
    await prisma.post.create({
      data: {
        content: p.content,
        visibility: p.visibility,
        authorId: id(p.autor),
        hashtags: {
          create: p.tags.map(t => ({
            hashtag: {
              connectOrCreate: { where: { tag: t.tag }, create: { tag: t.tag, displayTag: t.displayTag } }
            }
          }))
        }
      }
    });
  }
  console.log(`  ✓ ${POSTEOS.length} posteos (públicos, de solo-amigos, con y sin hashtags)`);

  await resumen();
}

async function borrar() {
  const ids = (await prisma.user.findMany({ where: { handle: { in: HANDLES } }, select: { id: true } }))
    .map(u => u.id);
  if (!ids.length) return;
  const posts = (await prisma.post.findMany({ where: { authorId: { in: ids } }, select: { id: true } }))
    .map(p => p.id);
  // En orden de dependencias, igual que el cleanup de las pruebas.
  await prisma.hashtagOnPost.deleteMany({ where: { postId: { in: posts } } });
  await prisma.reaction.deleteMany({ where: { OR: [{ userId: { in: ids } }, { postId: { in: posts } }] } });
  await prisma.comment.deleteMany({ where: { OR: [{ authorId: { in: ids } }, { postId: { in: posts } }] } });
  await prisma.post.deleteMany({ where: { id: { in: posts } } });
  await prisma.block.deleteMany({ where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] } });
  await prisma.friendRequest.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { addresseeId: { in: ids } }] } });
  await prisma.identity.deleteMany({ where: { userId: { in: ids } } });
  await prisma.hashtag.deleteMany({ where: { posts: { none: {} } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log('  ✓ escenario anterior borrado');
}

async function resumen() {
  console.log(`
──────────────────────────────────────────────────────────
Para ENTRAR como cualquiera de estas cuentas:

  1. Levanta el backend (npm run dev) y el frontend (npm start).
  2. En /login, pide el enlace mágico para  <handle>@${DOMINIO}
     — por ejemplo  luna@${DOMINIO}
  3. Con MAIL_DRIVER=log el enlace NO se envía: aparece impreso en la
     consola del backend. Cópialo al navegador y entras.

Qué verifica cada cuenta:
`);
  for (const c of CUENTAS) console.log(`  @${c.handle.padEnd(5)} ${c.papel}`);
  console.log(`
Falta el catálogo de subforos, que tiene su propio script:

  npm run subforos -- --creador=luna
──────────────────────────────────────────────────────────
`);
}

main()
  .catch(e => { console.error('\n✗ Error sembrando:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
