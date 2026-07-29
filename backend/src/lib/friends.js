// Amistad entre personas (HU-AMI-001).
//
// Simétrica: se guarda una sola fila por par (quién pidió, a quién), y "son
// amigos" se consulta en cualquiera de las dos direcciones — mismo patrón que
// blocks.js con isBlockedBetween. "Conocido" no vive aquí: no se persiste,
// es cualquier persona visible que no es ni amigo ni bloqueado.
const prisma = require('./prisma');

/**
 * ¿A y B son amigos ahora mismo (solicitud aceptada, en cualquier dirección)?
 * @param {number} a
 * @param {number} b
 */
async function areFriends(a, b) {
  if (!a || !b || a === b) return false;
  const found = await prisma.friendRequest.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a }
      ]
    },
    select: { id: true }
  });
  return Boolean(found);
}

/**
 * IDs de todos los amigos aceptados de `userId`.
 * @param {number} userId
 * @returns {Promise<number[]>}
 */
async function friendIds(userId) {
  if (!userId) return [];
  const rows = await prisma.friendRequest.findMany({
    where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true }
  });
  return rows.map(r => (r.requesterId === userId ? r.addresseeId : r.requesterId));
}

/**
 * La fila de solicitud entre A y B, sin importar quién la mandó ni su estado.
 * Sirve para saber si ya hay algo pendiente/aceptado antes de crear una nueva.
 */
async function findRequestBetween(a, b) {
  return prisma.friendRequest.findFirst({
    where: { OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] }
  });
}

/**
 * Estado de relación entre quien mira (viewer) y un perfil (target), para que
 * el frontend sepa qué botón mostrar. `requestId` solo viene con `pending_*`
 * — aceptar/rechazar necesitan el id de la solicitud, no el del usuario.
 * @returns {Promise<{status: 'none'|'pending_sent'|'pending_received'|'friends', requestId?: number}>}
 */
async function friendStatusBetween(viewerId, targetId) {
  if (!viewerId || viewerId === targetId) return { status: 'none' };
  const fila = await findRequestBetween(viewerId, targetId);
  if (!fila || fila.status === 'REJECTED') return { status: 'none' };
  if (fila.status === 'ACCEPTED') return { status: 'friends' };
  return { status: fila.requesterId === viewerId ? 'pending_sent' : 'pending_received', requestId: fila.id };
}

/**
 * Deshace cualquier vínculo de amistad entre dos personas — aceptado o
 * pendiente, en cualquier dirección. Se usa al bloquear (HU-AMI-005): un
 * bloqueo no debe dejar una amistad fantasma corriendo por debajo.
 */
async function romperVinculo(a, b) {
  await prisma.friendRequest.deleteMany({
    where: { OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] }
  });
}

module.exports = { areFriends, friendIds, findRequestBetween, friendStatusBetween, romperVinculo };
