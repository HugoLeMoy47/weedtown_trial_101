// Exportación y eliminación de la cuenta propia (HU-PRIV-001).
//
// Distinto de moderación: acá el dueño de sus datos ejerce su derecho a que
// se le anonimicen — no hay nada que investigar, así que no aplica la lógica
// de "nunca se borra nada" que sí rige para ocultar contenido reportado.
//
// Aun así NO se borran las filas de contenido (posts, comentarios, mensajes):
// siguen siendo parte de conversaciones de otras personas, y borrarlas de
// golpe dejaría hilos rotos y respuestas huérfanas. En cambio se ANONIMIZA el
// User: como author/sender/etc. en todo lo demás son relaciones a esa misma
// fila, todo su historial pasa a mostrarse como "Cuenta eliminada" sin tocar
// una sola fila de Post, Comment, Message, etc.
const crypto = require('crypto');
const prisma = require('./prisma');
const { log } = require('./logger');

const CAMPOS_ANONIMIZADOS = {
  displayName: null,
  email: null,
  avatar: null,
  mastodonAvatar: null,
  phone: null,
  fullName: null,
  bio: null,
  aboutMe: null,
  age: null,
  birthdate: null,
  gender: null,
  nearbyCell: null,
  nearbyUpdatedAt: null,
  role: 'USER'
};

/**
 * Junta lo que la persona puede pedirse a sí misma: perfil, contenido propio
 * y las filas donde participa. No incluye material interno de otros
 * proveedores (como la clave pública de una passkey): eso es un artefacto de
 * seguridad, no un dato personal que portar.
 */
async function exportarDatos(userId) {
  const [
    user, identities, posts, comments, forumPosts, forumComments,
    blocksMade, blocksReceived, reportsMade, subforumsCreadas, siguiendo,
    mensajesEnviados, notificaciones
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, handle: true, displayName: true, email: true, name: true,
        phone: true, fullName: true, bio: true, aboutMe: true, age: true, birthdate: true, gender: true,
        createdAt: true
      }
    }),
    prisma.identity.findMany({
      where: { userId },
      select: { provider: true, instance: true, originHandle: true, createdAt: true, lastLoginAt: true }
    }),
    prisma.post.findMany({ where: { authorId: userId }, select: { id: true, content: true, image: true, createdAt: true } }),
    prisma.comment.findMany({ where: { authorId: userId }, select: { id: true, postId: true, content: true, createdAt: true } }),
    prisma.forumPost.findMany({ where: { authorId: userId }, select: { id: true, subforumId: true, title: true, content: true, createdAt: true } }),
    prisma.forumComment.findMany({ where: { authorId: userId }, select: { id: true, postId: true, content: true, createdAt: true } }),
    prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true, createdAt: true } }),
    prisma.block.findMany({ where: { blockedId: userId }, select: { blockerId: true, createdAt: true } }),
    prisma.report.findMany({ where: { reporterId: userId }, select: { targetType: true, reason: true, status: true, createdAt: true } }),
    prisma.subForum.findMany({ where: { creatorId: userId }, select: { name: true, slug: true, createdAt: true } }),
    prisma.subForumFollow.findMany({ where: { userId }, select: { subforumId: true, createdAt: true } }),
    // Solo lo que ESTA persona escribió: los mensajes recibidos son en parte
    // el contenido de alguien más, que no le corresponde exportar a ella.
    prisma.message.findMany({
      where: { senderId: userId },
      select: { chatId: true, content: true, createdAt: true }
    }),
    prisma.notification.findMany({
      where: { recipientId: userId },
      select: { type: true, createdAt: true, readAt: true }
    })
  ]);

  return {
    generadoEl: new Date().toISOString(),
    perfil: user,
    metodosDeAcceso: identities,
    posts, comentarios: comments,
    forumPosts, forumComentarios: forumComments,
    bloqueosHechos: blocksMade, bloqueosRecibidos: blocksReceived,
    reportesHechos: reportsMade,
    subforosCreados: subforumsCreadas, subforosSeguidos: siguiendo,
    mensajesEnviados,
    notificaciones
  };
}

/**
 * Anonimiza la cuenta: la fila de User se queda (todo lo que la referencia
 * sigue apuntando a algo válido) pero deja de identificar a nadie. Borra lo
 * que sí es exclusivamente suyo y no tiene sentido conservar (identidades de
 * acceso, bloqueos, notificaciones propias, follows) porque nunca podrá
 * volver a entrar para gestionarlo.
 * @returns {Promise<string>} el nuevo handle anonimizado
 */
async function anonimizarCuenta(userId) {
  const handleAnonimo = `borrado_${userId}_${crypto.randomBytes(3).toString('hex')}`;

  await prisma.$transaction([
    prisma.identity.deleteMany({ where: { userId } }), // Passkey cae en cascada con su Identity
    prisma.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } }),
    prisma.friendRequest.deleteMany({ where: { OR: [{ requesterId: userId }, { addresseeId: userId }] } }),
    prisma.subForumFollow.deleteMany({ where: { userId } }),
    // Solo su bandeja de entrada: una notificación donde ES el actor le
    // pertenece en parte a quien la recibió, no se borra.
    prisma.notification.deleteMany({ where: { recipientId: userId } }),
    prisma.user.update({
      where: { id: userId },
      data: { ...CAMPOS_ANONIMIZADOS, handle: handleAnonimo, name: 'Cuenta eliminada', deletedAt: new Date() }
    }),
    prisma.privacyAction.create({ data: { userId, type: 'ELIMINAR_CUENTA' } })
  ]);

  log('privacidad_eliminar_cuenta', { userId });
  return handleAnonimo;
}

module.exports = { exportarDatos, anonimizarCuenta };
