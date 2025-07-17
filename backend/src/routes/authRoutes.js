// Rutas de autenticación (login, registro, OAuth)
const express = require('express');
const router = express.Router();

// TODO: Implementar controladores reales
router.post('/login', (req, res) => res.json({ msg: 'Login' }));
router.post('/register', (req, res) => res.json({ msg: 'Register' }));
router.post('/forgot-password', (req, res) => res.json({ msg: 'Forgot password' }));
router.get('/oauth/google', (req, res) => res.json({ msg: 'Google OAuth' }));
router.get('/oauth/facebook', (req, res) => res.json({ msg: 'Facebook OAuth' }));

module.exports = router;
