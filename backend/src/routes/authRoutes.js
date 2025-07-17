// Rutas de autenticación (login, registro, OAuth)
const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const bcrypt = require('bcryptjs');

// Registro
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Faltan campos requeridos' });
  try {
    const existe = await prisma.user.findUnique({ where: { email } });
    if (existe) return res.status(400).json({ error: 'El email ya está registrado' });
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hash, name }
    });
    res.json({ id: user.id, email: user.email, name: user.name });
  } catch (e) {
    res.status(500).json({ error: 'Error en el registro' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Faltan campos requeridos' });
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: 'Usuario o contraseña incorrectos' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Usuario o contraseña incorrectos' });
    res.json({ id: user.id, email: user.email, name: user.name });
  } catch (e) {
    res.status(500).json({ error: 'Error en el login' });
  }
});
// ...otros endpoints simulados...
router.post('/forgot-password', (req, res) => res.json({ msg: 'Forgot password' }));
router.get('/oauth/google', (req, res) => res.json({ msg: 'Google OAuth' }));
router.get('/oauth/facebook', (req, res) => res.json({ msg: 'Facebook OAuth' }));

module.exports = router;
