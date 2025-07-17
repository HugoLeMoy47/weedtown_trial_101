// Rutas para feed de posteos
const express = require('express');
const router = express.Router();


const prisma = require('../lib/prisma');

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
        include: { author: { select: { id: true, name: true, avatar: true } } }
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
    res.status(500).json({ error: 'Error al obtener posteos' });
  }
});

// Crear posteo con hashtags
router.post('/', async (req, res) => {
  const { content, image, hashtags, authorId } = req.body;
  if (!content || !authorId) return res.status(400).json({ error: 'Faltan campos requeridos' });
  try {
    const post = await prisma.post.create({
      data: {
        content,
        image: image || '',
        authorId: Number(authorId),
        // hashtags: implementar relación si se modela en Prisma
      }
    });
    res.json(post);
  } catch (e) {
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
      include: { author: { select: { id: true, name: true, avatar: true } } }
    });
    res.json({ results });
  } catch (e) {
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
