// Pruebas para menciones @handle y sus notificaciones
const { suite } = require('./lib');
const { extraerHandles } = require('../src/lib/menciones');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Menciones', 'wtmenc');

  await cleanup();
  try {
    console.log('\n  — Unitario: extracción de handles —');
    check('extrae handles válidos', (() => {
      const h = extraerHandles('Hola @beto y @carla_42, miren esto @beto');
      return h.length === 2 && h.includes('beto') && h.includes('carla_42');
    })());

    check('ignora arrobas inválidas o vacías', (() => {
      const h = extraerHandles('correo@example.com o solo @ o @@');
      return !h.includes('example') && !h.includes('');
    })());

    console.log('\n  — Integración: mención en post del feed —');
    const ana = await mkUser('ana');
    const beto = await mkUser('beto');
    const tAna = token(ana.id);
    const tBeto = token(beto.id);

    // Ana postea mencionando a Beto y a sí misma
    let r = await call('POST', '/api/posts', {
      tok: tAna,
      body: { content: `Saludos a @${beto.handle} y a mí misma @${ana.handle}` }
    });
    check('crear post responde 200', r.status === 200);
    const postId = r.data.id;

    // Verificar que se creó notificación MENTION para Beto y NO para Ana
    const notifsBeto = await prisma.notification.findMany({
      where: { recipientId: beto.id, type: 'MENTION' }
    });
    check('Beto recibió notificación de tipo MENTION', notifsBeto.length === 1 && notifsBeto[0].actorId === ana.id);

    const notifsAna = await prisma.notification.findMany({
      where: { recipientId: ana.id, type: 'MENTION' }
    });
    check('Ana no se auto-notificó', notifsAna.length === 0);

    console.log('\n  — Integración: mención con bloqueo mutuo —');
    // Beto bloquea a Ana
    await call('POST', `/api/users/${ana.id}/block`, { tok: tBeto });

    // Ana postea de nuevo mencionando a Beto
    await call('POST', '/api/posts', {
      tok: tAna,
      body: { content: `Otro post para @${beto.handle}` }
    });

    const notifsBetoDespues = await prisma.notification.findMany({
      where: { recipientId: beto.id, type: 'MENTION' }
    });
    check('Beto no recibe mención si hay bloqueo mutuo', notifsBetoDespues.length === 1); // sigue teniendo solo la primera

    console.log('\n  — Integración: sugerencias de autocompletado de mención —');
    const carla = await mkUser('carla');
    const tCarla = token(carla.id);

    // Ana y Carla son amigas
    await prisma.friendRequest.create({
      data: { requesterId: ana.id, addresseeId: carla.id, status: 'ACCEPTED', respondedAt: new Date() }
    });

    // Ana busca con q=wtmenc
    r = await call('GET', `/api/profile/mention-suggestions?q=${ana.handle.slice(0, 6)}`, { tok: tAna });
    check('sugerencias responde 200', r.status === 200);
    const suggs = r.data?.suggestions || [];
    check('encuentra a Carla', suggs.some(s => s.id === carla.id));
    check('marca a Carla como amiga', suggs.find(s => s.id === carla.id)?.isFriend === true);
    check('no incluye a la propia Ana', !suggs.some(s => s.id === ana.id));
    check('no incluye a Beto que tiene bloqueo mutuo', !suggs.some(s => s.id === beto.id));

    // Si busca con q vacío devuelve lista vacía
    r = await call('GET', '/api/profile/mention-suggestions?q=', { tok: tAna });
    check('con q vacío devuelve lista vacía', (r.data?.suggestions || []).length === 0);

  } finally {
    await cleanup();
  }

  return results;
};
