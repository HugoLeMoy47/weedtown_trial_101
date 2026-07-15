// Centro de notificaciones in-app (hito foros, entrega 3)
const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const { requireAuth } = require('../middlewares/requireAuth');

const PAGE_SIZE = 20;

// GET /api/notifications?page=1 — últimas notificaciones del usuario
router.get('/', requireAuth, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  try {
    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { recipientId: req.user.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          actor: { select: { id: true, name: true, avatar: true } },
          subforum: { select: { id: true, name: true, slug: true } },
          forumPost: { select: { id: true, title: true, subforum: { select: { slug: true } } } }
        }
      }),
      prisma.notification.count({ where: { recipientId: req.user.id, readAt: null } })
    ]);
    res.json({ notifications, unread });
  } catch (e) {
    console.error('Error al listar notificaciones:', e);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

// GET /api/notifications/unread-count — para el badge de la campana (polling)
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const count = await prisma.notification.count({ where: { recipientId: req.user.id, readAt: null } });
    res.json({ count });
  } catch (e) {
    console.error('Error al contar notificaciones:', e);
    res.status(500).json({ error: 'Error al contar notificaciones' });
  }
});

// POST /api/notifications/read-all — marcar todas como leídas
router.post('/read-all', requireAuth, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { recipientId: req.user.id, readAt: null },
      data: { readAt: new Date() }
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('Error al marcar notificaciones:', e);
    res.status(500).json({ error: 'Error al marcar notificaciones' });
  }
});

module.exports = router;
