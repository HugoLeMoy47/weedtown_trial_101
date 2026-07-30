// Navegación móvil (ciclo 3): la hamburguesa y el cajón desaparecieron —
// HU-NAV-001/002/003 los reemplazan por una barra flotante inferior (los
// cinco destinos de baseLinks) y un menú de avatar arriba a la derecha.
// Corre solo en el proyecto "Mobile Chrome" (ver playwright.config.js).
const { test, expect } = require('@playwright/test');
const { agregarPasskeyVirtual, crearCuentaConPasskey } = require('./_helpers');

const DESTINOS = ['Feed', 'Foros', 'Chat', 'Cerca', 'Amigos'];

test('los cinco destinos cargan a través de la barra inferior', async ({ page, context }) => {
  await agregarPasskeyVirtual(context, page);
  await crearCuentaConPasskey(page, `e2e_mobilenav_${Date.now()}`);

  for (const destino of DESTINOS) {
    // No usa `exact: true`: el link de "Amigos" lleva un Badge con el conteo
    // de solicitudes pendientes (0 al inicio) que MUI oculta con
    // transform:scale(0), no con display:none — sigue en el árbol de
    // accesibilidad, así que el nombre real es "0 Amigos", no "Amigos". El
    // patrón exige que el destino sea la última palabra, para no confundir
    // "Amigos" con nada más.
    await page.getByRole('link', { name: new RegExp(`(^|\\s)${destino}$`) }).click();
    await expect(page.getByRole('heading', { level: 1, name: destino })).toBeVisible({ timeout: 10000 });
  }
});

test('el menú del avatar reemplaza el enlace directo a /profile en móvil', async ({ page, context }) => {
  await agregarPasskeyVirtual(context, page);
  await crearCuentaConPasskey(page, `e2e_avatarmenu_${Date.now()}`);

  // El avatar ya no navega directo: abre un menú
  await page.getByRole('button', { name: 'Abrir menú de cuenta' }).click();
  await expect(page.getByRole('menuitem', { name: 'Mi perfil' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Modo (claro|oscuro)/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Términos y privacidad' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeVisible();
  // Sin rol de moderación, esta cuenta no debe ver la entrada — comodidad de
  // interfaz, no la protección real (esa la sigue haciendo el servidor).
  await expect(page.getByRole('menuitem', { name: 'Moderación' })).toHaveCount(0);

  await page.getByRole('menuitem', { name: 'Mi perfil' }).click();
  await expect(page).toHaveURL(/\/profile$/);
});

test('la barra se retrae con una conversación de chat abierta y el compositor queda usable', async ({ page, context }) => {
  await agregarPasskeyVirtual(context, page);
  const handle = `e2e_chatbar_${Date.now()}`;
  await crearCuentaConPasskey(page, handle);

  // Siembra una segunda cuenta y una conversación directo en la base — mismo
  // criterio que sembrarEnlaceMagico en _helpers.js: es la parte de la
  // prueba que no tiene sentido manejar por UI.
  //
  // El handle real puede no ser exactamente `handle`: generarUnico() (backend
  // lib/handle.js) lo trunca a 20 caracteres, así que un timestamp completo
  // no sobrevive entero — por eso se busca por prefijo, no por igualdad.
  const prisma = require(require('path').join(__dirname, '../../backend/src/lib/prisma'));
  const yo = await prisma.user.findFirst({ where: { handle: { startsWith: 'e2e_chatbar_' } }, orderBy: { id: 'desc' } });
  const otra = await prisma.user.create({
    data: {
      handle: `e2e_chatbar_b_${Date.now()}`.slice(0, 20),
      name: 'Chat Bar B',
      identities: { create: { provider: 'MASTODON', externalId: `e2e:chatbar:${Date.now()}`, instance: 'e2e.test' } }
    }
  });
  const chat = await prisma.chat.create({ data: { users: { connect: [{ id: yo.id }, { id: otra.id }] } } });
  await prisma.message.create({ data: { chatId: chat.id, senderId: otra.id, content: 'Hola 🌿' } });

  await page.goto('/chat', { waitUntil: 'load' });
  await expect(page.getByRole('heading', { level: 1, name: 'Chat' })).toBeVisible();

  // Lista de conversaciones: la barra sigue presente y el destino activo es Chat
  await expect(page.getByRole('link', { name: new RegExp('(^|\\s)Chat$') })).toBeVisible();

  // Abrir la conversación
  await page.getByText('Chat Bar B').click();
  await expect(page.getByLabel('Volver a la lista de conversaciones')).toBeVisible();

  // La barra se repliega — ninguno de los cinco destinos debe seguir visible
  await expect(page.getByRole('link', { name: new RegExp('(^|\\s)Feed$') })).toBeHidden();

  // El compositor está visible y dentro del viewport (no tapado por nada)
  const compositor = page.getByLabel('Escribir mensaje');
  await expect(compositor).toBeVisible();
  const viewport = page.viewportSize();
  const caja = await compositor.boundingBox();
  expect(caja).not.toBeNull();
  expect(caja.y + caja.height).toBeLessThanOrEqual(viewport.height);

  // Se puede escribir y enviar de verdad con la barra retraída. El hilo
  // (aria-live="polite") es el locator específico: el mismo texto también
  // queda como vista previa en la lista de conversaciones de la izquierda,
  // así que buscarlo en toda la página da un match ambiguo.
  await compositor.fill('Respondiendo con la barra abajo replegada');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(
    page.locator('[aria-live="polite"]').getByText('Respondiendo con la barra abajo replegada')
  ).toBeVisible({ timeout: 10000 });

  // Volver a la lista: la barra reaparece
  await page.getByLabel('Volver a la lista de conversaciones').click();
  await expect(page.getByRole('link', { name: new RegExp('(^|\\s)Feed$') })).toBeVisible();

  // El mensaje real que mandó "yo" por la API (a diferencia del sembrado
  // directo de arriba) sí generó una notificación CHAT_MESSAGE para "otra" —
  // hay que limpiarla antes de poder borrar la cuenta (FK).
  await prisma.notification.deleteMany({ where: { OR: [{ recipientId: otra.id }, { actorId: otra.id }] } });
  await prisma.message.deleteMany({ where: { chatId: chat.id } });
  await prisma.chat.delete({ where: { id: chat.id } });
  await prisma.identity.deleteMany({ where: { userId: otra.id } });
  await prisma.user.delete({ where: { id: otra.id } });
  await prisma.$disconnect();
});
