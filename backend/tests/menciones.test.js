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

    console.log('\n  — P0 ciclo 15: mención en post FRIENDS no debe filtrar el contenido a un no-amigo —');
    // Ana y Diego NO son amigos. Ana postea "solo amigos" mencionando a Diego.
    const diego = await mkUser('diego');
    const tDiego = token(diego.id);

    r = await call('POST', '/api/posts', {
      tok: tAna,
      body: { content: `algo privado @${diego.handle}`, visibility: 'FRIENDS' }
    });
    check('crear post FRIENDS responde 200', r.status === 200);
    const postPrivadoId = r.data.id;

    r = await call('GET', '/api/notifications', { tok: tDiego });
    check('crear post FRIENDS responde 200', r.status === 200);
    const mencionesDiego = (r.data.notifications || []).filter(n => n.type === 'MENTION' && n.postId === postPrivadoId);
    check('Diego (no amigo) NO recibe notificación de la mención en un post FRIENDS', mencionesDiego.length === 0, `(recibió ${mencionesDiego.length})`);

    // El post sigue siendo inaccesible por la ruta directa (control ya existente)
    r = await call('GET', `/api/posts/${postPrivadoId}`, { tok: tDiego });
    check('GET /posts/:id a Diego sigue dando 403/404', r.status === 403 || r.status === 404, `(fue ${r.status})`);

    // Control: si Diego SÍ es amigo de Ana, la mención en FRIENDS sí le llega
    await prisma.friendRequest.create({
      data: { requesterId: ana.id, addresseeId: diego.id, status: 'ACCEPTED', respondedAt: new Date() }
    });
    r = await call('POST', '/api/posts', {
      tok: tAna,
      body: { content: `otra vez privado @${diego.handle}`, visibility: 'FRIENDS' }
    });
    const postPrivado2Id = r.data.id;
    r = await call('GET', '/api/notifications', { tok: tDiego });
    const mencionesDiego2 = (r.data.notifications || []).filter(n => n.type === 'MENTION' && n.postId === postPrivado2Id);
    check('Diego (ahora amigo) SÍ recibe la mención en un post FRIENDS', mencionesDiego2.length === 1, `(recibió ${mencionesDiego2.length})`);

    console.log('\n  — P0 ciclo 15: mención en contenido oculto por moderación → cero notificaciones —');
    const elena = await mkUser('elena');
    const tElena = token(elena.id);
    r = await call('POST', '/api/posts', { tok: tAna, body: { content: `hola @${elena.handle}` } });
    const postElenaId = r.data.id;
    await prisma.post.update({ where: { id: postElenaId }, data: { hiddenAt: new Date() } });
    // Volvemos a disparar la notificación como si la ocultación hubiera llegado
    // antes de notificar (defensa en profundidad: notificarMenciones no debe
    // asumir que lo que se le pasa sigue visible).
    const { notificarMenciones } = require('../src/lib/menciones');
    const postOculto = await prisma.post.findUnique({ where: { id: postElenaId } });
    await notificarMenciones({
      texto: postOculto.content,
      actorId: ana.id,
      actorName: ana.name,
      postId: postOculto.id,
      alcance: { visibility: postOculto.visibility, authorId: postOculto.authorId, hidden: Boolean(postOculto.hiddenAt) }
    });
    const notifsElena = await prisma.notification.findMany({ where: { recipientId: elena.id, type: 'MENTION' } });
    check('contenido oculto por moderación → cero notificaciones de mención', notifsElena.length === 0, `(recibió ${notifsElena.length})`);

    console.log('\n  — P0 ciclo 15: el payload de GET /api/notifications no arrastra content en menciones —');
    r = await call('GET', '/api/notifications', { tok: tDiego });
    const notifMencion = (r.data.notifications || []).find(n => n.type === 'MENTION' && n.postId === postPrivado2Id);
    check('la notificación de mención existe en el payload', Boolean(notifMencion));
    check(
      'el payload de la mención NO trae post.content (solo id)',
      notifMencion && notifMencion.post && Object.keys(notifMencion.post).sort().join(',') === 'id',
      JSON.stringify(notifMencion?.post)
    );

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

    console.log('\n  — Ciclo 15B: acotar el universo (red + perfilPublico), no solo ordenarlo —');
    r = await call('GET', `/api/profile/mention-suggestions?q=w`, { tok: tAna });
    check('q de un carácter devuelve lista vacía', (r.data?.suggestions || []).length === 0, `(${(r.data?.suggestions || []).length} resultados)`);

    // Fabio: fuera de cualquier red, perfilPublico en su default (false).
    const fabio = await mkUser('fabio');
    const qFabio = fabio.handle.slice(0, 6);

    r = await call('GET', `/api/profile/mention-suggestions?q=${qFabio}`, { tok: tElena });
    check('fuera de la red y sin perfil público: invisible para un desconocido',
      !(r.data?.suggestions || []).some(s => s.id === fabio.id));

    await prisma.friendRequest.create({
      data: { requesterId: ana.id, addresseeId: fabio.id, status: 'ACCEPTED', respondedAt: new Date() }
    });
    r = await call('GET', `/api/profile/mention-suggestions?q=${qFabio}`, { tok: tAna });
    check('un amigo directo sí lo ve aunque su perfil no sea público',
      (r.data?.suggestions || []).some(s => s.id === fabio.id));

    await prisma.user.update({ where: { id: fabio.id }, data: { perfilPublico: true } });
    r = await call('GET', `/api/profile/mention-suggestions?q=${qFabio}`, { tok: tElena });
    check('con perfilPublico true, un desconocido (sin red en común) sí lo ve',
      (r.data?.suggestions || []).some(s => s.id === fabio.id));

    // Control: dos cuentas privadas sin relación ni amigos en común no se ven entre sí
    const gina = await mkUser('gina');
    r = await call('GET', `/api/profile/mention-suggestions?q=${gina.handle.slice(0, 6)}`, { tok: tElena });
    check('dos cuentas sin relación ni amigos en común no se ven entre sí',
      !(r.data?.suggestions || []).some(s => s.id === gina.id));

    // Si busca con q vacío devuelve lista vacía
    r = await call('GET', '/api/profile/mention-suggestions?q=', { tok: tAna });
    check('con q vacío devuelve lista vacía', (r.data?.suggestions || []).length === 0);

    console.log('\n  — Ciclo 15D: tope de menciones notificadas por texto —');
    const cincuenta = [];
    for (let i = 0; i < 50; i++) cincuenta.push(await mkUser(`m${i}`));
    const textoConCincuenta = cincuenta.map(u => `@${u.handle}`).join(' ');
    r = await call('POST', '/api/posts', { tok: tAna, body: { content: textoConCincuenta } });
    check('crear post con 50 menciones responde 200', r.status === 200, `(fue ${r.status})`);
    const notifsDeEsePost = await prisma.notification.findMany({
      where: { type: 'MENTION', postId: r.data.id }
    });
    check('exactamente 10 notificaciones, no 50', notifsDeEsePost.length === 10, `(fueron ${notifsDeEsePost.length})`);
    const idsNotificados = new Set(notifsDeEsePost.map(n => n.recipientId));
    const primerosDiez = new Set(cincuenta.slice(0, 10).map(u => u.id));
    check('son justo las primeras 10 en orden de aparición en el texto',
      idsNotificados.size === primerosDiez.size && [...idsNotificados].every(id => primerosDiez.has(id)));

  } finally {
    await cleanup();
  }

  return results;
};
