// Rutas para feed de posteos, reacciones y comentarios
const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const { requireAuth, optionalAuth } = require('../middlewares/requireAuth');
const { REACTION_TYPES, summarizeReactions, toggleReaction, reactionCounts } = require('../lib/reactions');

const postInclude = {
  author: { select: { id: true, name: true, avatar: true } },
  hashtags: { include: { hashtag: true } },
  reactions: { select: { type: true, userId: true } },
  _count: { select: { comments: true } }
};

// Convierte el post crudo de Prisma a la forma pública de la API
function serializePost(post, currentUserId) {
  const { reactions, _count, ...rest } = post;
  const { counts, myReaction } = summarizeReactions(reactions, currentUserId);
  return { ...rest, reactions: counts, myReaction, commentCount: _count?.comments ?? 0 };
}

const commentInclude = {
  author: { select: { id: true, name: true, avatar: true } },
  reactions: { select: { type: true, userId: true } }
};

function serializeComment(comment, currentUserId) {
  const { reactions, ...rest } = comment;
  const { counts, myReaction } = summarizeReactions(reactions, currentUserId);
  return { ...rest, reactions: counts, myReaction };
}

// GET /api/posts?page=1
router.get('/', optionalAuth, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  try {
    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: postInclude
      }),
      prisma.post.count()
    ]);
    res.json({
      posts: posts.map(p => serializePost(p, req.user?.id)),
      page,
      totalPages: Math.ceil(total / pageSize),
      total
    });
  } catch (e) {
    console.error('Error al obtener posteos:', e);
    res.status(500).json({ error: 'Error al obtener posteos' });
  }
});

// Crear posteo con hashtags (el autor sale del token)
router.post('/', requireAuth, async (req, res) => {
  const { content, image, hashtags } = req.body;
  if (!content) return res.status(400).json({ error: 'Faltan campos requeridos' });
  const tags = Array.isArray(hashtags)
    ? [...new Set(hashtags.map(t => String(t).replace(/^#/, '').trim().toLowerCase()).filter(Boolean))]
    : [];
  try {
    const post = await prisma.post.create({
      data: {
        content,
        image: image || null,
        authorId: req.user.id,
        hashtags: {
          create: tags.map(tag => ({
            hashtag: { connectOrCreate: { where: { tag }, create: { tag } } }
          }))
        }
      },
      include: postInclude
    });
    res.json(serializePost(post, req.user.id));
  } catch (e) {
    console.error('Error al crear posteo:', e);
    res.status(500).json({ error: 'Error al crear posteo' });
  }
});

// Buscar posteos por contenido o autor
router.get('/search', optionalAuth, async (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  if (!q) return res.json({ results: [] });
  try {
    const results = await prisma.post.findMany({
      where: {
        OR: [
          { content: { contains: q, mode: 'insensitive' } },
          { author: { name: { contains: q, mode: 'insensitive' } } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      include: postInclude
    });
    res.json({ results: results.map(p => serializePost(p, req.user?.id)) });
  } catch (e) {
    console.error('Error en la búsqueda:', e);
    res.status(500).json({ error: 'Error en la búsqueda' });
  }
});

// Reaccionar a un post: misma reacción = quitar, distinta = reemplazar (HU-RC-001)
async function reactToPost(req, res, type) {
  const postId = Number(req.params.id);
  if (!postId) return res.status(400).json({ error: 'ID de post inválido' });
  if (!REACTION_TYPES.includes(type)) {
    return res.status(400).json({ error: `Reacción inválida. Usa: ${REACTION_TYPES.join(', ')}` });
  }
  try {
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });
    const { myReaction } = await toggleReaction(req.user.id, { postId }, type);
    const reactions = await reactionCounts({ postId });
    res.json({ postId, myReaction, reactions });
  } catch (e) {
    console.error('Error al reaccionar al post:', e);
    res.status(500).json({ error: 'Error al registrar la reacción' });
  }
}

router.post('/:id/reaction', requireAuth, (req, res) => reactToPost(req, res, req.body.type));

// Alias de compatibilidad: like = reacción LIKE
router.post('/:id/like', requireAuth, (req, res) => reactToPost(req, res, 'LIKE'));

// Quitar la reacción propia
router.delete('/:id/reaction', requireAuth, async (req, res) => {
  const postId = Number(req.params.id);
  if (!postId) return res.status(400).json({ error: 'ID de post inválido' });
  try {
    await prisma.reaction.deleteMany({ where: { userId: req.user.id, postId } });
    const reactions = await reactionCounts({ postId });
    res.json({ postId, myReaction: null, reactions });
  } catch (e) {
    console.error('Error al quitar la reacción:', e);
    res.status(500).json({ error: 'Error al quitar la reacción' });
  }
});

// Comentar un post (imagen opcional, ya subida vía /api/media/upload)
router.post('/:id/comment', requireAuth, async (req, res) => {
  const postId = Number(req.params.id);
  const content = (req.body.content || '').trim();
  const image = typeof req.body.image === 'string' && req.body.image ? req.body.image : null;
  if (!postId) return res.status(400).json({ error: 'ID de post inválido' });
  if (!content) return res.status(400).json({ error: 'El comentario no puede estar vacío' });
  try {
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });
    const comment = await prisma.comment.create({
      data: { content, image, postId, authorId: req.user.id },
      include: commentInclude
    });
    res.json(serializeComment(comment, req.user.id));
  } catch (e) {
    console.error('Error al comentar:', e);
    res.status(500).json({ error: 'Error al crear el comentario' });
  }
});

// Listar comentarios de un post
router.get('/:id/comments', optionalAuth, async (req, res) => {
  const postId = Number(req.params.id);
  if (!postId) return res.status(400).json({ error: 'ID de post inválido' });
  try {
    const comments = await prisma.comment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      include: commentInclude
    });
    res.json({ comments: comments.map(c => serializeComment(c, req.user?.id)) });
  } catch (e) {
    console.error('Error al listar comentarios:', e);
    res.status(500).json({ error: 'Error al obtener comentarios' });
  }
});

module.exports = router;
