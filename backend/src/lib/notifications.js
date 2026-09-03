// Despachador central de notificaciones (In-App, WebSocket en vivo y Web Push)
const prisma = require('./prisma');
const { emitToUser } = require('./chatSocket');
const { enviarPush } = require('./pushService');

// El `include` de abajo trae post.content y comment.content completos. Eso era
// seguro mientras toda notificación con postId/commentId tuviera como
// destinatario al AUTOR (REPLY_POST, REACTION…). MENTION rompe esa invariante:
// el destinatario es un tercero. `notificarMenciones` ya filtra quién puede
// LEER el contenido al momento de notificar (capa 1), pero el include de acá
// se resuelve en caliente cada vez que se sirve la notificación — si el
// contenido se oculta por moderación DESPUÉS de notificar, seguiría saliendo
// completo. Opción elegida: (a) para MENTION específicamente — nunca viajar
// content en el payload, ni por WebSocket ni por REST. Se descartó (b)
// (recortar según lectura) porque exige repetir en cada lectura la misma
// consulta de amistad que la capa 1 ya hizo una vez, sin ganar nada a cambio.
// Los demás tipos (REPLY_POST, REACTION) sí necesitan el extracto — la
// campana (NotificationBell.jsx) lo muestra y su destinatario sigue siendo
// siempre el autor — así que no se tocan.
function sinContenidoDeMencion(n) {
  if (!n || n.type !== 'MENTION') return n;
  return {
    ...n,
    post: n.post ? { id: n.post.id } : n.post,
    comment: n.comment ? { id: n.comment.id } : n.comment
  };
}

/**
 * Crea una notificación, la emite por WebSocket si el usuario está conectado
 * y despacha Web Push en segundo plano si tiene suscripciones activas.
 *
 * @param {object} params
 * @param {string} params.type - Enum NotificationType
 * @param {number} params.recipientId - ID del destinatario
 * @param {number} params.actorId - ID de quien realiza la acción
 * @param {number} [params.postId] - Post del feed (opcional)
 * @param {number} [params.commentId] - Comentario del feed (opcional)
 * @param {number} [params.forumPostId] - Post del foro (opcional)
 * @param {number} [params.forumCommentId] - Comentario del foro (opcional)
 * @param {number} [params.subforumId] - Subforo (opcional)
 * @param {number} [params.chatId] - Chat (opcional)
 * @param {string} [params.reason] - Motivo de moderación (opcional)
 * @param {string} [params.actorName] - Nombre del actor (para armar el push sin consulta extra)
 * @param {string} [params.customUrl] - URL de destino directa (opcional)
 */
async function crearNotificacion({
  type,
  recipientId,
  actorId,
  postId = null,
  commentId = null,
  forumPostId = null,
  forumCommentId = null,
  subforumId = null,
  chatId = null,
  reason = null,
  actorName = null,
  customUrl = null
}) {
  if (!recipientId || recipientId === actorId) return null;

  try {
    const notificationCruda = await prisma.notification.create({
      data: {
        type,
        recipientId,
        actorId,
        postId,
        commentId,
        forumPostId,
        forumCommentId,
        subforumId,
        chatId,
        reason
      },
      include: {
        actor: { select: { id: true, name: true, avatar: true, handle: true } },
        subforum: { select: { id: true, name: true, slug: true } },
        forumPost: { select: { id: true, title: true, subforum: { select: { slug: true } } } },
        post: { select: { id: true, content: true } },
        comment: { select: { id: true, content: true } }
      }
    });
    const notification = sinContenidoDeMencion(notificationCruda);

    // 1. WebSocket en tiempo real si el usuario tiene sesión abierta
    emitToUser(recipientId, 'notification:new', notification);

    // 2. Web Push para navegadores en segundo plano / pantalla apagada
    const nombre = actorName || notification.actor?.name || (notification.actor?.handle ? '@' + notification.actor.handle : 'Alguien');
    let pushBody = 'Tienes una nueva interacción en WeedTown';
    let targetUrl = customUrl || '/';

    switch (type) {
      case 'CHAT_MESSAGE':
        pushBody = '💬 ' + nombre + ' te mandó un mensaje';
        targetUrl = '/chat';
        break;
      case 'POKE':
        pushBody = '🌿 ' + nombre + ' te mandó un toque 👋 desde Cerca';
        targetUrl = '/cerca';
        break;
      case 'FRIEND_REQUEST':
        pushBody = '👥 ' + nombre + ' te mandó una solicitud de amistad';
        targetUrl = notification.actor?.handle ? '/@' + notification.actor.handle : '/amigos';
        break;
      case 'FRIEND_ACCEPTED':
        pushBody = '🌿 ' + nombre + ' aceptó tu solicitud de amistad';
        targetUrl = notification.actor?.handle ? '/@' + notification.actor.handle : '/amigos';
        break;
      case 'REPLY_POST':
        pushBody = notification.forumPost
          ? nombre + ' respondió a tu post en el foro'
          : nombre + ' comentó en tu publicación';
        targetUrl = notification.forumPost?.subforum?.slug
          ? '/forum/' + notification.forumPost.subforum.slug + '/post/' + notification.forumPost.id
          : (notification.postId ? '/p/' + notification.postId : '/feed');
        break;
      case 'REPLY_COMMENT':
        pushBody = nombre + ' respondió a tu comentario';
        targetUrl = notification.forumPost?.subforum?.slug
          ? '/forum/' + notification.forumPost.subforum.slug + '/post/' + notification.forumPost.id
          : (notification.postId ? '/p/' + notification.postId : '/feed');
        break;
      case 'REACTION':
        pushBody = '🌿 A ' + nombre + ' le gustó tu publicación';
        targetUrl = notification.forumPost?.subforum?.slug
          ? '/forum/' + notification.forumPost.subforum.slug + '/post/' + notification.forumPost.id
          : (notification.postId ? '/p/' + notification.postId : '/feed');
        break;
      case 'NEW_SUBFORUM_POST':
        pushBody = 'Nuevo post en ' + (notification.subforum?.name || 'un subforo que sigues');
        targetUrl = notification.subforum?.slug ? '/forum/' + notification.subforum.slug : '/forum';
        break;
      case 'MENTION':
        pushBody = '📢 ' + nombre + ' te mencionó en una publicación';
        targetUrl = notification.forumPost?.subforum?.slug
          ? '/forum/' + notification.forumPost.subforum.slug + '/post/' + notification.forumPost.id
          : (notification.postId ? '/p/' + notification.postId : '/feed');
        break;
      case 'CONTENIDO_OCULTO':
        pushBody = 'Moderación retiró contenido tuyo';
        targetUrl = '/profile';
        break;
      case 'CUENTA_SUSPENDIDA':
        pushBody = 'Tu cuenta fue suspendida temporalmente';
        targetUrl = '/profile';
        break;
    }

    // Despacho no bloqueante
    enviarPush(recipientId, {
      title: 'WeedTown',
      body: pushBody,
      icon: '/logo.svg',
      url: targetUrl,
      data: { notificationId: notification.id, type }
    }).catch(() => {});

    return notification;
  } catch (error) {
    console.error('Error al crear y despachar notificación:', error);
    return null;
  }
}

module.exports = {
  crearNotificacion,
  sinContenidoDeMencion
};
