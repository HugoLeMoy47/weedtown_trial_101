// Rutas para panel administrativo
const express = require('express');
const router = express.Router();

// TODO: Implementar controladores reales
router.get('/users', (req, res) => res.json({ msg: 'Gestión de usuarios' }));
router.get('/stats', (req, res) => res.json({ msg: 'Estadísticas de uso' }));
router.post('/moderate', (req, res) => res.json({ msg: 'Moderación de contenido' }));

module.exports = router;
