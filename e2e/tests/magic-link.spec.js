// Enlace mágico: seguir el enlace que llegaría por correo debe abrir sesión
// y aterrizar en /feed, igual que hace el callback de Mastodon. El correo en
// sí no se manda (MAIL_DRIVER=log en pruebas): se siembra el token
// directamente, como hace la suite de integración.
const { test, expect } = require('@playwright/test');
const { sembrarEnlaceMagico, aceptarTerminos } = require('./_helpers');

test('seguir el enlace mágico abre sesión y llega al feed', async ({ page }) => {
  const email = `e2e_magico_${Date.now()}@example.com`;
  const { url, prisma } = await sembrarEnlaceMagico(email);

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForURL('**/feed', { timeout: 15000 });
  await expect(page).toHaveURL(/\/feed$/);

  await prisma.$disconnect();
});

test('pedir el enlace desde /login responde sin revelar si el correo ya tenía cuenta', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'load' });
  await aceptarTerminos(page);
  await page.getByRole('textbox', { name: 'Tu correo' }).fill(`e2e_start_${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Entrar con enlace por correo' }).click();
  await expect(page.getByText('Si el correo es válido')).toBeVisible({ timeout: 10000 });
});
