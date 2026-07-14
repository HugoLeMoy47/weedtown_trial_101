// Rutas para reacciones sobre comentarios (HU-RC-001)
const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const { requireAuth } = require('../middlewares/requireAuth');
const { REACTION_TYPES, toggleReaction, reactionCounts } = require('../lib/reactions');

// Reaccionar a un comentario: misma reacción = quitar, distinta = reemplazar
router.post('/:id/reaction', requireAuth, async (req, res) => {
  const commentId = Number(req.params.id);
  const type = req.body.type;
  if (!commentId) return res.status(400).json({ error: 'ID de comentario inválido' });
  if (!REACTION_TYPES.includes(type)) {
    return res.status(400).json({ error: `Reacción inválida. Usa: ${REACTION_TYPES.join(', ')}` });
  }
  try {
    const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true } });
    if (!comment) return res.status(404).json({ error: 'Comentario no encontrado' });
    const { myReaction } = await toggleReaction(req.user.id, { commentId }, type);
    const reactions = await reactionCounts({ commentId });
    res.json({ commentId, myReaction, reactions });
  } catch (e) {
    console.error('Error al reaccionar al comentario:', e);
    res.status(500).json({ error: 'Error al registrar la reacción' });
  }
});

// Quitar la reacción propia de un comentario
router.delete('/:id/reaction', requireAuth, async (req, res) => {
  const commentId = Number(req.params.id);
  if (!commentId) return res.status(400).json({ error: 'ID de comentario inválido' });
  try {
    await prisma.reaction.deleteMany({ where: { userId: req.user.id, commentId } });
    const reactions = await reactionCounts({ commentId });
    res.json({ commentId, myReaction: null, reactions });
  } catch (e) {
    console.error('Error al quitar la reacción:', e);
    res.status(500).json({ error: 'Error al quitar la reacción' });
  }
});

module.exports = router;
