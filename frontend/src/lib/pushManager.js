// Utilería para registrar el Service Worker y gestionar suscripciones Web Push
import api from '../services/api';

/**
 * Convierte una clave pública VAPID base64url a Uint8Array requerido por PushManager
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getRegistration() {
  if (!isPushSupported()) return null;
  return navigator.serviceWorker.ready;
}

export async function checkPushSubscription() {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub;
  } catch (err) {
    console.error('Error al comprobar suscripción push:', err);
    return null;
  }
}

export async function subscribeToPush() {
  if (!isPushSupported()) {
    throw new Error('Este navegador no soporta notificaciones push.');
  }

  // 1. Pedir permiso explícito al usuario
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permiso de notificaciones no concedido.');
  }

  // 2. Obtener clave pública VAPID del backend
  const { data } = await api.get('/push/public-key');
  if (!data?.publicKey) {
    throw new Error('El servidor no tiene configuradas las llaves Web Push.');
  }

  // 3. Suscribir en el PushManager del navegador
  const reg = await navigator.serviceWorker.ready;
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey)
    });
  }

  // 4. Enviar suscripción al backend
  await api.post('/push/subscribe', {
    subscription: subscription.toJSON()
  });

  return subscription;
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await api.post('/push/unsubscribe', { endpoint }).catch(() => {});
    }
    return true;
  } catch (err) {
    console.error('Error al desuscribir push:', err);
    return false;
  }
}
