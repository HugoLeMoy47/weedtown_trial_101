// Reglas compartidas de moderación (HU-SEG-002 y HU-SEG-005).
//
// Tres decisiones de producto que este archivo materializa:
//   1. Ocultar es REVERSIBLE y deja rastro. No existe borrado definitivo por
//      moderación: perder el contenido es perder la evidencia del reporte.
//   2. A la persona moderada SE LE AVISA con el motivo — pero nunca se le dice
//      quién reportó ni qué moderador actuó.
//   3. El chat privado no es moderable: no aparece en ReportTargetType.
const prisma = require('./prisma');

const MOTIVOS = ['SPAM', 'ACOSO', 'ODIO', 'ILEGAL', 'DESINFORMACION', 'SEXUAL', 'SUPLANTACION', 'OTRO'];

// Texto que ve la persona moderada. Es fijo por motivo: la misma conducta recibe
// siempre la misma explicación, y el moderador no redacta mensajes a mano.
const MOTIVO_TEXTO = {
  SPAM: 'Spam o publicación repetitiva',
  ACOSO: 'Acoso o ataque personal',
  ODIO: 'Discurso de odio o discriminación',
  ILEGAL: 'Actividad ilegal (incluida la compraventa de sustancias)',
  DESINFORMACION: 'Desinformación que pone en riesgo la salud',
  SEXUAL: 'Contenido sexual no solicitado',
  SUPLANTACION: 'Suplantación de identidad',
  OTRO: 'Incumplimiento de las normas de la comunidad'
};

// Qué se puede reportar y con qué columna se enlaza. El chat NO está aquí, a
// propósito: moderarlo obligaría a leer mensajes 1 a 1.
// `autor` es la columna que identifica a quien responde por el objeto. No es
// siempre "authorId": un subforo tiene creatorId, y una cuenta se responde a sí
// misma (null). Sin esta distinción, consultar un subforo por authorId revienta.
const OBJETIVOS = {
  POST: { campo: 'postId', modelo: 'post', autor: 'authorId' },
  COMMENT: { campo: 'commentId', modelo: 'comment', autor: 'authorId' },
  FORUM_POST: { campo: 'forumPostId', modelo: 'forumPost', autor: 'authorId' },
  FORUM_COMMENT: { campo: 'forumCommentId', modelo: 'forumComment', autor: 'authorId' },
  USER: { campo: 'targetUserId', modelo: 'user', autor: null },
  SUBFORUM: { campo: 'subforumId', modelo: 'subForum', autor: 'creatorId' }
};

// Los objetivos que se ocultan (los demás se suspenden o se archivan)
const OCULTABLES = ['POST', 'COMMENT', 'FORUM_POST', 'FORUM_COMMENT'];

const esMotivoValido = (m) => MOTIVOS.includes(m);
const esObjetivoValido = (t) => Object.keys(OBJETIVOS).includes(t);

/** Solo el contenido visible: se excluye lo ocultado por moderación. */
const soloVisible = { hiddenAt: null };

/**
 * ¿Esta cuenta está suspendida ahora mismo?
 * La suspensión caduca sola: no hace falta un proceso que la levante.
 */
function estaSuspendido(user) {
  return Boolean(user?.suspendedUntil && new Date(user.suspendedUntil) > new Date());
}

/**
 * Registra una acción de moderación en la bitácora.
 * Nunca lanza: la bitácora no debe tumbar la acción que ya se ejecutó.
 */
async function registrar({ moderatorId, type, targetType, targetId, reason = null, note = null }) {
  try {
    await prisma.moderationAction.create({
      data: { moderatorId, type, targetType, targetId, reason, note }
    });
  } catch (e) {
    console.error('No se pudo registrar la acción de moderación:', e);
  }
}

/**
 * Avisa a la persona moderada. Lleva el motivo pero no al moderador: el actor
 * se guarda para la auditoría interna y se omite al serializar (ver
 * notificationRoutes) para que la notificación se lea como "Moderación de
 * WeedTown" y no invite a represalias contra una persona concreta.
 */
async function avisar({ recipientId, moderatorId, type, reason, forumPostId = null, forumCommentId = null }) {
  if (recipientId === moderatorId) return; // moderarse a sí mismo no se notifica
  try {
    await prisma.notification.create({
      data: { type, recipientId, actorId: moderatorId, reason, forumPostId, forumCommentId }
    });
  } catch (e) {
    console.error('No se pudo notificar la acción de moderación:', e);
  }
}

module.exports = {
  MOTIVOS,
  MOTIVO_TEXTO,
  OBJETIVOS,
  OCULTABLES,
  esMotivoValido,
  esObjetivoValido,
  soloVisible,
  estaSuspendido,
  registrar,
  avisar
};
