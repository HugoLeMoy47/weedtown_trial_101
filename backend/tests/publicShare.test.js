const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup } = suite('PublicShare', 'wtshare');

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

    const rPublicAnonComments = await call('GET', `/api/posts/${rPublic.data.id}/comments`);
    check('comentarios de post público se pueden listar sin sesión', rPublicAnonComments.status === 200);

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
