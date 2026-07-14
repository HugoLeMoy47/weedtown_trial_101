// Rutas para feed de posteos
const express = require('express');
const router = express.Router();


const prisma = require('../lib/prisma');
const { requireAuth } = require('../middlewares/requireAuth');

const postInclude = {
  author: { select: { id: true, name: true, avatar: true } },
  hashtags: { include: { hashtag: true } }
};

// GET /api/posts?page=1
router.get('/', async (req, res) => {
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
      posts,
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
    res.json(post);
  } catch (e) {
    console.error('Error al crear posteo:', e);
    res.status(500).json({ error: 'Error al crear posteo' });
  }
});
// Buscar posteos por contenido o autor
router.get('/search', async (req, res) => {
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
    res.json({ results });
  } catch (e) {
    console.error('Error en la búsqueda:', e);
    res.status(500).json({ error: 'Error en la búsqueda' });
  }
});
// Like a un post (requiere modelo de likes en Prisma)
router.post('/:id/like', async (req, res) => {
  // Implementar lógica de likes si se modela en Prisma
  res.json({ msg: 'Like (no implementado aún)' });
});

// Comentar un post (requiere modelo de comentarios en Prisma)
router.post('/:id/comment', async (req, res) => {
  // Implementar lógica de comentarios si se modela en Prisma
  res.json({ msg: 'Comentar (no implementado aún)' });
});

module.exports = router;
