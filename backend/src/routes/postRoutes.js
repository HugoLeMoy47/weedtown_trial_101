// Rutas para feed de posteos, reacciones y comentarios
const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const { requireAuth, optionalAuth, requireNotSuspended } = require('../middlewares/requireAuth');
const { REACTION_TYPES, summarizeReactions, toggleReaction, reactionCounts } = require('../lib/reactions');
const { blockedWith, isBlockedBetween, excludeBlocked } = require('../lib/blocks');
const { areFriends, friendIds } = require('../lib/friends');
const storage = require('../lib/storage');
const { soloVisible } = require('../lib/moderation');
const { demasiadosEnlaces, esContenidoRepetido, MAX_LINKS_PER_CONTENT } = require('../lib/antiSpam');

// Topes de contenido: defensa contra payloads abusivos
const MAX_POST_LENGTH = 2000;
const MAX_COMMENT_LENGTH = 1000;
const MAX_HASHTAGS = 10;
const MAX_TAG_LENGTH = 30;
const IMAGE_URL_RE = /^https?:\/\/\S{1,500}$/;
const POST_VISIBILITY = ['PUBLIC', 'FRIENDS'];

// Fragmento de `where` que decide qué posts entran en feed/búsqueda según
// alcance (HU-AMI-003): públicos siempre, propios siempre, y los de "solo
// amigos" únicamente si el autor está en la lista de amigos de quien mira.
function alcanceWhere(viewerId, misAmigos) {
  return {
    OR: [
      { visibility: 'PUBLIC' },
      ...(viewerId ? [{ authorId: viewerId }] : []),
      { visibility: 'FRIENDS', authorId: { in: misAmigos } }
    ]
  };
}

function parseHashtags(raw) {
  if (!Array.isArray(raw)) return null;
  return [...new Set(
    raw.map(t => String(t).replace(/^#/, '').trim().toLowerCase()).filter(Boolean)
  )].filter(tag => tag.length <= MAX_TAG_LENGTH).slice(0, MAX_HASHTAGS);
}

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
    // El contenido de las personas bloqueadas no aparece en el feed, y el total
    // se cuenta con el mismo filtro para que la paginación siga cuadrando.
    const where = {
      ...soloVisible,
      ...excludeBlocked(await blockedWith(req.user?.id)),
      ...alcanceWhere(req.user?.id, await friendIds(req.user?.id))
    };
    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: postInclude
      }),
      prisma.post.count({ where })
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
router.post('/', requireAuth, requireNotSuspended, async (req, res) => {
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  const image = typeof req.body.image === 'string' && req.body.image ? req.body.image : null;
  if (!content) return res.status(400).json({ error: 'Faltan campos requeridos' });
  if (content.length > MAX_POST_LENGTH) {
    return res.status(400).json({ error: `El posteo no puede superar ${MAX_POST_LENGTH} caracteres` });
  }
  if (image && !IMAGE_URL_RE.test(image)) {
    return res.status(400).json({ error: 'Imagen inválida: debe ser una URL http(s)' });
  }
  if (demasiadosEnlaces(content)) {
    return res.status(400).json({ error: `Un posteo no puede traer más de ${MAX_LINKS_PER_CONTENT} enlaces` });
  }
  const visibility = req.body.visibility === undefined ? 'PUBLIC' : req.body.visibility;
  if (!POST_VISIBILITY.includes(visibility)) {
    return res.status(400).json({ error: `Alcance inválido. Usa: ${POST_VISIBILITY.join(', ')}` });
  }
  const tags = parseHashtags(req.body.hashtags) || [];
  try {
    if (await esContenidoRepetido('post', req.user.id, content)) {
      return res.status(429).json({ error: 'Ya publicaste exactamente este mismo contenido hace poco' });
    }
    const post = await prisma.post.create({
      data: {
        content,
        image: image || null,
        visibility,
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
        ...soloVisible,
        ...excludeBlocked(await blockedWith(req.user?.id)),
        AND: [
          alcanceWhere(req.user?.id, await friendIds(req.user?.id)),
          {
            OR: [
              { content: { contains: q, mode: 'insensitive' } },
              { author: { name: { contains: q, mode: 'insensitive' } } }
            ]
          }
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

async function puedeVerPost(post, viewerId) {
  if (!post) return false;
  if (await isBlockedBetween(viewerId, post.authorId)) return false;
  if (post.visibility === 'FRIENDS' && post.authorId !== viewerId && !(await areFriends(viewerId, post.authorId))) {
    return false;
  }
  return true;
}

// Obtener un post por ID. Funciona sin sesión para publicaciones públicas.
router.get('/:id', optionalAuth, async (req, res) => {
  const postId = Number(req.params.id);
  if (!postId) return res.status(400).json({ error: 'ID de post inválido' });
  try {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: postInclude
    });
    if (!post || !await puedeVerPost(post, req.user?.id)) {
      return res.status(404).json({ error: 'Post no encontrado' });
    }
    res.json(serializePost(post, req.user?.id));
  } catch (e) {
    console.error('Error al obtener el post:', e);
    res.status(500).json({ error: 'Error al obtener el post' });
  }
});

// Editar post propio (contenido y hashtags)
router.put('/:id', requireAuth, requireNotSuspended, async (req, res) => {
  const id = Number(req.params.id);
  const content = (req.body.content || '').trim();
  if (!id) return res.status(400).json({ error: 'ID de post inválido' });
  if (!content) return res.status(400).json({ error: 'El contenido no puede estar vacío' });
  if (content.length > MAX_POST_LENGTH) {
    return res.status(400).json({ error: `El posteo no puede superar ${MAX_POST_LENGTH} caracteres` });
  }
  const tags = parseHashtags(req.body.hashtags);
  try {
    const post = await prisma.post.findUnique({ where: { id }, select: { authorId: true } });
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });
    if (post.authorId !== req.user.id) return res.status(403).json({ error: 'Solo puedes editar tu propio contenido' });

    const updated = await prisma.post.update({
      where: { id },
      data: {
        content,
        ...(tags !== null && {
          hashtags: {
            deleteMany: {},
            create: tags.map(tag => ({
              hashtag: { connectOrCreate: { where: { tag }, create: { tag } } }
            }))
          }
        })
      },
      include: postInclude
    });
    res.json(serializePost(updated, req.user.id));
  } catch (e) {
    console.error('Error al editar posteo:', e);
    res.status(500).json({ error: 'Error al editar el posteo' });
  }
});

// Eliminar post propio (con comentarios y reacciones)
router.delete('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID de post inválido' });
  try {
    const post = await prisma.post.findUnique({ where: { id }, select: { authorId: true, image: true } });
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });
    if (post.authorId !== req.user.id) return res.status(403).json({ error: 'Solo puedes eliminar tu propio contenido' });

    // Las imágenes se juntan ANTES de borrar las filas: después ya no hay de
    // dónde sacarlas. Ojo: la imagen vive en el campo `image` del post y de sus
    // comentarios — la tabla Media solo lleva el registro de la subida y nunca
    // se enlazó a un post, así que se limpia por URL.
    const comentarios = await prisma.comment.findMany({
      where: { postId: id },
      select: { image: true }
    });
    const imagenes = [post.image, ...comentarios.map(c => c.image)].filter(Boolean);

    await prisma.$transaction([
      prisma.reaction.deleteMany({ where: { OR: [{ postId: id }, { comment: { postId: id } }] } }),
      prisma.comment.deleteMany({ where: { postId: id } }),
      prisma.hashtagOnPost.deleteMany({ where: { postId: id } }),
      prisma.media.deleteMany({ where: { url: { in: imagenes } } }),
      prisma.post.delete({ where: { id } })
    ]);

    await storage.removeMany(imagenes);
    res.json({ deleted: true, id });
  } catch (e) {
    console.error('Error al eliminar posteo:', e);
    res.status(500).json({ error: 'Error al eliminar el posteo' });
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
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true } });
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });
    const { myReaction } = await toggleReaction(req.user.id, { postId }, type);
    // Solo al AGREGAR o CAMBIAR reacción (myReaction truthy) — quitarla
    // (myReaction null) no notifica, igual que a nadie le avisan que le
    // quitaron un like.
    if (myReaction && post.authorId !== req.user.id) {
      await prisma.notification.create({
        data: { type: 'REACTION', recipientId: post.authorId, actorId: req.user.id, postId }
      });
    }
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
router.post('/:id/comment', requireAuth, requireNotSuspended, async (req, res) => {
  const postId = Number(req.params.id);
  const content = (req.body.content || '').trim();
  const image = typeof req.body.image === 'string' && req.body.image ? req.body.image : null;
  if (!postId) return res.status(400).json({ error: 'ID de post inválido' });
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
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, visibility: true } });
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });
    // Comentar es contactar: con un bloqueo de por medio el post no existe
    if (await isBlockedBetween(req.user.id, post.authorId)) {
      return res.status(404).json({ error: 'Post no encontrado' });
    }
    // Mismo criterio que el feed: un post "solo amigos" no se puede comentar
    // desde afuera aunque se conozca el id.
    if (post.visibility === 'FRIENDS' && post.authorId !== req.user.id && !(await areFriends(req.user.id, post.authorId))) {
      return res.status(404).json({ error: 'Post no encontrado' });
    }
    if (await esContenidoRepetido('comment', req.user.id, content)) {
      return res.status(429).json({ error: 'Ya mandaste exactamente este mismo comentario hace poco' });
    }
    const comment = await prisma.comment.create({
      data: { content, image, postId, authorId: req.user.id },
      include: commentInclude
    });
    if (post.authorId !== req.user.id) {
      await prisma.notification.create({
        data: { type: 'REPLY_POST', recipientId: post.authorId, actorId: req.user.id, postId }
      });
    }
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
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, visibility: true } });
    if (!post || !await puedeVerPost(post, req.user?.id)) {
      return res.status(404).json({ error: 'Post no encontrado' });
    }
    const comments = await prisma.comment.findMany({
      where: { postId, ...soloVisible, ...excludeBlocked(await blockedWith(req.user?.id)) },
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
