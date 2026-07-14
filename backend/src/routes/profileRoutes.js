// Rutas para perfil de usuario
const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const { requireAuth } = require('../middlewares/requireAuth');

const profileSelect = {
  id: true, mastodonInstance: true, acct: true, displayName: true, email: true,
  name: true, avatar: true, phone: true, fullName: true, bio: true, age: true,
  birthdate: true, gender: true, createdAt: true, updatedAt: true
};

// Validación simple de perfil
function validateProfile(data) {
  const errors = [];
  if (data.phone && !/^\+?\d{7,15}$/.test(data.phone)) errors.push('Teléfono inválido');
  if (data.age && (isNaN(data.age) || data.age < 0 || data.age > 120)) errors.push('Edad inválida');
  if (data.birthdate && isNaN(Date.parse(data.birthdate))) errors.push('Fecha de nacimiento inválida');
  if (data.gender && !['masculino', 'femenino', 'otro', ''].includes(data.gender)) errors.push('Género inválido');
  if (data.fullName && data.fullName.length < 2) errors.push('Nombre completo muy corto');
  return errors;
}

// Perfil propio
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: profileSelect });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  } catch (e) {
    console.error('Error al obtener perfil propio:', e);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

// Actualizar perfil propio
router.put('/me', requireAuth, async (req, res) => {
  const data = req.body;
  const errors = validateProfile(data);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: data.name || undefined,
        avatar: data.avatar || undefined,
        phone: data.phone || null,
        fullName: data.fullName || null,
        bio: data.bio || null,
        age: data.age ? Number(data.age) : null,
        birthdate: data.birthdate ? new Date(data.birthdate) : null,
        gender: data.gender || null
      },
      select: profileSelect
    });
    res.json({ message: 'Perfil actualizado', user });
  } catch (e) {
    console.error('Error al actualizar perfil:', e);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

// Perfil público por id
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID requerido' });
  try {
    const user = await prisma.user.findUnique({ where: { id }, select: profileSelect });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  } catch (e) {
    console.error('Error al obtener perfil:', e);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

module.exports = router;
