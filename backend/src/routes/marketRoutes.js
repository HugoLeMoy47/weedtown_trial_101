// Rutas para espacio de comercio (arrendamiento de inmuebles)
const express = require('express');
const router = express.Router();

// TODO: Implementar controladores reales
router.get('/', (req, res) => res.json({ msg: 'Obtener propiedades' }));
router.post('/', (req, res) => res.json({ msg: 'Publicar propiedad' }));
router.get('/:id', (req, res) => res.json({ msg: 'Detalle de propiedad' }));

module.exports = router;
