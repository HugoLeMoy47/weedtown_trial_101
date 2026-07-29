// Bloquear personas (HU-SEG-001).
// Solo se listan y se deshacen los bloqueos PROPIOS: quien fue bloqueado no tiene
// forma de consultar ni de revertir nada — ni de enterarse.
const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const { requireAuth } = require('../middlewares/requireAuth');
const { romperVinculo } = require('../lib/friends');
const { log } = require('../lib/logger');

const publicSelect = { id: true, name: true, displayName: true, avatar: true, handle: true };

// GET /api/blocks — cuentas que yo bloqueé (para poder desbloquearlas)
router.get('/', requireAuth, async (req, res) => {
  try {
    const blocks = await prisma.block.findMany({
      where: { blockerId: req.user.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, blocked: { select: publicSelect } }
    });
    res.json({ blocks: blocks.map(b => ({ ...b.blocked, blockedAt: b.createdAt })) });
  } catch (e) {
    console.error('Error al listar bloqueos:', e);
    res.status(500).json({ error: 'Error al obtener tus bloqueos' });
  }
});

// POST /api/blocks { userId } — bloquear (idempotente)
router.post('/', requireAuth, async (req, res) => {
  const blockedId = Number(req.body.userId);
  if (!blockedId) return res.status(400).json({ error: 'userId requerido' });
  if (blockedId === req.user.id) return res.status(400).json({ error: 'No puedes bloquearte a ti' });
  try {
    const target = await prisma.user.findUnique({ where: { id: blockedId }, select: publicSelect });
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });

    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: req.user.id, blockedId } },
      update: {},
      create: { blockerId: req.user.id, blockedId }
    });

    // Limpieza en AMBAS direcciones: como el efecto del bloqueo es mutuo, las
    // notificaciones entre las dos partes (respuestas, toques) quedan apuntando a
    // contenido que ya nadie puede abrir. Borrarlas evita dejar filas invisibles
    // para siempre en la campana de las dos personas.
    await prisma.notification.deleteMany({
      where: {
        OR: [
          { recipientId: req.user.id, actorId: blockedId },
          { recipientId: blockedId, actorId: req.user.id }
        ]
      }
    });

    // Un bloqueo no debe dejar una amistad (ni una solicitud a medias) corriendo
    // por debajo: mientras dure, ninguna de las dos partes debería seguir
    // apareciendo como amiga de la otra.
    await romperVinculo(req.user.id, blockedId);

    log('bloqueo_creado', { blockerId: req.user.id, blockedId, requestId: req.id });
    res.json({ blocked: true, user: target });
  } catch (e) {
    console.error('Error al bloquear:', e);
    res.status(500).json({ error: 'No se pudo bloquear a esta persona' });
  }
});

// DELETE /api/blocks/:userId — desbloquear (idempotente)
router.delete('/:userId', requireAuth, async (req, res) => {
  const blockedId = Number(req.params.userId);
  if (!blockedId) return res.status(400).json({ error: 'userId inválido' });
  try {
    await prisma.block.deleteMany({ where: { blockerId: req.user.id, blockedId } });
    res.json({ blocked: false, userId: blockedId });
  } catch (e) {
    console.error('Error al desbloquear:', e);
    res.status(500).json({ error: 'No se pudo desbloquear a esta persona' });
  }
});

module.exports = router;
