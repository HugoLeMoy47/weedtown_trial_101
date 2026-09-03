// Rutas para suscripción y gestión de Web Push (W3C Push API / VAPID)
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middlewares/requireAuth');
const { getPublicKey } = require('../lib/pushService');
const { log } = require('../lib/logger');

// GET /api/push/public-key — expone la clave pública VAPID para el navegador
router.get('/public-key', (req, res) => {
  const publicKey = getPublicKey();
  if (!publicKey) {
    return res.status(503).json({ error: 'Web Push no está configurado en este servidor.' });
  }
  res.json({ publicKey });
});

// POST /api/push/subscribe — registrar o renovar suscripción del dispositivo actual
router.post('/subscribe', requireAuth, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return res.status(400).json({ error: 'Suscripción Web Push inválida o incompleta.' });
  }

  try {
    // En un upsert el WHERE es el control de acceso, y este solo miraba el
    // endpoint: quien conociera el endpoint ajeno se lo apropiaba sin más.
    // Se resuelve con delete + create (no hay updateMany parcial que decida
    // solo) y se deja rastro cuando el dueño cambia — legítimo en un
    // dispositivo compartido, sospechoso en cualquier otro caso.
    const previa = await prisma.pushSubscription.findUnique({
      where: { endpoint: subscription.endpoint },
      select: { userId: true }
    });
    if (previa && previa.userId !== req.user.id) {
      log('push_endpoint_reasignado', { deUserId: previa.userId, aUserId: req.user.id });
    }

    await prisma.pushSubscription.deleteMany({ where: { endpoint: subscription.endpoint } });
    const pushSub = await prisma.pushSubscription.create({
      data: {
        userId: req.user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: req.headers['user-agent'] || null
      }
    });

    log('push_suscripcion_registrada', { userId: req.user.id, subId: pushSub.id });
    res.json({ ok: true, id: pushSub.id });
  } catch (error) {
    console.error('Error al guardar suscripción push:', error);
    res.status(500).json({ error: 'Error al registrar suscripción push.' });
  }
});

// POST /api/push/unsubscribe — desuscribir el dispositivo actual
router.post('/unsubscribe', requireAuth, async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint requerido para desuscribir.' });
  }

  try {
    await prisma.pushSubscription.deleteMany({
      where: {
        endpoint,
        userId: req.user.id
      }
    });

    log('push_suscripcion_eliminada', { userId: req.user.id });
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al eliminar suscripción push:', error);
    res.status(500).json({ error: 'Error al desuscribir push.' });
  }
});

module.exports = router;
