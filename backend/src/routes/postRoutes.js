// Rutas para feed de posteos
const express = require('express');
const router = express.Router();

// TODO: Implementar controladores reales
router.get('/', (req, res) => res.json({ msg: 'Obtener posteos' }));
router.post('/', (req, res) => res.json({ msg: 'Crear posteo' }));
router.post('/:id/like', (req, res) => res.json({ msg: 'Like' }));
router.post('/:id/comment', (req, res) => res.json({ msg: 'Comentar' }));

module.exports = router;
