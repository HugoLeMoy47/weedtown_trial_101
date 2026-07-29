// Rutas para perfil de usuario
const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const { requireAuth, optionalAuth } = require('../middlewares/requireAuth');
const { isBlockedBetween } = require('../lib/blocks');
const avatar = require('../lib/avatar');
const handleLib = require('../lib/handle');

// Perfil propio: incluye los datos personales opcionales
const profileSelect = {
  id: true, handle: true, displayName: true, email: true,
  name: true, avatar: true, mastodonAvatar: true, phone: true, fullName: true,
  bio: true, age: true, birthdate: true, gender: true, createdAt: true, updatedAt: true,
  // Con qué métodos puede entrar esta persona. Solo lo ve su dueño.
  identities: { select: { provider: true, instance: true, createdAt: true } }
};

// Perfil público: sin PII (email, teléfono, nombre real, edad, nacimiento, género)
// y tampoco los métodos de acceso.
//
// La instancia de Mastodon salió de aquí al desacoplar la identidad: era un dato
// de origen que ya no hace falta para identificar a nadie —para eso está el
// handle— y decía en qué servidor del fediverso está la cuenta de esa persona.
// Un dato menos publicado es un dato menos que correlacionar.
const publicProfileSelect = {
  id: true, handle: true, displayName: true,
  name: true, avatar: true, bio: true, createdAt: true
};

// Validación simple de perfil
function validateProfile(data) {
  const errors = [];
  if (data.phone && !/^\+?\d{7,15}$/.test(data.phone)) errors.push('Teléfono inválido');
  if (data.age && (isNaN(data.age) || data.age < 0 || data.age > 120)) errors.push('Edad inválida');
  if (data.birthdate && isNaN(Date.parse(data.birthdate))) errors.push('Fecha de nacimiento inválida');
  if (data.gender && !['masculino', 'femenino', 'otro', ''].includes(data.gender)) errors.push('Género inválido');
  if (data.fullName && data.fullName.length < 2) errors.push('Nombre completo muy corto');
  if (data.fullName && data.fullName.length > 120) errors.push('Nombre completo demasiado largo (máx. 120)');
  if (data.name && String(data.name).length > 80) errors.push('Nombre demasiado largo (máx. 80)');
  if (data.bio && String(data.bio).length > 500) errors.push('La bio no puede superar 500 caracteres');
  return errors;
}

// El avatar no puede ser una URL cualquiera. Solo se aceptan dos cosas: uno de
// los avatares que genera este servidor, o la foto de la propia instancia de
// Mastodon. Antes valía cualquier http(s), lo que permitía apuntar el avatar a
// un rastreador externo — cada vez que alguien viera tu perfil, ese servidor se
// enteraba — o colgar la foto de otra persona.
function validarAvatar(valor, mastodonAvatar) {
  if (!valor) return { ok: true, valor: null };
  const url = String(valor);
  if (avatar.esUrlDeAvatar(url)) return { ok: true, valor: url };
  if (mastodonAvatar && url === mastodonAvatar) return { ok: true, valor: url };
  return {
    ok: false,
    error: 'Avatar inválido: usa uno generado en WeedTown o tu foto de Mastodon'
  };
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
    // El handle es el identificador público: cambiarlo exige validarlo y
    // comprobar que esté libre. Se normaliza primero para que "Hugo LeMoy" y
    // "hugolemoy" no sean dos intentos distintos.
    let nuevoHandle;
    if (data.handle !== undefined) {
      const propuesto = handleLib.normalizar(data.handle);
      const motivo = handleLib.motivoInvalido(propuesto);
      if (motivo) return res.status(400).json({ errors: [motivo] });

      const tomado = await prisma.user.findUnique({
        where: { handle: propuesto },
        select: { id: true }
      });
      if (tomado && tomado.id !== req.user.id) {
        return res.status(409).json({ errors: ['Ese handle ya está en uso'] });
      }
      nuevoHandle = propuesto;
    }

    let nuevoAvatar;
    if (data.avatar !== undefined) {
      const propio = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { mastodonAvatar: true }
      });
      const check = validarAvatar(data.avatar, propio?.mastodonAvatar);
      if (!check.ok) return res.status(400).json({ errors: [check.error] });
      nuevoAvatar = check.valor;
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: data.name || undefined,
        ...(nuevoHandle !== undefined && { handle: nuevoHandle }),
        ...(nuevoAvatar !== undefined && { avatar: nuevoAvatar }),
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

// Perfil público por id. Sigue siendo público (sin sesión se ve igual), pero si
// quien consulta tiene un bloqueo con esa persona, para él no existe.
router.get('/:id', optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID requerido' });
  try {
    const user = await prisma.user.findUnique({ where: { id }, select: publicProfileSelect });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (await isBlockedBetween(req.user?.id, id)) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(user);
  } catch (e) {
    console.error('Error al obtener perfil:', e);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

module.exports = router;
