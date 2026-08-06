const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('PublicShare', 'wtshare');

  await cleanup();
  try {
    const ana = await mkUser('ana');
    const beto = await mkUser('beto');
    const tAna = token(ana.id);
    const tBeto = token(beto.id);

    console.log('\n  — Posteos públicos accesibles sin sesión —');
    const rPublic = await call('POST', '/api/posts', { tok: tAna, body: { content: 'post público para compartir', visibility: 'PUBLIC' } });
    check('crear post PUBLIC responde 200', rPublic.status === 200 && rPublic.data.visibility === 'PUBLIC');

    const rPublicAnon = await call('GET', `/api/posts/${rPublic.data.id}`);
    check('post público se puede ver sin sesión', rPublicAnon.status === 200 && rPublicAnon.data.id === rPublic.data.id);

    console.log('\n  — HU-PRV-001: comentarios de un post público, solo con sesión —');
    const rComentar = await call('POST', `/api/posts/${rPublic.data.id}/comment`, { tok: tBeto, body: { content: 'un comentario que no debería exponerse sin sesión' } });
    check('comentar el post público responde 200', rComentar.status === 200);

    const rPublicAnonComments = await call('GET', `/api/posts/${rPublic.data.id}/comments`);
    check(
      'sin sesión, GET /posts/:id/comments no devuelve contenido (recorte en servidor)',
      rPublicAnonComments.status === 200
      && Array.isArray(rPublicAnonComments.data.comments)
      && rPublicAnonComments.data.comments.length === 0
      && rPublicAnonComments.data.restricted === true
    );

    const rPublicComComments = await call('GET', `/api/posts/${rPublic.data.id}/comments`, { tok: tAna });
    check(
      'con sesión, los comentarios del post público se ven completos',
      rPublicComComments.status === 200 && rPublicComComments.data.comments.length === 1
      && rPublicComComments.data.comments[0].content === 'un comentario que no debería exponerse sin sesión'
    );

    console.log('\n  — H1: un post oculto por moderación no es visible por enlace directo —');
    const rOculto = await call('POST', '/api/posts', { tok: tAna, body: { content: 'post que se va a ocultar', visibility: 'PUBLIC' } });
    await prisma.post.update({ where: { id: rOculto.data.id }, data: { hiddenAt: new Date() } });
    const rOcultoAnon = await call('GET', `/api/posts/${rOculto.data.id}`);
    check('un post con hiddenAt responde 404 sin sesión (antes del fix, era 200)', rOcultoAnon.status === 404);
    const rOcultoAutor = await call('GET', `/api/posts/${rOculto.data.id}`, { tok: tAna });
    check('el propio autor tampoco ve su post oculto por enlace directo (mismo criterio que el feed)', rOcultoAutor.status === 404);
    const rOcultoComments = await call('GET', `/api/posts/${rOculto.data.id}/comments`);
    check('los comentarios de un post oculto tampoco se listan', rOcultoComments.status === 404);

    console.log('\n  — Posteos solo amigos no se exponen con enlace público —');
    const rFriends = await call('POST', '/api/posts', { tok: tAna, body: { content: 'post solo amigos', visibility: 'FRIENDS' } });
    check('crear post FRIENDS responde 200', rFriends.status === 200 && rFriends.data.visibility === 'FRIENDS');

    const rFriendsAnon = await call('GET', `/api/posts/${rFriends.data.id}`);
    check('un post FRIENDS no se puede ver sin sesión', rFriendsAnon.status === 404);

    const rFriendsAnonComments = await call('GET', `/api/posts/${rFriends.data.id}/comments`);
    check('los comentarios de un post FRIENDS no se pueden listar sin sesión', rFriendsAnonComments.status === 404);

    console.log('\n  — Un amigo sí puede ver un post FRIENDS —');
    const request = await call('POST', `/api/friends/request/${beto.id}`, { tok: tAna });
    const requestId = request.data.friendRequest.id;
    await call('POST', `/api/friends/accept/${requestId}`, { tok: tBeto });

    const rFriendsBeto = await call('GET', `/api/posts/${rFriends.data.id}`, { tok: tBeto });
    check('un amigo ve el post FRIENDS', rFriendsBeto.status === 200 && rFriendsBeto.data.id === rFriends.data.id);

    const rFriendsBetoComments = await call('GET', `/api/posts/${rFriends.data.id}/comments`, { tok: tBeto });
    check('un amigo ve los comentarios del post FRIENDS', rFriendsBetoComments.status === 200);

    console.log('\n  — Un no amigo no puede usar enlace directo para comentar —');
    const carla = await mkUser('carla');
    const tCarla = token(carla.id);
    const rCarlaComment = await call('POST', `/api/posts/${rFriends.data.id}/comment`, { tok: tCarla, body: { content: 'intento comentar' } });
    check('un no amigo no puede comentar un post FRIENDS → 404', rCarlaComment.status === 404);
  } finally {
    await cleanup();
  }

  return results;
};
