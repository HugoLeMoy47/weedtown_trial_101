// Rutas para foros tipo blog
const express = require('express');
const router = express.Router();

// TODO: Implementar controladores reales
router.get('/categories', (req, res) => res.json({ msg: 'Obtener categorías' }));
router.get('/', (req, res) => res.json({ msg: 'Obtener publicaciones de foro' }));
router.post('/', (req, res) => res.json({ msg: 'Crear publicación de foro' }));

module.exports = router;
