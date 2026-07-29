// Passkey: alta de cuenta nueva, cierre de sesión, y volver a entrar con la
// misma llave (login "usernameless"). Es el flujo más nuevo y el que más
// depende de que @simplewebauthn/browser interopere de verdad con el
// backend — por eso usa un navegador real, no solo la suite de integración.
const { test, expect } = require('@playwright/test');
const { agregarPasskeyVirtual, aceptarTerminos, crearCuentaConPasskey } = require('./_helpers');

test('alta con llave de acceso y reingreso con la misma llave', async ({ page, context }) => {
  await agregarPasskeyVirtual(context, page);

  const handle = `e2e_pk_${Date.now()}`;
  await crearCuentaConPasskey(page, handle);
  await expect(page).toHaveURL(/\/feed$/);

  // El perfil muestra el handle elegido y la llave como método de acceso
  await page.goto('/profile', { waitUntil: 'load' });
  await expect(page.getByText(`@${handle}`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Métodos de acceso' })).toBeVisible();
  await expect(page.getByText('Llave de acceso').first()).toBeVisible();

  // Cerrar sesión y volver a entrar con la MISMA llave, sin volver a escribir nada
  await page.evaluate(() => localStorage.removeItem('weedtown_token'));
  await page.goto('/login', { waitUntil: 'load' });
  await aceptarTerminos(page);
  await page.click('button:has-text("Entrar con llave de acceso")');
  await page.waitForURL('**/feed', { timeout: 15000 });
  await expect(page).toHaveURL(/\/feed$/);
});
