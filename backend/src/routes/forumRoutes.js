// Foros estilo Reddit: subforos, posts con puntaje y órdenes hot/new/top
const express = require('express');
const { Prisma } = require('@prisma/client');
const router = express.Router();

const prisma = require('../lib/prisma');
const { requireAuth, optionalAuth, requireNotSuspended } = require('../middlewares/requireAuth');
const { REACTION_TYPES, summarizeReactions, toggleReaction, removeReaction, reactionCounts } = require('../lib/reactions');
const { blockedWith, isBlockedBetween, excludeBlocked } = require('../lib/blocks');
const storage = require('../lib/storage');
const { soloVisible } = require('../lib/moderation');
const { demasiadosEnlaces, esContenidoRepetido, MAX_LINKS_PER_CONTENT } = require('../lib/antiSpam');
const { slugify } = require('../lib/slugify');

const MAX_SUBFORUMS_PER_USER = 3;
const PAGE_SIZE = 20;
// Topes de contenido: defensa contra payloads abusivos
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_POST_LENGTH = 10000;
const MAX_COMMENT_LENGTH = 2000;
const IMAGE_URL_RE = /^https?:\/\/\S{1,500}$/;

// HU-FOR-012: `creator` NO va en el select base — el directorio de subforos
// (GET /subforums, GET /subforums/:slug) queda abierto sin sesión a
// propósito (son nombres y descripciones institucionales, no contenido de
// la comunidad), pero no debe exponer de quién fue la idea a nadie sin
// cuenta. Cada ruta agrega `creator` por su cuenta, condicionado a `req.user`
// donde aplica — mismo patrón que ya usa `followers` aquí abajo.
const subforumSelect = {
  id: true, name: true, slug: true, description: true, createdAt: true,
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

// creator solo viaja con sesión — anónimo ve de qué se habla, no quién lo creó.
function creatorSelect(req) {
  return req.user ? { select: { id: true, name: true } } : false;
}

// GET /api/forum/subforums — directorio
router.get('/subforums', optionalAuth, async (req, res) => {
  try {
    const subforums = await prisma.subForum.findMany({
      // Los archivados salen del directorio, pero su contenido sigue siendo
      // consultable por enlace directo: archivar no borra la conversación.
      where: { archivedAt: null },
      orderBy: [{ posts: { _count: 'desc' } }, { createdAt: 'asc' }],
      select: {
        ...subforumSelect,
        creator: creatorSelect(req),
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
router.post('/subforums', requireAuth, requireNotSuspended, async (req, res) => {
  const name = (req.body.name || '').trim();
  const description = (req.body.description || '').trim() || null;
  if (name.length < 3 || name.length > 40) {
    return res.status(400).json({ error: 'El nombre debe tener entre 3 y 40 caracteres' });
  }
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    return res.status(400).json({ error: `La descripción no puede superar ${MAX_DESCRIPTION_LENGTH} caracteres` });
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
      // Quien crea el subforo siempre tiene sesión (requireAuth): mostrarle
      // el creador (a sí mismo) en la respuesta no expone nada.
      select: { ...subforumSelect, creator: { select: { id: true, name: true } } }
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
        creator: creatorSelect(req),
        archivedAt: true,
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

// POST /api/forum/subforums/:slug/follow — seguir (idempotente)
router.post('/subforums/:slug/follow', requireAuth, async (req, res) => {
  try {
    const subforum = await prisma.subForum.findUnique({ where: { slug: req.params.slug }, select: { id: true } });
    if (!subforum) return res.status(404).json({ error: 'Subforo no encontrado' });
    await prisma.subForumFollow.upsert({
      where: { userId_subforumId: { userId: req.user.id, subforumId: subforum.id } },
      update: {},
      create: { userId: req.user.id, subforumId: subforum.id }
    });
    const followers = await prisma.subForumFollow.count({ where: { subforumId: subforum.id } });
    res.json({ following: true, followers });
  } catch (e) {
    console.error('Error al seguir subforo:', e);
    res.status(500).json({ error: 'Error al seguir el subforo' });
  }
});

// DELETE /api/forum/subforums/:slug/follow — dejar de seguir (idempotente)
router.delete('/subforums/:slug/follow', requireAuth, async (req, res) => {
  try {
    const subforum = await prisma.subForum.findUnique({ where: { slug: req.params.slug }, select: { id: true } });
    if (!subforum) return res.status(404).json({ error: 'Subforo no encontrado' });
    await prisma.subForumFollow.deleteMany({ where: { userId: req.user.id, subforumId: subforum.id } });
    const followers = await prisma.subForumFollow.count({ where: { subforumId: subforum.id } });
    res.json({ following: false, followers });
  } catch (e) {
    console.error('Error al dejar de seguir subforo:', e);
    res.status(500).json({ error: 'Error al dejar de seguir el subforo' });
  }
});

// ---------- Posts del foro ----------

const PERIOD_HOURS = { day: 24, week: 24 * 7, month: 24 * 30 };

// GET /api/forum/subforums/:slug/posts?sort=hot|new|top&period=day|week|month|all&page=1
// HU-FOR-012: contenido del foro, exige sesión — el directorio (arriba) es
// lo único que queda abierto.
router.get('/subforums/:slug/posts', requireAuth, async (req, res) => {
  const sort = ['hot', 'new', 'top'].includes(req.query.sort) ? req.query.sort : 'hot';
  const period = ['day', 'week', 'month', 'all'].includes(req.query.period) ? req.query.period : 'all';
  const page = parseInt(req.query.page) || 1;
  const skip = (page - 1) * PAGE_SIZE;
  try {
    const subforum = await prisma.subForum.findUnique({ where: { slug: req.params.slug }, select: { id: true } });
    if (!subforum) return res.status(404).json({ error: 'Subforo no encontrado' });

    const hidden = await blockedWith(req.user?.id);
    let where = { subforumId: subforum.id, ...soloVisible, ...excludeBlocked(hidden) };
    let posts;
    if (sort === 'hot') {
      // Relevante: puntaje con decaimiento temporal (gravedad estilo Reddit/HN).
      // El filtro de bloqueados se interpola con Prisma.sql (parametrizado, no
      // concatenación de strings) y se omite entero si no hay ninguno.
      const notBlocked = hidden.length
        ? Prisma.sql`AND "authorId" NOT IN (${Prisma.join(hidden)})`
        : Prisma.empty;
      const ids = await prisma.$queryRaw`
        SELECT id FROM "ForumPost"
        WHERE "subforumId" = ${subforum.id} AND "hiddenAt" IS NULL ${notBlocked}
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
router.post('/subforums/:slug/posts', requireAuth, requireNotSuspended, async (req, res) => {
  const title = (req.body.title || '').trim();
  const content = (req.body.content || '').trim();
  const image = typeof req.body.image === 'string' && req.body.image ? req.body.image : null;
  if (title.length < 3 || title.length > 200) {
    return res.status(400).json({ error: 'El título debe tener entre 3 y 200 caracteres' });
  }
  if (!content) return res.status(400).json({ error: 'El contenido no puede estar vacío' });
  if (content.length > MAX_POST_LENGTH) {
    return res.status(400).json({ error: `El contenido no puede superar ${MAX_POST_LENGTH} caracteres` });
  }
  if (image && !IMAGE_URL_RE.test(image)) {
    return res.status(400).json({ error: 'Imagen inválida: debe ser una URL http(s)' });
  }
  if (demasiadosEnlaces(content)) {
    return res.status(400).json({ error: `Un post no puede traer más de ${MAX_LINKS_PER_CONTENT} enlaces` });
  }
  try {
    const subforum = await prisma.subForum.findUnique({
      where: { slug: req.params.slug },
      select: { id: true, archivedAt: true }
    });
    if (!subforum) return res.status(404).json({ error: 'Subforo no encontrado' });
    if (subforum.archivedAt) {
      return res.status(403).json({ error: 'Este subforo está archivado: puedes leerlo, pero ya no admite publicaciones nuevas' });
    }
    if (await esContenidoRepetido('forumPost', req.user.id, content)) {
      return res.status(429).json({ error: 'Ya publicaste exactamente este mismo contenido hace poco' });
    }
    const post = await prisma.forumPost.create({
      data: { title, content, image, authorId: req.user.id, subforumId: subforum.id },
      include: forumPostInclude
    });

    // Notificar a quienes siguen el subforo (excepto el autor y quienes tienen un
    // bloqueo con él); no bloquea la respuesta
    const hidden = await blockedWith(req.user.id);
    prisma.subForumFollow.findMany({
      where: { subforumId: subforum.id, userId: { notIn: [req.user.id, ...hidden] } },
      select: { userId: true }
    }).then(followers => followers.length && prisma.notification.createMany({
      data: followers.map(f => ({
        type: 'NEW_SUBFORUM_POST',
        recipientId: f.userId,
        actorId: req.user.id,
        subforumId: subforum.id,
        forumPostId: post.id
      }))
    })).catch(err => console.error('Error notificando nuevo post:', err));

    res.json(serializeForumPost(post, req.user.id));
  } catch (e) {
    console.error('Error al crear post del foro:', e);
    res.status(500).json({ error: 'Error al crear el post' });
  }
});

// GET /api/forum/posts/:id — detalle
// HU-FOR-012: contenido del foro, exige sesión.
router.get('/posts/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const post = await prisma.forumPost.findUnique({ where: { id }, include: forumPostInclude });
    if (!post || post.hiddenAt) return res.status(404).json({ error: 'Post no encontrado' });
    if (await isBlockedBetween(req.user?.id, post.authorId)) {
      return res.status(404).json({ error: 'Post no encontrado' });
    }
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
    // HU-MOD-001: reaccionar a un post del foro ya oculto por moderación no se permite.
    const post = await prisma.forumPost.findUnique({ where: { id: forumPostId, ...soloVisible }, select: { id: true, authorId: true } });
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });
    // La reacción puntúa (±1): quien está bloqueado no vota el contenido del otro
    if (await isBlockedBetween(req.user.id, post.authorId)) {
      return res.status(404).json({ error: 'Post no encontrado' });
    }
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

// ---------- Hilos de comentarios (anidado hasta 3 niveles) ----------

const MAX_DEPTH = 2; // niveles 0, 1 y 2 = 3 niveles visibles; más profundo se aplana

const forumCommentInclude = {
  author: { select: { id: true, name: true, avatar: true } },
  parent: { select: { id: true, author: { select: { id: true, name: true } } } },
  reactions: { select: { type: true, userId: true } }
};

function serializeForumComment(comment, currentUserId) {
  const { reactions, ...rest } = comment;
  const { counts, myReaction } = summarizeReactions(reactions, currentUserId);
  if (rest.deletedAt) {
    rest.content = '';
    rest.image = null;
  }
  return { ...rest, deleted: Boolean(rest.deletedAt), reactions: counts, myReaction };
}

// GET /api/forum/posts/:id/comments — todos los comentarios del post (el árbol se arma en el cliente)
// HU-FOR-012: contenido del foro, exige sesión.
//
// Hallazgo del barrido de HU-MOD-001: esta ruta filtraba los comentarios por
// su propio hiddenAt/bloqueo pero nunca verificaba si el POST padre era
// accesible (oculto, o de una cuenta bloqueada) — mismo bug que H1, en una
// ruta que ninguna otra tarea tocaba. Mismo criterio que GET /posts/:id.
router.get('/posts/:id/comments', requireAuth, async (req, res) => {
  const postId = Number(req.params.id);
  if (!postId) return res.status(400).json({ error: 'ID inválido' });
  try {
    const post = await prisma.forumPost.findUnique({ where: { id: postId, ...soloVisible }, select: { id: true, authorId: true } });
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });
    if (await isBlockedBetween(req.user.id, post.authorId)) {
      return res.status(404).json({ error: 'Post no encontrado' });
    }
    const comments = await prisma.forumComment.findMany({
      where: { postId, ...soloVisible, ...excludeBlocked(await blockedWith(req.user.id)) },
      orderBy: { createdAt: 'asc' },
      include: forumCommentInclude
    });
    res.json({ comments: comments.map(c => serializeForumComment(c, req.user.id)) });
  } catch (e) {
    console.error('Error al listar comentarios del foro:', e);
    res.status(500).json({ error: 'Error al obtener los comentarios' });
  }
});

// POST /api/forum/posts/:id/comments — comentar o responder (parentId opcional)
router.post('/posts/:id/comments', requireAuth, requireNotSuspended, async (req, res) => {
  const postId = Number(req.params.id);
  const content = (req.body.content || '').trim();
  const image = typeof req.body.image === 'string' && req.body.image ? req.body.image : null;
  const parentId = req.body.parentId ? Number(req.body.parentId) : null;
  if (!postId) return res.status(400).json({ error: 'ID inválido' });
  if (!content) return res.status(400).json({ error: 'El comentario no puede estar vacío' });
  if (content.length > MAX_COMMENT_LENGTH) {
    return res.status(400).json({ error: `El comentario no puede superar ${MAX_COMMENT_LENGTH} caracteres` });
  }
  if (image && !IMAGE_URL_RE.test(image)) {
    return res.status(400).json({ error: 'Imagen inválida: debe ser una URL http(s)' });
  }
  if (demasiadosEnlaces(content)) {
    return res.status(400).json({ error: `Un comentario no puede traer más de ${MAX_LINKS_PER_CONTENT} enlaces` });
  }
  try {
    // HU-MOD-001: comentar (o responder dentro) un post del foro ya oculto
    // por moderación no se permite — cubre tanto la raíz como cualquier
    // respuesta, porque toda creación de comentario pasa por este mismo
    // lookup del post, sin importar si trae parentId.
    const post = await prisma.forumPost.findUnique({ where: { id: postId, ...soloVisible }, select: { id: true, authorId: true } });
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });
    // Comentar es contactar: con un bloqueo de por medio el post no existe
    if (await isBlockedBetween(req.user.id, post.authorId)) {
      return res.status(404).json({ error: 'Post no encontrado' });
    }
    if (await esContenidoRepetido('forumComment', req.user.id, content)) {
      return res.status(429).json({ error: 'Ya mandaste exactamente este mismo comentario hace poco' });
    }

    let depth = 0;
    let parentAuthorId = null;
    if (parentId) {
      // También oculto por su cuenta si el comentario padre mismo (no solo
      // el post) fue retirado por moderación.
      const parent = await prisma.forumComment.findUnique({
        where: { id: parentId, ...soloVisible },
        select: { id: true, postId: true, depth: true, authorId: true, deletedAt: true }
      });
      if (!parent || parent.postId !== postId) {
        return res.status(400).json({ error: 'Comentario padre inválido' });
      }
      // Responder a alguien bloqueado tampoco: el comentario padre no existe
      if (await isBlockedBetween(req.user.id, parent.authorId)) {
        return res.status(400).json({ error: 'Comentario padre inválido' });
      }
      // Más allá del nivel máximo se aplana: sigue colgando del padre pero sin más sangría
      depth = Math.min(parent.depth + 1, MAX_DEPTH);
      parentAuthorId = parent.deletedAt ? null : parent.authorId;
    }

    const comment = await prisma.forumComment.create({
      data: { content, image, postId, parentId, depth, authorId: req.user.id },
      include: forumCommentInclude
    });

    // Notificar: respuesta a comentario → autor del padre; comentario raíz → autor del post
    const recipientId = parentId ? parentAuthorId : post.authorId;
    const type = parentId ? 'REPLY_COMMENT' : 'REPLY_POST';
    if (recipientId && recipientId !== req.user.id) {
      prisma.notification.create({
        data: { type, recipientId, actorId: req.user.id, forumPostId: postId, forumCommentId: comment.id }
      }).catch(err => console.error('Error notificando respuesta:', err));
    }

    res.json(serializeForumComment(comment, req.user.id));
  } catch (e) {
    console.error('Error al comentar en el foro:', e);
    res.status(500).json({ error: 'Error al crear el comentario' });
  }
});

// POST /api/forum/comments/:id/reaction — reaccionar a un comentario (puntúa)
router.post('/comments/:id/reaction', requireAuth, async (req, res) => {
  const forumCommentId = Number(req.params.id);
  const type = req.body.type;
  if (!forumCommentId) return res.status(400).json({ error: 'ID inválido' });
  if (!REACTION_TYPES.includes(type)) {
    return res.status(400).json({ error: `Reacción inválida. Usa: ${REACTION_TYPES.join(', ')}` });
  }
  try {
    // HU-MOD-001: además del borrado suave propio (deletedAt), tampoco se
    // puede reaccionar a un comentario oculto por moderación (hiddenAt).
    const comment = await prisma.forumComment.findUnique({ where: { id: forumCommentId, ...soloVisible }, select: { id: true, deletedAt: true, authorId: true } });
    if (!comment || comment.deletedAt) return res.status(404).json({ error: 'Comentario no encontrado' });
    if (await isBlockedBetween(req.user.id, comment.authorId)) {
      return res.status(404).json({ error: 'Comentario no encontrado' });
    }
    const { myReaction } = await toggleReaction(req.user.id, { forumCommentId }, type);
    const [reactions, fresh] = await Promise.all([
      reactionCounts({ forumCommentId }),
      prisma.forumComment.findUnique({ where: { id: forumCommentId }, select: { score: true } })
    ]);
    res.json({ forumCommentId, myReaction, reactions, score: fresh.score });
  } catch (e) {
    console.error('Error al reaccionar al comentario del foro:', e);
    res.status(500).json({ error: 'Error al registrar la reacción' });
  }
});

// ---------- Editar / eliminar contenido propio ----------

// PUT /api/forum/posts/:id — editar post propio
router.put('/posts/:id', requireAuth, requireNotSuspended, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const title = req.body.title !== undefined ? (req.body.title || '').trim() : undefined;
  const content = req.body.content !== undefined ? (req.body.content || '').trim() : undefined;
  if (title !== undefined && (title.length < 3 || title.length > 200)) {
    return res.status(400).json({ error: 'El título debe tener entre 3 y 200 caracteres' });
  }
  if (content !== undefined && !content) {
    return res.status(400).json({ error: 'El contenido no puede estar vacío' });
  }
  if (content !== undefined && content.length > MAX_POST_LENGTH) {
    return res.status(400).json({ error: `El contenido no puede superar ${MAX_POST_LENGTH} caracteres` });
  }
  try {
    const post = await prisma.forumPost.findUnique({ where: { id }, select: { authorId: true } });
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });
    if (post.authorId !== req.user.id) return res.status(403).json({ error: 'Solo puedes editar tu propio contenido' });
    const updated = await prisma.forumPost.update({
      where: { id },
      data: { title, content },
      include: forumPostInclude
    });
    res.json(serializeForumPost(updated, req.user.id));
  } catch (e) {
    console.error('Error al editar post del foro:', e);
    res.status(500).json({ error: 'Error al editar el post' });
  }
});

// DELETE /api/forum/posts/:id — eliminar post propio (con todo su hilo)
router.delete('/posts/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const post = await prisma.forumPost.findUnique({ where: { id }, select: { authorId: true, image: true } });
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });
    if (post.authorId !== req.user.id) return res.status(403).json({ error: 'Solo puedes eliminar tu propio contenido' });

    // Juntar las imágenes del post y de todo su hilo antes de borrar las filas
    const comentarios = await prisma.forumComment.findMany({
      where: { postId: id },
      select: { image: true }
    });
    const imagenes = [post.image, ...comentarios.map(c => c.image)].filter(Boolean);

    await prisma.$transaction([
      prisma.reaction.deleteMany({ where: { OR: [{ forumPostId: id }, { forumComment: { postId: id } }] } }),
      prisma.notification.deleteMany({ where: { OR: [{ forumPostId: id }, { forumComment: { postId: id } }] } }),
      prisma.forumComment.deleteMany({ where: { postId: id } }),
      prisma.media.deleteMany({ where: { url: { in: imagenes } } }),
      prisma.forumPost.delete({ where: { id } })
    ]);

    await storage.removeMany(imagenes);
    res.json({ deleted: true, id });
  } catch (e) {
    console.error('Error al eliminar post del foro:', e);
    res.status(500).json({ error: 'Error al eliminar el post' });
  }
});

// PUT /api/forum/comments/:id — editar comentario propio
router.put('/comments/:id', requireAuth, requireNotSuspended, async (req, res) => {
  const id = Number(req.params.id);
  const content = (req.body.content || '').trim();
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  if (!content) return res.status(400).json({ error: 'El comentario no puede estar vacío' });
  if (content.length > MAX_COMMENT_LENGTH) {
    return res.status(400).json({ error: `El comentario no puede superar ${MAX_COMMENT_LENGTH} caracteres` });
  }
  try {
    const comment = await prisma.forumComment.findUnique({ where: { id }, select: { authorId: true, deletedAt: true } });
    if (!comment || comment.deletedAt) return res.status(404).json({ error: 'Comentario no encontrado' });
    if (comment.authorId !== req.user.id) return res.status(403).json({ error: 'Solo puedes editar tu propio contenido' });
    const updated = await prisma.forumComment.update({ where: { id }, data: { content }, include: forumCommentInclude });
    res.json(serializeForumComment(updated, req.user.id));
  } catch (e) {
    console.error('Error al editar comentario del foro:', e);
    res.status(500).json({ error: 'Error al editar el comentario' });
  }
});

// DELETE /api/forum/comments/:id — eliminar comentario propio
// Con respuestas: borrado suave ([eliminado]) para no romper el hilo; sin respuestas: borrado real
router.delete('/comments/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const comment = await prisma.forumComment.findUnique({
      where: { id },
      select: { authorId: true, deletedAt: true, image: true, _count: { select: { replies: true } } }
    });
    if (!comment || comment.deletedAt) return res.status(404).json({ error: 'Comentario no encontrado' });
    if (comment.authorId !== req.user.id) return res.status(403).json({ error: 'Solo puedes eliminar tu propio contenido' });

    const borrarImagen = comment.image
      ? [prisma.media.deleteMany({ where: { url: comment.image } })]
      : [];

    if (comment._count.replies > 0) {
      // Borrado suave: la fila sobrevive para no romper el hilo, pero el archivo
      // no — el comentario ya no lo muestra, así que dejarlo sería un huérfano.
      await prisma.$transaction([
        prisma.reaction.deleteMany({ where: { forumCommentId: id } }),
        ...borrarImagen,
        prisma.forumComment.update({ where: { id }, data: { deletedAt: new Date(), content: '', image: null, score: 0 } })
      ]);
      await storage.removeByUrl(comment.image);
      res.json({ deleted: true, soft: true, id });
    } else {
      await prisma.$transaction([
        prisma.reaction.deleteMany({ where: { forumCommentId: id } }),
        prisma.notification.deleteMany({ where: { forumCommentId: id } }),
        ...borrarImagen,
        prisma.forumComment.delete({ where: { id } })
      ]);
      await storage.removeByUrl(comment.image);
      res.json({ deleted: true, soft: false, id });
    }
  } catch (e) {
    console.error('Error al eliminar comentario del foro:', e);
    res.status(500).json({ error: 'Error al eliminar el comentario' });
  }
});

module.exports = router;
