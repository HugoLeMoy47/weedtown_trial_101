// Kit de seguridad de la persona usuaria (HU-SEG-001 a 004).
// Cubre los tres bloqueantes: rutas de admin cerradas, toque con reciprocidad y
// cercanía verificadas, y bloqueo con efecto mutuo sobre todas las vías de contacto.
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Seguridad', 'wtseg');

  await cleanup();
  try {
    const ana = await mkUser('ana');
    const beto = await mkUser('beto');
    const lejos = await mkUser('lejos');
    const mod = await mkUser('mod', { role: 'MOD' });
    const tAna = token(ana.id), tBeto = token(beto.id), tMod = token(mod.id);

    console.log('\n  — Rutas de admin y market cerradas —');
    check('/api/admin/users sin token → 401', (await call('GET', '/api/admin/users')).status === 401);
    let r = await call('GET', '/api/admin/users', { tok: tAna });
    check('/api/admin/users con rol USER → 403', r.status === 403, `(fue ${r.status})`);
    r = await call('GET', '/api/admin/users', { tok: tMod });
    check('/api/admin/users con rol MOD → 200', r.status === 200, `(fue ${r.status})`);
    check('/api/admin/moderate sin token → 401', (await call('POST', '/api/admin/moderate')).status === 401);
    check('/api/market sin token → 401', (await call('GET', '/api/market')).status === 401);

    console.log('\n  — El toque exige zona propia y cercanía —');
    r = await call('POST', '/api/nearby/poke', { tok: tAna, body: { userId: beto.id } });
    check('sin compartir zona → 403', r.status === 403, `(fue ${r.status})`);

    // Ana y Beto en la misma celda; "lejos" a 40 celdas (~80 km)
    const CELL = '5000_8000';
    await call('PUT', '/api/nearby/location', { tok: tAna, body: { cell: CELL } });
    await call('PUT', '/api/nearby/location', { tok: tBeto, body: { cell: CELL } });
    await call('PUT', '/api/nearby/location', { tok: token(lejos.id), body: { cell: '5040_8000' } });

    r = await call('POST', '/api/nearby/poke', { tok: tAna, body: { userId: lejos.id } });
    check('a alguien fuera de la cuadrícula → 404', r.status === 404, `(fue ${r.status})`);
    r = await call('POST', '/api/nearby/poke', { tok: tAna, body: { userId: 999999999 } });
    check('a un userId inexistente → 404 (misma respuesta: no delata)', r.status === 404, `(fue ${r.status})`);

    r = await call('POST', '/api/nearby/poke', { tok: tAna, body: { userId: beto.id } });
    check('a alguien en tu celda → 200', r.status === 200, `(fue ${r.status})`);
    const notis = await prisma.notification.count({ where: { type: 'POKE', actorId: ana.id, recipientId: beto.id } });
    check('generó exactamente 1 notificación POKE', notis === 1, `(fueron ${notis})`);
    r = await call('POST', '/api/nearby/poke', { tok: tAna, body: { userId: beto.id } });
    check('segundo toque seguido → 429 (cooldown de 12 h)', r.status === 429, `(fue ${r.status})`);

    // Regresión del bloqueante: recorrer ids consecutivos sin compartir zona no
    // debe generar ni una sola notificación.
    const sinZona = await mkUser('sinzona');
    const tSinZona = token(sinZona.id);
    for (const objetivo of [ana.id, beto.id, lejos.id, mod.id]) {
      await call('POST', '/api/nearby/poke', { tok: tSinZona, body: { userId: objetivo } });
    }
    const spam = await prisma.notification.count({ where: { actorId: sinZona.id } });
    check('recorrer userIds sin zona activa no genera notificaciones', spam === 0, `(generó ${spam})`);

    console.log('\n  — Bloquear corta todas las vías —');
    const postBeto = await prisma.post.create({ data: { content: 'wtseg post de beto', authorId: beto.id } });
    const chat = await call('POST', '/api/chat/conversations', { tok: tAna, body: { userId: beto.id } });
    check('Ana abre chat con Beto → 200', chat.status === 200, `(fue ${chat.status})`);
    await call('POST', `/api/chat/conversations/${chat.data.id}/messages`, { tok: tAna, body: { content: 'hola' } });

    let nearby = await call('GET', '/api/nearby', { tok: tAna });
    check('Beto aparece en Cerca antes de bloquear', nearby.data.people.some(p => p.id === beto.id));

    r = await call('POST', '/api/blocks', { tok: tAna, body: { userId: beto.id } });
    check('Ana bloquea a Beto → 200', r.status === 200, `(fue ${r.status})`);

    nearby = await call('GET', '/api/nearby', { tok: tAna });
    check('Beto ya no sale en Cerca de Ana', !nearby.data.people.some(p => p.id === beto.id));
    nearby = await call('GET', '/api/nearby', { tok: tBeto });
    check('Ana ya no sale en Cerca de Beto (efecto mutuo)', !nearby.data.people.some(p => p.id === ana.id));

    r = await call('POST', '/api/nearby/poke', { tok: tBeto, body: { userId: ana.id } });
    check('Beto ya no puede mandarle un toque a Ana → 404', r.status === 404, `(fue ${r.status})`);

    r = await call('GET', '/api/chat/conversations', { tok: tBeto });
    check('la conversación desaparece de la lista de Beto', !r.data.conversations.some(c => c.id === chat.data.id));
    r = await call('POST', `/api/chat/conversations/${chat.data.id}/messages`, { tok: tBeto, body: { content: '¿sigues ahí?' } });
    check('Beto no puede escribir en el chat → 404', r.status === 404, `(fue ${r.status})`);
    r = await call('GET', `/api/chat/conversations/${chat.data.id}/messages`, { tok: tBeto });
    check('Beto no puede leer el hilo → 404', r.status === 404, `(fue ${r.status})`);
    r = await call('POST', '/api/chat/conversations', { tok: tBeto, body: { userId: ana.id } });
    check('Beto no puede reabrir chat con Ana → 404', r.status === 404, `(fue ${r.status})`);
    r = await call('GET', '/api/chat/users?q=wtseg', { tok: tAna });
    check('Beto no aparece en la búsqueda de personas de Ana', !r.data.users.some(u => u.id === beto.id));

    r = await call('GET', '/api/posts', { tok: tAna });
    check('el post de Beto no sale en el feed de Ana', !r.data.posts.some(p => p.id === postBeto.id));
    r = await call('GET', '/api/posts');
    check('el post de Beto sí sale para quien no lo bloqueó', r.data.posts.some(p => p.id === postBeto.id));
    r = await call('GET', '/api/posts/search?q=wtseg', { tok: tAna });
    check('el post de Beto tampoco sale en la búsqueda de Ana', !r.data.results.some(p => p.id === postBeto.id));
    r = await call('POST', `/api/posts/${postBeto.id}/comment`, { tok: tAna, body: { content: 'hola' } });
    check('Ana no puede comentar el post de Beto → 404', r.status === 404, `(fue ${r.status})`);

    r = await call('GET', `/api/profile/${beto.id}`, { tok: tAna });
    check('el perfil de Beto es 404 para Ana', r.status === 404, `(fue ${r.status})`);
    // Ciclo 10A: el perfil dejó de resolverse sin sesión (reciprocidad de
    // exposición). Esta línea afirmaba 200 hasta entonces.
    r = await call('GET', `/api/profile/${beto.id}`);
    check('sin sesión, el perfil de Beto ya no se resuelve → 401', r.status === 401, `(fue ${r.status})`);

    const entreAmbos = await prisma.notification.count({
      where: { OR: [{ recipientId: beto.id, actorId: ana.id }, { recipientId: ana.id, actorId: beto.id }] }
    });
    check('se borraron las notificaciones entre ambos, en las dos direcciones', entreAmbos === 0, `(quedan ${entreAmbos})`);

    r = await call('GET', '/api/blocks', { tok: tAna });
    check('Ana ve a Beto en su lista de bloqueos', r.data.blocks.some(b => b.id === beto.id));
    r = await call('GET', '/api/blocks', { tok: tBeto });
    check('Beto no ve nada: el bloqueo se gestiona de un solo lado', r.data.blocks.length === 0);

    r = await call('POST', '/api/blocks', { tok: tAna, body: { userId: beto.id } });
    check('bloquear dos veces es idempotente → 200', r.status === 200, `(fue ${r.status})`);
    r = await call('POST', '/api/blocks', { tok: tAna, body: { userId: ana.id } });
    check('no puedes bloquearte a ti → 400', r.status === 400, `(fue ${r.status})`);

    console.log('\n  — Desbloquear revierte —');
    r = await call('DELETE', `/api/blocks/${beto.id}`, { tok: tAna });
    check('Ana desbloquea → 200', r.status === 200, `(fue ${r.status})`);
    r = await call('GET', '/api/posts', { tok: tAna });
    check('el post de Beto vuelve al feed de Ana', r.data.posts.some(p => p.id === postBeto.id));
    nearby = await call('GET', '/api/nearby', { tok: tAna });
    check('Beto vuelve a aparecer en Cerca', nearby.data.people.some(p => p.id === beto.id));
    r = await call('DELETE', `/api/blocks/${beto.id}`, { tok: tAna });
    check('desbloquear dos veces es idempotente → 200', r.status === 200, `(fue ${r.status})`);
  } finally {
    await cleanup();
  }

  return results;
};
