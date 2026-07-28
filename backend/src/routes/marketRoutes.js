// Rutas para el mercado comunitario: tangibles e intangibles lícitos
// (merch, arte, glass, talleres, cursos, servicios) — fase posterior
const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middlewares/requireAuth');

// Mientras son stubs, la superficie queda cerrada a sesiones válidas: una ruta
// pública sin controlador es una ruta que alguien terminará de escribir sin
// revisar quién puede llamarla. En la Fase 2, el catálogo (GET) se abrirá.
router.use(requireAuth);

// TODO: Implementar controladores reales en la fase de mercado
router.get('/', (req, res) => res.json({ msg: 'Obtener artículos del mercado' }));
router.post('/', (req, res) => res.json({ msg: 'Publicar artículo' }));
router.get('/:id', (req, res) => res.json({ msg: 'Detalle de artículo' }));

module.exports = router;
