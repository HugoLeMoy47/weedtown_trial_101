// Foros estilo Reddit: subforos, posts con puntaje y órdenes hot/new/top
const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const { requireAuth, optionalAuth } = require('../middlewares/requireAuth');
const { REACTION_TYPES, summarizeReactions, toggleReaction, removeReaction, reactionCounts } = require('../lib/reactions');

const MAX_SUBFORUMS_PER_USER = 3;
const PAGE_SIZE = 20;

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar acentos
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .slice(0, 48);
}

const subforumSelect = {
  id: true, name: true, slug: true, description: true, createdAt: true,
  creator: { select: { id: true, name: true } },
  _count: { select: { posts: true, followers: true } }
};

const forumPostInclude = {
  author: { select: { id: true, name: true, avatar: true } },
  subforum: { select: { id: true, name: true, slug: true } },
  reactions: { select: { type: true, userId: true } },
  _count: { select: { comments: true } }
};

function serializeForumPost(post, currentUserId) {
  const { reactions, _count, ...rest } = post;
  const { counts, myReaction } = summarizeReactions(reactions, currentUserId);
  return { ...rest, reactions: counts, myReaction, commentCount: _count?.comments ?? 0 };
}

// ---------- Subforos ----------

// GET /api/forum/subforums — directorio
router.get('/subforums', optionalAuth, async (req, res) => {
  try {
    const subforums = await prisma.subForum.findMany({
      orderBy: [{ posts: { _count: 'desc' } }, { createdAt: 'asc' }],
      select: {
        ...subforumSelect,
        followers: req.user ? { where: { userId: req.user.id }, select: { userId: true } } : false
      }
    });
    res.json({
      subforums: subforums.map(({ followers, ...s }) => ({
        ...s,
        following: Boolean(followers && followers.length)
      }))
    });
  } catch (e) {
    console.error('Error al listar subforos:', e);
    res.status(500).json({ error: 'Error al obtener los subforos' });
  }
});

// POST /api/forum/subforums — crear (límite por usuario mientras no hay moderación)
router.post('/subforums', requireAuth, async (req, res) => {
  const name = (req.body.name || '').trim();
  const description = (req.body.description || '').trim() || null;
  if (name.length < 3 || name.length > 40) {
    return res.status(400).json({ error: 'El nombre debe tener entre 3 y 40 caracteres' });
  }
  const slug = slugify(name);
  if (!slug) return res.status(400).json({ error: 'El nombre debe incluir letras o números' });
  try {
    const mine = await prisma.subForum.count({ where: { creatorId: req.user.id } });
    if (mine >= MAX_SUBFORUMS_PER_USER) {
      return res.status(400).json({ error: `Por ahora cada persona puede crear máximo ${MAX_SUBFORUMS_PER_USER} subforos` });
    }
    const exists = await prisma.subForum.findFirst({ where: { OR: [{ name }, { slug }] } });
    if (exists) return res.status(409).json({ error: 'Ya existe un subforo con ese nombre' });

    const subforum = await prisma.subForum.create({
      data: {
        name, slug, description, creatorId: req.user.id,
        // El creador sigue su propio subforo automáticamente
        followers: { create: { userId: req.user.id } }
      },
      select: subforumSelect
    });
    res.json({ ...subforum, following: true });
  } catch (e) {
    console.error('Error al crear subforo:', e);
    res.status(500).json({ error: 'Error al crear el subforo' });
  }
});

// GET /api/forum/subforums/:slug — detalle
router.get('/subforums/:slug', optionalAuth, async (req, res) => {
  try {
    const subforum = await prisma.subForum.findUnique({
      where: { slug: req.params.slug },
      select: {
        ...subforumSelect,
        followers: req.user ? { where: { userId: req.user.id }, select: { userId: true } } : false
      }
    });
    if (!subforum) return res.status(404).json({ error: 'Subforo no encontrado' });
    const { followers, ...s } = subforum;
    res.json({ ...s, following: Boolean(followers && followers.length) });
  } catch (e) {
    console.error('Error al obtener subforo:', e);
    res.status(500).json({ error: 'Error al obtener el subforo' });
  }
});

// ---------- Posts del foro ----------

const PERIOD_HOURS = { day: 24, week: 24 * 7, month: 24 * 30 };

// GET /api/forum/subforums/:slug/posts?sort=hot|new|top&period=day|week|month|all&page=1
router.get('/subforums/:slug/posts', optionalAuth, async (req, res) => {
  const sort = ['hot', 'new', 'top'].includes(req.query.sort) ? req.query.sort : 'hot';
  const period = ['day', 'week', 'month', 'all'].includes(req.query.period) ? req.query.period : 'all';
  const page = parseInt(req.query.page) || 1;
  const skip = (page - 1) * PAGE_SIZE;
  try {
    const subforum = await prisma.subForum.findUnique({ where: { slug: req.params.slug }, select: { id: true } });
    if (!subforum) return res.status(404).json({ error: 'Subforo no encontrado' });

    let where = { subforumId: subforum.id };
    let posts;
    if (sort === 'hot') {
      // Relevante: puntaje con decaimiento temporal (gravedad estilo Reddit/HN)
      const ids = await prisma.$queryRaw`
        SELECT id FROM "ForumPost"
        WHERE "subforumId" = ${subforum.id}
        ORDER BY score::float / POWER(EXTRACT(EPOCH FROM (NOW() - "createdAt")) / 3600 + 2, 1.5) DESC, "createdAt" DESC
        LIMIT ${PAGE_SIZE} OFFSET ${skip}`;
      const found = await prisma.forumPost.findMany({
        where: { id: { in: ids.map(r => r.id) } },
        include: forumPostInclude
      });
      const byId = new Map(found.map(p => [p.id, p]));
      posts = ids.map(r => byId.get(r.id)).filter(Boolean);
    } else {
      if (sort === 'top' && period !== 'all') {
        where = { ...where, createdAt: { gte: new Date(Date.now() - PERIOD_HOURS[period] * 3600 * 1000) } };
      }
      posts = await prisma.forumPost.findMany({
        where,
        orderBy: sort === 'new' ? { createdAt: 'desc' } : [{ score: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: PAGE_SIZE,
        include: forumPostInclude
      });
    }
    const total = await prisma.forumPost.count({ where });
    res.json({
      posts: posts.map(p => serializeForumPost(p, req.user?.id)),
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      total,
      sort,
      period
    });
  } catch (e) {
    console.error('Error al listar posts del foro:', e);
    res.status(500).json({ error: 'Error al obtener los posts' });
  }
});

// POST /api/forum/subforums/:slug/posts — crear post (imagen opcional vía /api/media/upload)
router.post('/subforums/:slug/posts', requireAuth, async (req, res) => {
  const title = (req.body.title || '').trim();
  const content = (req.body.content || '').trim();
  const image = typeof req.body.image === 'string' && req.body.image ? req.body.image : null;
  if (title.length < 3 || title.length > 200) {
    return res.status(400).json({ error: 'El título debe tener entre 3 y 200 caracteres' });
  }
  if (!content) return res.status(400).json({ error: 'El contenido no puede estar vacío' });
  try {
    const subforum = await prisma.subForum.findUnique({ where: { slug: req.params.slug }, select: { id: true } });
    if (!subforum) return res.status(404).json({ error: 'Subforo no encontrado' });
    const post = await prisma.forumPost.create({
      data: { title, content, image, authorId: req.user.id, subforumId: subforum.id },
      include: forumPostInclude
    });
    res.json(serializeForumPost(post, req.user.id));
  } catch (e) {
    console.error('Error al crear post del foro:', e);
    res.status(500).json({ error: 'Error al crear el post' });
  }
});

// GET /api/forum/posts/:id — detalle
router.get('/posts/:id', optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const post = await prisma.forumPost.findUnique({ where: { id }, include: forumPostInclude });
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });
    res.json(serializeForumPost(post, req.user?.id));
  } catch (e) {
    console.error('Error al obtener post del foro:', e);
    res.status(500).json({ error: 'Error al obtener el post' });
  }
});

// POST /api/forum/posts/:id/reaction — reaccionar (puntúa: +1 positivas, -1 MOLESTA)
router.post('/posts/:id/reaction', requireAuth, async (req, res) => {
  const forumPostId = Number(req.params.id);
  const type = req.body.type;
  if (!forumPostId) return res.status(400).json({ error: 'ID inválido' });
  if (!REACTION_TYPES.includes(type)) {
    return res.status(400).json({ error: `Reacción inválida. Usa: ${REACTION_TYPES.join(', ')}` });
  }
  try {
    const post = await prisma.forumPost.findUnique({ where: { id: forumPostId }, select: { id: true } });
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });
    const { myReaction } = await toggleReaction(req.user.id, { forumPostId }, type);
    const [reactions, fresh] = await Promise.all([
      reactionCounts({ forumPostId }),
      prisma.forumPost.findUnique({ where: { id: forumPostId }, select: { score: true } })
    ]);
    res.json({ forumPostId, myReaction, reactions, score: fresh.score });
  } catch (e) {
    console.error('Error al reaccionar al post del foro:', e);
    res.status(500).json({ error: 'Error al registrar la reacción' });
  }
});

// DELETE /api/forum/posts/:id/reaction — quitar la reacción propia
router.delete('/posts/:id/reaction', requireAuth, async (req, res) => {
  const forumPostId = Number(req.params.id);
  if (!forumPostId) return res.status(400).json({ error: 'ID inválido' });
  try {
    await removeReaction(req.user.id, { forumPostId });
    const [reactions, fresh] = await Promise.all([
      reactionCounts({ forumPostId }),
      prisma.forumPost.findUnique({ where: { id: forumPostId }, select: { score: true } })
    ]);
    res.json({ forumPostId, myReaction: null, reactions, score: fresh?.score ?? 0 });
  } catch (e) {
    console.error('Error al quitar la reacción:', e);
    res.status(500).json({ error: 'Error al quitar la reacción' });
  }
});

module.exports = router;
