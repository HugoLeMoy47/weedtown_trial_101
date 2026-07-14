// Rutas para el mercado comunitario: tangibles e intangibles lícitos
// (merch, arte, glass, talleres, cursos, servicios) — fase posterior
const express = require('express');
const router = express.Router();

// TODO: Implementar controladores reales en la fase de mercado
router.get('/', (req, res) => res.json({ msg: 'Obtener artículos del mercado' }));
router.post('/', (req, res) => res.json({ msg: 'Publicar artículo' }));
router.get('/:id', (req, res) => res.json({ msg: 'Detalle de artículo' }));

module.exports = router;
