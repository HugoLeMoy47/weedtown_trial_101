// Rutas para chat 1 a 1
const express = require('express');
const router = express.Router();

// TODO: Implementar controladores reales
router.get('/contacts', (req, res) => res.json({ msg: 'Lista de contactos' }));
router.get('/messages/:userId', (req, res) => res.json({ msg: 'Mensajes con usuario' }));
router.post('/messages/:userId', (req, res) => res.json({ msg: 'Enviar mensaje' }));

module.exports = router;
