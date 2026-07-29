// Amistad entre personas y alcance de publicaciones (HU-AMI-001/002/003).
//
// Cubre el ciclo completo de solicitud→aceptación, el caso de solicitudes
// cruzadas (A le pide a B lo mismo que B ya le había pedido a A), que
// bloquear deshaga la amistad, y que el feed/los comentarios respeten el
// alcance "solo amigos".
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Amistad', 'wtami');

  await cleanup();
  try {
    console.log('\n  — Enviar y aceptar una solicitud —');
    const ana = await mkUser('ana');
    const beto = await mkUser('beto');
    const tAna = token(ana.id);
    const tBeto = token(beto.id);

    let r = await call('POST', `/api/friends/request/${beto.id}`, { tok: tAna });
    check('enviar solicitud responde 200 con status pending', r.status === 200 && r.data.status === 'pending', `(fue ${r.status}/${r.data?.status})`);

    r = await call('POST', `/api/friends/request/${beto.id}`, { tok: tAna });
    check('repetir la misma solicitud → 409', r.status === 409, `(fue ${r.status})`);

    r = await call('GET', '/api/friends/requests', { tok: tBeto });
    check('a Beto le llega en "recibidas"', r.data.recibidas?.some(s => s.user.id === ana.id));
    const solicitudId = r.data.recibidas.find(s => s.user.id === ana.id).id;

    r = await call('GET', '/api/friends/requests', { tok: tAna });
    check('a Ana le sale en "enviadas"', r.data.enviadas?.some(s => s.user.id === beto.id));

    r = await call('POST', `/api/friends/accept/${solicitudId}`, { tok: tBeto });
    check('Beto acepta → 200 status accepted', r.status === 200 && r.data.status === 'accepted', `(fue ${r.status})`);

    const notifAceptada = await prisma.notification.findFirst({
      where: { type: 'FRIEND_ACCEPTED', recipientId: ana.id, actorId: beto.id }
    });
    check('Ana recibe notificación de aceptación', Boolean(notifAceptada));

    r = await call('GET', '/api/friends', { tok: tAna });
    check('Ana ve a Beto en su lista de amigos', r.data.friends?.some(f => f.user.id === beto.id));
    r = await call('GET', '/api/friends', { tok: tBeto });
    check('la amistad es simétrica: Beto también ve a Ana', r.data.friends?.some(f => f.user.id === ana.id));

    console.log('\n  — No se puede repetir ni auto-agregarse —');
    r = await call('POST', `/api/friends/request/${beto.id}`, { tok: tAna });
    check('pedirle amistad a quien ya es tu amigo → 409', r.status === 409, `(fue ${r.status})`);
    r = await call('POST', `/api/friends/request/${ana.id}`, { tok: tAna });
    check('agregarte a ti mismo → 400', r.status === 400, `(fue ${r.status})`);

    console.log('\n  — Rechazar y volver a intentar —');
    const carla = await mkUser('carla');
    const tCarla = token(carla.id);
    r = await call('POST', `/api/friends/request/${carla.id}`, { tok: tAna });
    const solicitudCarla = r.data.friendRequest.id;
    r = await call('POST', `/api/friends/reject/${solicitudCarla}`, { tok: tCarla });
    check('Carla rechaza → 200', r.status === 200 && r.data.status === 'rejected', `(fue ${r.status})`);

    r = await call('POST', `/api/friends/request/${carla.id}`, { tok: tAna });
    check('tras el rechazo, Ana puede volver a intentarlo → pending', r.status === 200 && r.data.status === 'pending', `(fue ${r.status}/${r.data?.status})`);

    console.log('\n  — Solicitudes cruzadas se auto-aceptan —');
    const dana = await mkUser('dana');
    const tDana = token(dana.id);
    r = await call('POST', `/api/friends/request/${dana.id}`, { tok: tCarla }); // Carla → Dana
    check('Carla le manda solicitud a Dana', r.status === 200 && r.data.status === 'pending');
    r = await call('POST', `/api/friends/request/${carla.id}`, { tok: tDana }); // Dana → Carla, cruzada
    check('Dana le pide lo mismo a Carla → se acepta directo', r.status === 200 && r.data.status === 'accepted', `(fue ${r.status}/${r.data?.status})`);
    r = await call('GET', '/api/friends', { tok: tDana });
    check('quedan amigas sin que nadie más apruebe nada', r.data.friends?.some(f => f.user.id === carla.id));

    console.log('\n  — Deshacer amistad —');
    r = await call('DELETE', `/api/friends/${beto.id}`, { tok: tAna });
    check('Ana deshace la amistad con Beto → 200', r.status === 200, `(fue ${r.status})`);
    r = await call('GET', '/api/friends', { tok: tAna });
    check('ya no aparece en la lista de ninguno de los dos', !r.data.friends?.some(f => f.user.id === beto.id));
    r = await call('GET', '/api/friends', { tok: tBeto });
    check('tampoco del lado de Beto', !r.data.friends?.some(f => f.user.id === ana.id));

    console.log('\n  — Bloquear deshace la amistad (HU-AMI-005) —');
    r = await call('POST', `/api/friends/request/${dana.id}`, { tok: tCarla });
    // Carla y Dana ya son amigas de la ronda cruzada de arriba; verificamos que
    // sigue así antes de bloquear, para que el bloqueo sea lo único que cambie.
    r = await call('GET', '/api/friends', { tok: tCarla });
    check('previo al bloqueo, Carla y Dana son amigas', r.data.friends?.some(f => f.user.id === dana.id));

    r = await call('POST', '/api/blocks', { tok: tCarla, body: { userId: dana.id } });
    check('Carla bloquea a Dana → 200', r.status === 200, `(fue ${r.status})`);

    const vinculo = await prisma.friendRequest.findFirst({
      where: { OR: [{ requesterId: carla.id, addresseeId: dana.id }, { requesterId: dana.id, addresseeId: carla.id }] }
    });
    check('no queda ninguna fila de FriendRequest entre ellas', vinculo === null);

    console.log('\n  — Alcance de publicaciones: solo amigos —');
    const emma = await mkUser('emma');
    const tEmma = token(emma.id);
    // Emma y Ana se hacen amigas para probar el lado positivo
    r = await call('POST', `/api/friends/request/${ana.id}`, { tok: tEmma });
    const solEmmaAna = r.data.friendRequest.id;
    await call('POST', `/api/friends/accept/${solEmmaAna}`, { tok: tAna });

    r = await call('POST', '/api/posts', { tok: tEmma, body: { content: 'wtami post solo amigos', visibility: 'FRIENDS' } });
    check('crear un post FRIENDS responde 200 con visibility FRIENDS', r.status === 200 && r.data.visibility === 'FRIENDS', `(fue ${r.status}/${r.data?.visibility})`);
    const postAmigos = r.data.id;

    r = await call('GET', '/api/posts?page=1', { tok: tAna });
    check('su amiga Ana SÍ lo ve en el feed', r.data.posts?.some(p => p.id === postAmigos));

    r = await call('GET', '/api/posts?page=1', { tok: tBeto });
    check('un conocido (Beto, sin amistad) NO lo ve en el feed', !r.data.posts?.some(p => p.id === postAmigos));

    r = await call('GET', '/api/posts?page=1');
    check('tampoco lo ve alguien sin sesión', !r.data.posts?.some(p => p.id === postAmigos));

    r = await call('GET', '/api/posts?page=1', { tok: tEmma });
    check('la propia autora sí lo ve', r.data.posts?.some(p => p.id === postAmigos));

    r = await call('GET', `/api/posts/search?q=${encodeURIComponent('wtami post solo amigos')}`, { tok: tBeto });
    check('tampoco aparece en la búsqueda para un no-amigo', !r.data.results?.some(p => p.id === postAmigos));

    r = await call('POST', `/api/posts/${postAmigos}/comment`, { tok: tBeto, body: { content: 'intento comentar' } });
    check('un no-amigo no puede comentarlo → 404', r.status === 404, `(fue ${r.status})`);

    r = await call('POST', `/api/posts/${postAmigos}/comment`, { tok: tAna, body: { content: 'comentario de una amiga' } });
    check('una amiga sí puede comentarlo → 200', r.status === 200, `(fue ${r.status})`);

    console.log('\n  — Un post público sigue siendo de todos —');
    r = await call('POST', '/api/posts', { tok: tEmma, body: { content: 'wtami post publico' } });
    check('sin visibility explícito, el default es PUBLIC', r.data.visibility === 'PUBLIC');
    r = await call('GET', '/api/posts?page=1', { tok: tBeto });
    check('cualquiera lo ve, sea o no amigo', r.data.posts?.some(p => p.id === r.data.posts.find(x => x.content === 'wtami post publico')?.id));

    r = await call('POST', '/api/posts', { tok: tEmma, body: { content: 'x', visibility: 'INVALIDO' } });
    check('un visibility inválido → 400', r.status === 400, `(fue ${r.status})`);
  } finally {
    await cleanup();
  }

  return results;
};
