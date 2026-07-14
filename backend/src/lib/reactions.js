// Utilidades del sistema de reacciones cannábicas (HU-RC-001 + hito foros)
const prisma = require('./prisma');

const REACTION_TYPES = ['LIKE', 'ROLA', 'INTERESA', 'MOLESTA'];

// En el foro las reacciones puntúan (estilo Reddit): positivas +1, MOLESTA -1
const REACTION_SCORE = { LIKE: 1, ROLA: 1, INTERESA: 1, MOLESTA: -1 };

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

// Claves únicas y modelo con score según el tipo de objetivo
function targetMeta(target) {
  if (target.postId) return { key: 'userId_postId', scoreModel: null };
  if (target.commentId) return { key: 'userId_commentId', scoreModel: null };
  if (target.forumPostId) return { key: 'userId_forumPostId', scoreModel: 'forumPost' };
  if (target.forumCommentId) return { key: 'userId_forumCommentId', scoreModel: 'forumComment' };
  throw new Error('Target de reacción inválido');
}

// Alterna/reemplaza la reacción de un usuario. Misma reacción => se elimina (toggle);
// distinta => se reemplaza. En objetivos de foro actualiza el score en la misma transacción.
// target: { postId } | { commentId } | { forumPostId } | { forumCommentId }
async function toggleReaction(userId, target, type) {
  const meta = targetMeta(target);
  const targetField = Object.keys(target)[0];
  const targetId = target[targetField];
  const where = { [meta.key]: { userId, [targetField]: targetId } };

  const existing = await prisma.reaction.findUnique({ where });

  let scoreDelta = 0;
  let myReaction;
  const ops = [];
  if (existing && existing.type === type) {
    ops.push(prisma.reaction.delete({ where }));
    scoreDelta = -REACTION_SCORE[type];
    myReaction = null;
  } else if (existing) {
    ops.push(prisma.reaction.update({ where, data: { type } }));
    scoreDelta = REACTION_SCORE[type] - REACTION_SCORE[existing.type];
    myReaction = type;
  } else {
    ops.push(prisma.reaction.create({ data: { userId, type, ...target } }));
    scoreDelta = REACTION_SCORE[type];
    myReaction = type;
  }

  if (meta.scoreModel && scoreDelta !== 0) {
    ops.push(prisma[meta.scoreModel].update({
      where: { id: targetId },
      data: { score: { increment: scoreDelta } }
    }));
  }
  await prisma.$transaction(ops);
  return { myReaction };
}

// Quita la reacción propia (si existe) ajustando el score en foro
async function removeReaction(userId, target) {
  const meta = targetMeta(target);
  const targetField = Object.keys(target)[0];
  const targetId = target[targetField];
  const where = { [meta.key]: { userId, [targetField]: targetId } };

  const existing = await prisma.reaction.findUnique({ where });
  if (!existing) return;
  const ops = [prisma.reaction.delete({ where })];
  if (meta.scoreModel) {
    ops.push(prisma[meta.scoreModel].update({
      where: { id: targetId },
      data: { score: { increment: -REACTION_SCORE[existing.type] } }
    }));
  }
  await prisma.$transaction(ops);
}

// Conteos frescos por tipo para cualquier objetivo
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

module.exports = { REACTION_TYPES, REACTION_SCORE, summarizeReactions, toggleReaction, removeReaction, reactionCounts };
