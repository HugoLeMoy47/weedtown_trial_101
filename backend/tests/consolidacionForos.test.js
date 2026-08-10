// Ciclo 13C: la consolidación de subforos.
//
// Esta prueba corre EL SCRIPT DE VERDAD como proceso hijo, contra el schema de
// pruebas. No reimplementa su lógica: si probara una copia, la copia podría
// estar bien y el script mal, que es exactamente el fallo que nadie detecta.
// Es la misma decisión que tomó la GUI de respaldos, que también lanza el
// script en vez de duplicarlo.
//
// Lo que se cuida:
//   1. Los posts se mudan y sus comentarios viajan con ellos.
//   2. Los seguimientos se MUEVEN, no se pierden — y quien ya seguía el
//      destino no revienta el único (userId, subforumId).
//   3. Un subforo archivado desaparece del directorio, no admite posts nuevos
//      y su ficha OG no se resuelve.
//   4. Correrlo dos veces no hace nada la segunda.
const { spawnSync } = require('child_process');
const path = require('path');
const { suite } = require('./lib');

const RAIZ = path.join(__dirname, '..');

// Los slugs son los del plan real (scripts/consolidar-foros.js). Van tal cual
// a propósito: si alguien cambia el plan y olvida esta prueba, el script no
// encontrará nada que hacer y las aserciones de abajo lo dirán.
const DESTINO = 'cultivo-de-cannabis';
const ABSORBIDA = 'metodos-de-extraccion';
const SUELTA = 'senadito-420';

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('ConsolidacionForos', 'wtcons');

  const limpiarSalas = async () => {
    const salas = await prisma.subForum.findMany({
      where: { slug: { in: [DESTINO, ABSORBIDA, SUELTA, 'cultivo-y-elaboracion'] } },
      select: { id: true }
    });
    const ids = salas.map(s => s.id);
    if (!ids.length) return;
    const posts = await prisma.forumPost.findMany({ where: { subforumId: { in: ids } }, select: { id: true } });
    const postIds = posts.map(p => p.id);
    if (postIds.length) {
      await prisma.reaction.deleteMany({ where: { forumPostId: { in: postIds } } });
      await prisma.forumComment.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.forumPost.deleteMany({ where: { id: { in: postIds } } });
    }
    await prisma.notification.deleteMany({ where: { subforumId: { in: ids } } });
    await prisma.subForumFollow.deleteMany({ where: { subforumId: { in: ids } } });
    await prisma.subForum.deleteMany({ where: { id: { in: ids } } });
  };

  await cleanup();
  await limpiarSalas();
  try {
    const dueña = await mkUser('duena');
    const seguidora = await mkUser('seguidora');
    const otra = await mkUser('otra');

    const destino = await prisma.subForum.create({
      data: { name: 'Cultivo de cannabis', slug: DESTINO, creatorId: dueña.id }
    });
    const absorbida = await prisma.subForum.create({
      data: { name: 'Métodos de extracción', slug: ABSORBIDA, creatorId: dueña.id }
    });
    const suelta = await prisma.subForum.create({
      data: { name: 'Senadito 420', slug: SUELTA, creatorId: dueña.id }
    });

    // Un post con comentario en la sala que va a desaparecer.
    const post = await prisma.forumPost.create({
      data: { title: 'wtcons post', content: 'contenido de prueba', authorId: dueña.id, subforumId: absorbida.id }
    });
    await prisma.forumComment.create({
      data: { content: 'wtcons comentario', authorId: dueña.id, postId: post.id }
    });

    // Seguimientos: uno que solo sigue la absorbida (debe mudarse) y uno que
    // ya sigue las dos (no puede duplicarse ni tronar).
    await prisma.subForumFollow.create({ data: { userId: seguidora.id, subforumId: absorbida.id } });
    await prisma.subForumFollow.create({ data: { userId: otra.id, subforumId: absorbida.id } });
    await prisma.subForumFollow.create({ data: { userId: otra.id, subforumId: destino.id } });

    console.log('\n  — el plan no toca nada sin --aplicar —');
    const plan = spawnSync('node', ['scripts/consolidar-foros.js', '--url', process.env.DATABASE_URL], {
      // SIN `shell`: la URL de la base trae "&connection_limit=..." y cmd.exe
      // corta el argumento en el "&", dejando "connection_limit" como si fuera
      // otro comando. Node se lanza directo, que además es lo correcto aquí.
      cwd: RAIZ, encoding: 'utf8'
    });
    check('el plan corre sin error', plan.status === 0, `(salida ${plan.status}: ${plan.stderr?.slice(0, 200)})`);
    const sinTocar = await prisma.subForum.findUnique({ where: { id: absorbida.id }, select: { archivedAt: true } });
    check('la sala a absorber sigue activa después del plan', sinTocar.archivedAt === null);

    console.log('\n  — con --aplicar: los posts y los seguimientos se mudan —');
    const corrida = spawnSync('node', ['scripts/consolidar-foros.js', '--url', process.env.DATABASE_URL, '--aplicar'], {
      // SIN `shell`: la URL de la base trae "&connection_limit=..." y cmd.exe
      // corta el argumento en el "&", dejando "connection_limit" como si fuera
      // otro comando. Node se lanza directo, que además es lo correcto aquí.
      cwd: RAIZ, encoding: 'utf8'
    });
    check('el script termina bien', corrida.status === 0, `(salida ${corrida.status}: ${corrida.stderr?.slice(0, 300)})`);

    const postMovido = await prisma.forumPost.findUnique({
      where: { id: post.id }, select: { subforumId: true, _count: { select: { comments: true } } }
    });
    check('el post quedó en la sala destino', postMovido.subforumId === destino.id,
      `(quedó en ${postMovido.subforumId}, destino ${destino.id})`);
    check('su comentario viajó con él', postMovido._count.comments === 1,
      `(tiene ${postMovido._count.comments})`);

    const enDestino = await prisma.subForumFollow.count({ where: { subforumId: destino.id } });
    const enOrigen = await prisma.subForumFollow.count({ where: { subforumId: absorbida.id } });
    check('los seguimientos se movieron al destino, sin duplicar a quien ya lo seguía',
      enDestino === 2 && enOrigen === 0, `(destino ${enDestino}, origen ${enOrigen})`);

    const renombrada = await prisma.subForum.findUnique({
      where: { id: destino.id }, select: { name: true, slug: true, archivedAt: true }
    });
    check('la sala destino se renombró y cambió de dirección',
      renombrada.name === 'Cultivo y elaboración' && renombrada.slug === 'cultivo-y-elaboracion',
      `(quedó «${renombrada.name}» en /${renombrada.slug})`);
    check('y sigue activa', renombrada.archivedAt === null);

    const archivada = await prisma.subForum.findUnique({ where: { id: absorbida.id }, select: { archivedAt: true } });
    check('la sala absorbida quedó archivada, no borrada', archivada && archivada.archivedAt !== null);

    const sueltaFinal = await prisma.subForum.findUnique({ where: { id: suelta.id }, select: { archivedAt: true } });
    check('la sala vacía se archivó sin absorber a nadie', sueltaFinal.archivedAt !== null);

    console.log('\n  — una sala archivada desaparece, pero su contenido no —');
    const tok = token(dueña.id);
    let r = await call('GET', '/api/forum/subforums', { tok });
    const slugsVisibles = (r.data?.subforums || []).map(s => s.slug);
    check('no aparece en el directorio', !slugsVisibles.includes(ABSORBIDA),
      `(directorio: ${JSON.stringify(slugsVisibles.slice(0, 8))})`);
    check('la sala destino sí aparece, con su dirección nueva', slugsVisibles.includes('cultivo-y-elaboracion'));

    r = await call('POST', `/api/forum/subforums/${ABSORBIDA}/posts`, {
      tok, body: { title: 'no deberia entrar', content: 'contenido cualquiera' }
    });
    check('no admite posts nuevos → 403', r.status === 403, `(fue ${r.status})`);

    r = await call('GET', `/api/forum/subforums/${ABSORBIDA}/preview`);
    check('su ficha OG no se resuelve → 404 (el Worker cae en la genérica)',
      r.status === 404, `(fue ${r.status})`);

    r = await call('GET', '/api/forum/subforums/cultivo-y-elaboracion/preview');
    check('la ficha de la sala nueva sí se resuelve → 200', r.status === 200, `(fue ${r.status})`);

    console.log('\n  — correrlo de nuevo no hace nada —');
    const segunda = spawnSync('node', ['scripts/consolidar-foros.js', '--url', process.env.DATABASE_URL, '--aplicar'], {
      // SIN `shell`: la URL de la base trae "&connection_limit=..." y cmd.exe
      // corta el argumento en el "&", dejando "connection_limit" como si fuera
      // otro comando. Node se lanza directo, que además es lo correcto aquí.
      cwd: RAIZ, encoding: 'utf8'
    });
    check('la segunda corrida termina bien', segunda.status === 0, `(salida ${segunda.status})`);
    check('y no reporta cambios', /0 cambio\(s\)/.test(segunda.stdout || ''),
      `(dijo: ${(segunda.stdout || '').split('\n').find(l => l.includes('cambio(s)'))?.trim()})`);

    const postSigue = await prisma.forumPost.findUnique({ where: { id: post.id }, select: { subforumId: true } });
    check('el post no se movió otra vez', postSigue.subforumId === destino.id);

    console.log('\n  — ningún post quedó huérfano —');
    const huerfanos = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS c FROM "ForumPost" fp
      LEFT JOIN "SubForum" s ON s.id = fp."subforumId" WHERE s.id IS NULL`);
    check('cero posts sin subforo', huerfanos[0].c === 0, `(hay ${huerfanos[0].c})`);
  } finally {
    await limpiarSalas();
    await cleanup();
  }

  return results;
};
