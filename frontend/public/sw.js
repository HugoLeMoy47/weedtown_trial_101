// Service Worker para WeedTown (Web Push & Notificaciones en segundo plano)

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'WeedTown 🌿';
  const options = {
    body: data.body || 'Tienes una nueva notificación en WeedTown',
    icon: data.icon || '/logo.svg',
    badge: '/logo.svg',
    data: {
      url: data.url || '/',
      notificationId: data.data?.notificationId || null,
      type: data.data?.type || null
    },
    vibrate: [100, 50, 100]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  const rutaDestino = new URL(urlToOpen, self.location.origin).pathname;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Antes se navegaba SIEMPRE la primera ventana que se encontrara, sin
      // mirar en qué estaba: tocar la notificación podía llevarse un
      // posteo largo a medio escribir en otra pestaña. Se prefiere una
      // ventana que YA esté en el destino (nomás enfocarla, sin recargar);
      // si no hay ninguna, se abre una nueva en vez de secuestrar la que
      // esté activa.
      const yaEnDestino = windowClients.find(client => {
        try {
          return new URL(client.url).pathname === rutaDestino;
        } catch {
          return false;
        }
      });
      if (yaEnDestino) {
        return yaEnDestino.focus();
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
      // Navegadores viejos sin openWindow: mejor reutilizar algo que dejar
      // la notificación sin ninguna acción.
      const cualquiera = windowClients[0];
      if (cualquiera && 'focus' in cualquiera) {
        return cualquiera.focus();
      }
    })
  );
});
