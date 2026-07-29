// Notificaciones del feed principal, reacciones y chat (HU-NOT-002).
//
// El centro de notificaciones ya existía para foro, toques y amistad — pero
// comentar/reaccionar en el feed y mandar un mensaje de chat nunca creaban una
// fila en Notification, así que quien no estaba viendo esa pantalla en ese
// instante exacto no se enteraba de nada. Esta suite cubre que ahora sí, con
// las mismas reglas de discreción del resto del sistema: nunca a uno mismo, y
// el chat colapsa mensajes seguidos en una sola notificación sin leer.
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Notificaciones', 'wtnotif');

  await cleanup();
  try {
    console.log('\n  — Comentar un post ajeno notifica (REPLY_POST) —');
    const ana = await mkUser('ana');
    const beto = await mkUser('beto');
    const tAna = token(ana.id);
    const tBeto = token(beto.id);

    let r = await call('POST', '/api/posts', { tok: tAna, body: { content: 'wtnotif post de ana' } });
    const postAna = r.data.id;

    await call('POST', `/api/posts/${postAna}/comment`, { tok: tBeto, body: { content: 'comentario de beto' } });
    let notif = await prisma.notification.findFirst({ where: { type: 'REPLY_POST', recipientId: ana.id, actorId: beto.id, postId: postAna } });
    check('a Ana le llega REPLY_POST con el postId correcto', Boolean(notif));

    await call('POST', `/api/posts/${postAna}/comment`, { tok: tAna, body: { content: 'comentario de la propia autora' } });
    const totalReplyPost = await prisma.notification.count({ where: { type: 'REPLY_POST', postId: postAna, actorId: ana.id } });
    check('comentar tu propio post no te notifica a ti mismo', totalReplyPost === 0);

    console.log('\n  — Reaccionar a un post ajeno notifica (REACTION), quitarla no —');
    r = await call('POST', `/api/posts/${postAna}/reaction`, { tok: tBeto, body: { type: 'LIKE' } });
    check('reaccionar responde 200', r.status === 200, `(fue ${r.status})`);
    let reacciones = await prisma.notification.count({ where: { type: 'REACTION', recipientId: ana.id, actorId: beto.id, postId: postAna } });
    check('genera exactamente 1 notificación REACTION', reacciones === 1, `(fueron ${reacciones})`);

    // Misma reacción de nuevo = toggle OFF (se quita) — no debe sumar otra
    await call('POST', `/api/posts/${postAna}/reaction`, { tok: tBeto, body: { type: 'LIKE' } });
    reacciones = await prisma.notification.count({ where: { type: 'REACTION', recipientId: ana.id, actorId: beto.id, postId: postAna } });
    check('quitar la reacción no genera una notificación nueva', reacciones === 1, `(fueron ${reacciones})`);

    // Reaccionar de nuevo (esta vez sí se agrega) sí debe notificar otra vez
    await call('POST', `/api/posts/${postAna}/reaction`, { tok: tBeto, body: { type: 'ROLA' } });
    reacciones = await prisma.notification.count({ where: { type: 'REACTION', recipientId: ana.id, actorId: beto.id, postId: postAna } });
    check('volver a reaccionar sí notifica de nuevo', reacciones === 2, `(fueron ${reacciones})`);

    await call('POST', `/api/posts/${postAna}/reaction`, { tok: tAna, body: { type: 'LIKE' } });
    const autoReaccion = await prisma.notification.count({ where: { type: 'REACTION', postId: postAna, actorId: ana.id, recipientId: ana.id } });
    check('reaccionar a tu propio post no te notifica', autoReaccion === 0);

    console.log('\n  — Reaccionar a un comentario ajeno notifica con commentId —');
    r = await call('POST', `/api/posts/${postAna}/comment`, { tok: tBeto, body: { content: 'wtnotif comentario reaccionable' } });
    const commentId = r.data.id;
    await call('POST', `/api/comments/${commentId}/reaction`, { tok: tAna, body: { type: 'INTERESA' } });
    notif = await prisma.notification.findFirst({ where: { type: 'REACTION', recipientId: beto.id, actorId: ana.id, commentId } });
    check('a Beto le llega REACTION con el commentId correcto', Boolean(notif));

    console.log('\n  — Mensajes de chat notifican y se colapsan (HU-NOT-002) —');
    r = await call('POST', '/api/chat/conversations', { tok: tAna, body: { userId: beto.id } });
    const chatId = r.data.id;

    await call('POST', `/api/chat/conversations/${chatId}/messages`, { tok: tAna, body: { content: 'hola beto' } });
    let chatNotifs = await prisma.notification.count({ where: { type: 'CHAT_MESSAGE', chatId, recipientId: beto.id, actorId: ana.id } });
    check('el primer mensaje genera 1 notificación', chatNotifs === 1, `(fueron ${chatNotifs})`);

    await call('POST', `/api/chat/conversations/${chatId}/messages`, { tok: tAna, body: { content: 'sigues ahí?' } });
    await call('POST', `/api/chat/conversations/${chatId}/messages`, { tok: tAna, body: { content: 'holaaa' } });
    chatNotifs = await prisma.notification.count({ where: { type: 'CHAT_MESSAGE', chatId, recipientId: beto.id, actorId: ana.id } });
    check('una ráfaga de mensajes se colapsa en la misma notificación sin leer', chatNotifs === 1, `(fueron ${chatNotifs})`);

    await prisma.notification.updateMany({ where: { type: 'CHAT_MESSAGE', chatId, recipientId: beto.id }, data: { readAt: new Date() } });
    await call('POST', `/api/chat/conversations/${chatId}/messages`, { tok: tAna, body: { content: 'otra vez yo' } });
    chatNotifs = await prisma.notification.count({ where: { type: 'CHAT_MESSAGE', chatId, recipientId: beto.id, actorId: ana.id } });
    check('tras leer la anterior, el siguiente mensaje sí genera una nueva', chatNotifs === 2, `(fueron ${chatNotifs})`);

    console.log('\n  — GET /api/notifications trae el contexto del feed —');
    // La reacción al comentario fue de Ana sobre el comentario de Beto: la
    // notificación es de BETO (el destinatario), no de Ana (quien reaccionó).
    r = await call('GET', '/api/notifications', { tok: tBeto });
    check('responde 200', r.status === 200, `(fue ${r.status})`);
    const reaccionListada = r.data.notifications.find(n => n.type === 'REACTION' && n.commentId === commentId);
    check('trae el comentario con su contenido para dar contexto', reaccionListada?.comment?.content === 'wtnotif comentario reaccionable');
  } finally {
    await cleanup();
  }

  return results;
};
