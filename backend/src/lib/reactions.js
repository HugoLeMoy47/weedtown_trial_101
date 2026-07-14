// Utilidades del sistema de reacciones cannábicas (HU-RC-001)
const prisma = require('./prisma');

const REACTION_TYPES = ['LIKE', 'ROLA', 'INTERESA', 'MOLESTA'];

function emptyCounts() {
  return { LIKE: 0, ROLA: 0, INTERESA: 0, MOLESTA: 0 };
}

// Agrega conteos por tipo a partir de la relación reactions incluida ({type, userId}[])
function summarizeReactions(reactions, currentUserId) {
  const counts = emptyCounts();
  let myReaction = null;
  for (const r of reactions || []) {
    if (counts[r.type] !== undefined) counts[r.type] += 1;
    if (currentUserId && r.userId === currentUserId) myReaction = r.type;
  }
  return { counts, myReaction };
}

// Alterna/reemplaza la reacción de un usuario sobre un post o comentario.
// Misma reacción de nuevo => se elimina (toggle); distinta => se reemplaza.
// target: { postId } o { commentId }
async function toggleReaction(userId, target, type) {
  const where = target.postId
    ? { userId_postId: { userId, postId: target.postId } }
    : { userId_commentId: { userId, commentId: target.commentId } };

  const existing = await prisma.reaction.findUnique({ where });
  if (existing && existing.type === type) {
    await prisma.reaction.delete({ where });
    return { myReaction: null };
  }
  if (existing) {
    await prisma.reaction.update({ where, data: { type } });
  } else {
    await prisma.reaction.create({ data: { userId, type, ...target } });
  }
  return { myReaction: type };
}

// Conteos frescos por tipo para un post o comentario
async function reactionCounts(target) {
  const grouped = await prisma.reaction.groupBy({
    by: ['type'],
    where: target,
    _count: { type: true }
  });
  const counts = emptyCounts();
  for (const g of grouped) counts[g.type] = g._count.type;
  return counts;
}

module.exports = { REACTION_TYPES, summarizeReactions, toggleReaction, reactionCounts };
