// Rutas para suscripción y gestión de Web Push (W3C Push API / VAPID)
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middlewares/requireAuth');
const { getPublicKey } = require('../lib/pushService');
const { log } = require('../lib/logger');

// Únicos servicios de push legítimos: la validación de `web-push` solo exige
// que el endpoint SEA una URL, no que el host lo sea. Sin esta lista, una
// cuenta cualquiera podría registrar `https://169.254.254.169/…` o un
// servicio interno, y cada notificación que le llegara sería un POST del
// servidor contra esa URL — un SSRF que la propia cuenta puede disparar.
const HOSTS_PUSH_PERMITIDOS = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'notify.windows.com',
  'web.push.apple.com'
];

// Tope holgado por cuenta: no evita un uso legítimo (varios dispositivos),
// sí evita llenar la tabla registrando endpoints sin fin.
const MAX_SUBSCRIPCIONES_POR_USUARIO = 10;

function hostPushPermitido(hostname) {
  return HOSTS_PUSH_PERMITIDOS.some(dominio => hostname === dominio || hostname.endsWith(`.${dominio}`));
}

function endpointPushValido(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && hostPushPermitido(url.hostname);
}

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
  if (!endpointPushValido(subscription.endpoint)) {
    return res.status(400).json({ error: 'El endpoint de la suscripción no pertenece a un servicio de push reconocido.' });
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

    // El tope cuenta suscripciones, no aplica a renovar una que ya es tuya.
    if (!previa || previa.userId !== req.user.id) {
      const total = await prisma.pushSubscription.count({ where: { userId: req.user.id } });
      if (total >= MAX_SUBSCRIPCIONES_POR_USUARIO) {
        return res.status(429).json({ error: `No puedes tener más de ${MAX_SUBSCRIPCIONES_POR_USUARIO} suscripciones push activas. Elimina alguna antes de agregar otra.` });
      }
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
