// Rutas para feed de posteos
const express = require('express');
const router = express.Router();


// Simulación de base de datos de posteos
let posts = [];
for (let i = 1; i <= 100; i++) {
  posts.push({
    id: i,
    author: 'Usuario' + ((i % 10) + 1),
    content: 'Posteo número ' + i,
    image: '',
    createdAt: new Date().toISOString()
  });
}

// GET /api/posts?page=1
router.get('/', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = 20;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const paginated = posts.slice(start, end);
  res.json({
    posts: paginated,
    page,
    totalPages: Math.ceil(posts.length / pageSize),
    total: posts.length
  });
});

// Crear posteo con hashtags
router.post('/', (req, res) => {
  const { content, image, hashtags } = req.body;
  const newPost = {
    id: posts.length + 1,
    author: 'Usuario' + ((posts.length % 10) + 1), // Simulado
    content,
    image: image || '',
    hashtags: Array.isArray(hashtags) ? hashtags : [],
    createdAt: new Date().toISOString()
  };
  posts.unshift(newPost);
  res.json(newPost);
});
// Buscar posteos, usuarios y hashtags
router.get('/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  if (!q) return res.json({ results: [] });
  let results = posts.filter(post =>
    post.content.toLowerCase().includes(q) ||
    post.author.toLowerCase().includes(q) ||
    (post.hashtags && post.hashtags.some(tag => tag.toLowerCase().includes(q.replace('#',''))))
  );
  res.json({ results });
});
router.post('/:id/like', (req, res) => res.json({ msg: 'Like' }));
router.post('/:id/comment', (req, res) => res.json({ msg: 'Comentar' }));

module.exports = router;
