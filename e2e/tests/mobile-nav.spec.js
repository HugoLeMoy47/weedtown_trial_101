// Línea base de navegación móvil (HU-QA-001): antes de esto, NINGUNA prueba
// automatizada había ejercitado el menú hamburguesa ni el layout responsivo
// — es exactamente la superficie que el rediseño móvil (ciclo 3) va a
// reescribir. Esta spec prueba el estado ACTUAL a propósito, para poder
// detectar qué rompe ese rediseño más adelante; no valida "buen" diseño móvil.
// Corre solo en el proyecto "Mobile Chrome" (ver playwright.config.js).
const { test, expect } = require('@playwright/test');
const { agregarPasskeyVirtual, crearCuentaConPasskey } = require('./_helpers');

const DESTINOS = ['Feed', 'Foros', 'Chat', 'Cerca', 'Amigos'];

test('los cinco destinos cargan a través del menú hamburguesa', async ({ page, context }) => {
  await agregarPasskeyVirtual(context, page);
  await crearCuentaConPasskey(page, `e2e_mobilenav_${Date.now()}`);

  for (const destino of DESTINOS) {
    await page.getByLabel('Abrir menú de navegación').click();
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
