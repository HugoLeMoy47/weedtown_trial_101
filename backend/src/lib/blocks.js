// Bloqueo entre personas (HU-SEG-001).
//
// Regla del producto: el bloqueo lo crea y lo deshace SOLO quien bloquea, pero su
// efecto es MUTUO — mientras exista, ninguna de las dos partes ve ni puede
// contactar a la otra. Es deliberado: si el efecto fuera de un solo lado, quien
// hostiga seguiría leyendo y respondiendo a quien lo bloqueó.
//
// Regla de discreción: a la persona bloqueada nunca se le informa. Las rutas
// responden 404 ("no encontrado") en vez de 403, para no confirmar la existencia
// del bloqueo ni de la cuenta.
const prisma = require('./prisma');

/**
 * IDs de todas las personas con las que `userId` tiene un bloqueo activo,
 * en cualquiera de las dos direcciones.
 * @param {number} userId
 * @returns {Promise<number[]>} lista vacía si no hay ninguno
 */
async function blockedWith(userId) {
  if (!userId) return [];
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true }
  });
  const ids = new Set();
  for (const r of rows) ids.add(r.blockerId === userId ? r.blockedId : r.blockerId);
  return [...ids];
}

/**
 * ¿Existe un bloqueo entre estas dos personas, en cualquier dirección?
 * @param {number} a
 * @param {number} b
 */
async function isBlockedBetween(a, b) {
  if (!a || !b || a === b) return false;
  const found = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a }
      ]
    },
    select: { blockerId: true }
  });
  return Boolean(found);
}

/**
 * Fragmento de `where` de Prisma para excluir el contenido de las personas
 * bloqueadas. Devuelve `{}` cuando no hay ninguna, para no ensuciar la consulta.
 * @param {number[]} ids resultado de blockedWith()
 * @param {string} field campo con el id del autor (authorId, actorId, ...)
 */
function excludeBlocked(ids, field = 'authorId') {
  return ids.length ? { [field]: { notIn: ids } } : {};
}

module.exports = { blockedWith, isBlockedBetween, excludeBlocked };
