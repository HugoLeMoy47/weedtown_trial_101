// Servicio de Web Push (W3C Push API / VAPID)
const webpush = require('web-push');
const prisma = require('./prisma');
const { log } = require('./logger');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:soporte@weedtown.social';

let vapidConfigured = false;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  } catch (err) {
    console.error('Error al configurar VAPID details:', err);
  }
}

function getPublicKey() {
  return VAPID_PUBLIC_KEY || null;
}

/**
 * Envía una notificación Web Push a todas las suscripciones activas de un usuario.
 * @param {number} userId - ID del usuario destinatario
 * @param {object} payload - { title, body, icon, url, data }
 */
async function enviarPush(userId, payload) {
  if (!vapidConfigured || !userId) return;

  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId }
    });

    if (subscriptions.length === 0) return;

    const payloadString = JSON.stringify({
      title: payload.title || 'WeedTown',
      body: payload.body || 'Tienes una nueva interacción en WeedTown',
      icon: payload.icon || '/logo.svg',
      badge: '/logo.svg',
      url: payload.url || '/',
      data: payload.data || {}
    });

    const sendPromises = subscriptions.map(async (sub) => {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      try {
        await webpush.sendNotification(pushConfig, payloadString);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          log('push_subscription_expirada', { subscriptionId: sub.id, userId, statusCode: err.statusCode });
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error('Error al enviar Web Push a sub ' + sub.id + ':', err.message);
        }
      }
    });

    await Promise.allSettled(sendPromises);
  } catch (error) {
    console.error('Error en enviarPush para usuario ' + userId + ':', error);
  }
}

module.exports = {
  getPublicKey,
  enviarPush
};
