// Extracción y notificación de menciones @handle
const prisma = require('./prisma');
const { blockedWith } = require('./blocks');
const { crearNotificacion } = require('./notifications');

const HANDLE_REGEX = /(?:^|[^a-zA-Z0-9_.+-])@([a-z0-9][a-z0-9_]{1,19})/gi;

/**
 * Extrae los handles únicos encontrados en un texto.
 * @param {string} texto
 * @returns {string[]} Lista de handles en minúsculas sin la arroba
 */
function extraerHandles(texto) {
  if (!texto || typeof texto !== 'string') return [];
  const matches = [...texto.matchAll(HANDLE_REGEX)];
  return [...new Set(matches.map(m => m[1].toLowerCase()))];
}

/**
 * Notifica a los usuarios mencionados en un texto (post o comentario).
 * Descarta:
 *  - Al propio autor (no auto-notificarse)
 *  - Usuarios con bloqueos mutuos
 *  - Cuentas eliminadas
 *
 * @param {object} params
 * @param {string} params.texto - Contenido a analizar
 * @param {number} params.actorId - ID del autor
 * @param {string} [params.actorName] - Nombre del autor
 * @param {number} [params.postId] - ID del post del feed (si aplica)
 * @param {number} [params.commentId] - ID del comentario del feed (si aplica)
 * @param {number} [params.forumPostId] - ID del post de foro (si aplica)
 * @param {number} [params.forumCommentId] - ID del comentario de foro (si aplica)
 * @returns {Promise<Array>} Lista de usuarios notificados
 */
async function notificarMenciones({
  texto,
  actorId,
  actorName = null,
  postId = null,
  commentId = null,
  forumPostId = null,
  forumCommentId = null
}) {
  const handles = extraerHandles(texto);
  if (!handles.length) return [];

  try {
    const bloqueados = await blockedWith(actorId);
    const ignorarIds = new Set([actorId, ...bloqueados]);

    const destinatarios = await prisma.user.findMany({
      where: {
        handle: { in: handles, mode: 'insensitive' },
        deletedAt: null
      },
      select: { id: true, handle: true }
    });

    const validos = destinatarios.filter(u => !ignorarIds.has(u.id));
    if (!validos.length) return [];

    await Promise.all(
      validos.map(u =>
        crearNotificacion({
          type: 'MENTION',
          recipientId: u.id,
          actorId,
          actorName,
          postId,
          commentId,
          forumPostId,
          forumCommentId
        })
      )
    );

    return validos;
  } catch (error) {
    console.error('Error al procesar menciones:', error);
    return [];
  }
}

module.exports = {
  extraerHandles,
  notificarMenciones
};
