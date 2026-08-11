// Centro de notificaciones in-app (hito foros, entrega 3)
const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const { requireAuth } = require('../middlewares/requireAuth');
const { blockedWith, excludeBlocked } = require('../lib/blocks');
const { MOTIVO_TEXTO } = require('../lib/moderation');
const { marcarSaludosMutuos } = require('../lib/saludos');

const PAGE_SIZE = 20;

const TIPOS_MODERACION = ['CONTENIDO_OCULTO', 'CUENTA_SUSPENDIDA'];

// Las notificaciones de moderación llevan el motivo pero NO al moderador: en la
// base se guarda para la auditoría, y aquí se omite. Que la comunidad sepa qué
// se retiró y por qué construye confianza; señalar a una persona concreta del
// equipo solo invita a represalias.
function serializar(n) {
  if (!TIPOS_MODERACION.includes(n.type)) return n;
  const { actor, ...resto } = n;
  return { ...resto, actor: null, reasonText: MOTIVO_TEXTO[n.reason] || null };
}

// GET /api/notifications?page=1 — últimas notificaciones del usuario
router.get('/', requireAuth, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  try {
    // Bloquear ya borra las notificaciones existentes de esa persona; este filtro
    // cubre además las que pudieran quedar de una carrera entre ambas operaciones.
    const where = { recipientId: req.user.id, ...excludeBlocked(await blockedWith(req.user.id), 'actorId') };
    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          actor: { select: { id: true, name: true, avatar: true } },
          subforum: { select: { id: true, name: true, slug: true } },
          forumPost: { select: { id: true, title: true, subforum: { select: { slug: true } } } },
          post: { select: { id: true, content: true } },
          comment: { select: { id: true, content: true } }
        }
      }),
      prisma.notification.count({ where: { ...where, readAt: null } })
    ]);
    // 13D: los toques que ya fueron correspondidos viajan marcados, para que
    // la campana pueda ofrecer conversación solo cuando los dos se saludaron.
    // Una consulta para toda la página, no una por fila.
    const conSaludos = await marcarSaludosMutuos(notifications, req.user.id);
    res.json({ notifications: conSaludos.map(serializar), unread });
  } catch (e) {
    console.error('Error al listar notificaciones:', e);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

// GET /api/notifications/unread-count — para el badge de la campana (polling)
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const count = await prisma.notification.count({
      where: {
        recipientId: req.user.id,
        readAt: null,
        ...excludeBlocked(await blockedWith(req.user.id), 'actorId')
      }
    });
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
