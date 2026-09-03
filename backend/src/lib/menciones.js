// Extracción y notificación de menciones @handle
const prisma = require('./prisma');
const { blockedWith } = require('./blocks');
const { areFriends } = require('./friends');
const { crearNotificacion } = require('./notifications');

// La misma guarda de carácter previo vive en
// frontend/src/components/ContenidoTexto.jsx:TOKEN_REGEX (ahí con lookbehind
// en vez de consumir el carácter, porque ese tokenizador necesita el índice
// exacto del '@'). Sin la guarda en los dos lados, un correo como
// hugo@gmail.com no notifica a nadie aquí, pero el frontend igual renderiza
// "@gmail" como enlace clicable — no hay paquete compartido entre los dos
// proyectos; si cambias una regla, cambia la otra.
const HANDLE_REGEX = /(?:^|[^a-zA-Z0-9_.+-])@([a-z0-9][a-z0-9_]{1,19})/gi;

// Con el tope de 2000 caracteres de un posteo caben ~200 menciones: sin este
// límite, una sola petición dispara 200 notificaciones, 200 emisiones por
// WebSocket y 200 envíos push — y el limitador global no lo ve, porque cuenta
// peticiones, no destinatarios. El resto se sigue viendo como enlace al
// renderizar; simplemente no notifica. Vive aquí, no en `extraerHandles`,
// porque esa extracción también alimenta el resaltado del texto completo.
const MAX_MENCIONES_NOTIFICADAS = 10;

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
 *  - A quien no puede LEER el contenido donde se le mencionó (ver `alcance`)
 *
 * @param {object} params
 * @param {string} params.texto - Contenido a analizar
 * @param {number} params.actorId - ID del autor
 * @param {string} [params.actorName] - Nombre del autor
 * @param {number} [params.postId] - ID del post del feed (si aplica)
 * @param {number} [params.commentId] - ID del comentario del feed (si aplica)
 * @param {number} [params.forumPostId] - ID del post de foro (si aplica)
 * @param {number} [params.forumCommentId] - ID del comentario de foro (si aplica)
 * @param {object} [params.alcance] - Quién puede leer el contenido mencionado.
 *   Lo arma quien llama, con el objeto que ya tiene en mano (no se vuelve a
 *   leer el post/comentario aquí: una segunda lectura abre una carrera).
 * @param {boolean} [params.alcance.hidden] - Si el contenido ya está oculto
 *   por moderación, no se notifica a nadie.
 * @param {'PUBLIC'|'FRIENDS'} [params.alcance.visibility] - Alcance del post
 *   del feed. Con 'FRIENDS', solo el propio autor o sus amigos pueden leerlo.
 *   El foro no tiene niveles de visibilidad propios (ver forumPrivacidad.test.js):
 *   cualquier cuenta autenticada y sin bloqueo puede leerlo, así que ahí basta
 *   con `hidden`.
 * @param {number} [params.alcance.authorId] - Autor del post/comentario padre,
 *   contra quien se evalúa la amistad cuando `visibility === 'FRIENDS'` — no
 *   contra `actorId`: en un comentario, quien comenta no es quien fija el
 *   alcance de lectura, el autor del post sí.
 * @returns {Promise<Array>} Lista de usuarios notificados
 */
async function notificarMenciones({
  texto,
  actorId,
  actorName = null,
  postId = null,
  commentId = null,
  forumPostId = null,
  forumCommentId = null,
  alcance = null
}) {
  // Se conserva el orden de aparición en el texto: quedarse con "las
  // primeras" significa las primeras que escribió quien menciona, no las que
  // devuelva la base en el `findMany` de abajo (Prisma no garantiza ese orden).
  const handles = extraerHandles(texto).slice(0, MAX_MENCIONES_NOTIFICADAS);
  if (!handles.length) return [];
  if (alcance?.hidden) return [];

  try {
    const bloqueados = await blockedWith(actorId);
    const ignorarIds = new Set([actorId, ...bloqueados]);

    const destinatarios = await prisma.user.findMany({
      where: {
        handle: { in: handles },
        deletedAt: null
      },
      select: { id: true, handle: true }
    });

    let candidatos = destinatarios.filter(u => !ignorarIds.has(u.id));
    if (!candidatos.length) return [];

    if (alcance?.visibility === 'FRIENDS') {
      const autorId = alcance.authorId;
      const puedeLeer = await Promise.all(
        candidatos.map(u => (u.id === autorId ? true : areFriends(autorId, u.id)))
      );
      candidatos = candidatos.filter((_, i) => puedeLeer[i]);
    }
    if (!candidatos.length) return [];

    await Promise.all(
      candidatos.map(u =>
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

    return candidatos;
  } catch (error) {
    console.error('Error al procesar menciones:', error);
    return [];
  }
}

module.exports = {
  extraerHandles,
  notificarMenciones
};
