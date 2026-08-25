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
    const pushSub = await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        userId: req.user.id,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: req.headers['user-agent'] || null
      },
      create: {
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
