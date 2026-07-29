// Crear un posteo y comentarlo, de punta a punta por la UI: prueba que el
// feed, el modal de creación y la sección de comentarios están cableados de
// verdad contra la API, no solo que cada endpoint responda por su cuenta.
const { test, expect } = require('@playwright/test');
const { agregarPasskeyVirtual, crearCuentaConPasskey } = require('./_helpers');

test('crear un posteo y comentarlo', async ({ page, context }) => {
  await agregarPasskeyVirtual(context, page);
  await crearCuentaConPasskey(page, `e2e_post_${Date.now()}`);

  const contenido = `posteo de prueba e2e ${Date.now()}`;
  await page.getByLabel('Crear posteo').click();
  await page.getByLabel('¿Qué quieres compartir?').fill(contenido);
  await page.getByRole('button', { name: 'Publicar' }).click();

  await expect(page.getByText(contenido)).toBeVisible({ timeout: 10000 });

  // Comentar el post recién creado
  await page.getByLabel(/Ver comentarios|Comentar/).first().click();
  const comentario = `comentario e2e ${Date.now()}`;
  await page.getByPlaceholder('Escribe un comentario…').fill(comentario);
  await page.getByLabel('Publicar comentario').click();
  await expect(page.getByText(comentario)).toBeVisible({ timeout: 10000 });
});
