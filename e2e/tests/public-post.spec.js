// Ciclo 7A: HU-CTA-001 (bloque de invitación), HU-CTA-003 (login con retorno,
// sin bucle) y H1 (fuga de contenido moderado) verificados de punta a punta,
// en un navegador real — no solo por HTTP.
const path = require('path');
const { test, expect } = require('@playwright/test');
const { agregarPasskeyVirtual, aceptarTerminos, crearCuentaConPasskey } = require('./_helpers');

function prisma() {
  return require(path.join(__dirname, '../../backend/src/lib/prisma'));
}

// Publica y devuelve el post creado leyendo la respuesta real de la API —
// no una consulta aparte a la base, que corre en otro proceso Prisma.
async function publicar(page, contenido, { soloAmigos = false } = {}) {
  await page.getByLabel('Crear posteo').click();
  await page.getByLabel('¿Qué quieres compartir?').fill(contenido);
  if (soloAmigos) await page.getByRole('button', { name: 'Solo amigos' }).click();
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/posts') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Publicar' }).click()
  ]);
  await expect(page.getByText(contenido)).toBeVisible({ timeout: 10000 });
  return response.json();
}

test('bloque de invitación: visible sin sesión bajo el posteo, ausente con sesión', async ({ page, context }) => {
  await agregarPasskeyVirtual(context, page);
  await crearCuentaConPasskey(page, `e2e_pub_${Date.now()}`);

  const contenido = `posteo público e2e ${Date.now()}`;
  const post = await publicar(page, contenido);

  // Guarda la sesión para restaurarla después SIN una segunda ceremonia de
  // llave de acceso: el límite de peticiones de /api/auth/passkey (20/15 min)
  // es compartido por toda la suite, y esta prueba no necesita demostrar el
  // login otra vez —eso ya lo cubre passkey.spec.js— solo que la UI reacciona
  // a que haya o no sesión.
  const token = await page.evaluate(() => localStorage.getItem('weedtown_token'));

  // Sin sesión: el posteo se ve y el bloque de invitación aparece debajo,
  // nunca como modal (no hay overlay que capturar).
  await page.evaluate(() => localStorage.removeItem('weedtown_token'));
  await page.goto(`/p/${post.id}`, { waitUntil: 'load' });
  await expect(page.getByText(contenido)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Esta conversación pasa en WeedTown')).toBeVisible();
  const cta = page.getByRole('link', { name: 'Únete a WeedTown' });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', '/login?ref=post');

  // El bloque va DESPUÉS del contenido del posteo en el DOM, nunca antes.
  const html = await page.content();
  expect(html.indexOf(contenido)).toBeGreaterThan(0);
  expect(html.indexOf(contenido)).toBeLessThan(html.indexOf('Esta conversación pasa en WeedTown'));

  // Con sesión: mismo posteo, el bloque desaparece.
  await page.evaluate((t) => localStorage.setItem('weedtown_token', t), token);
  await page.goto(`/p/${post.id}`, { waitUntil: 'load' });
  await expect(page.getByText(contenido)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Esta conversación pasa en WeedTown')).not.toBeVisible();
});

test('posteo de amistades sin sesión: redirige a login y no rebota tras el alta', async ({ page, context }) => {
  await agregarPasskeyVirtual(context, page);
  await crearCuentaConPasskey(page, `e2e_amigos_${Date.now()}`);

  const contenido = `posteo solo amigos e2e ${Date.now()}`;
  const post = await publicar(page, contenido, { soloAmigos: true });

  // Sin sesión, el enlace de un posteo de amistades es 404 → HU-CTA-003
  // redirige a login con retorno, con el mensaje que NO afirma que exista.
  await page.evaluate(() => localStorage.removeItem('weedtown_token'));
  await page.goto(`/p/${post.id}`, { waitUntil: 'load' });
  await page.waitForURL(/\/login\?ref=post&next=/, { timeout: 15000 });
  await expect(page.getByText('Inicia sesión para ver si tienes acceso a esta publicación.')).toBeVisible();

  // Alta de una cuenta que NO es amiga de la autora: sigue sin acceso, pero
  // Trampa 9 dice que no puede haber un segundo rebote a /login.
  await aceptarTerminos(page);
  await page.getByRole('tab', { name: 'Crear cuenta' }).click();
  await page.getByRole('textbox', { name: 'Handle (opcional)' }).fill(`e2e_visitante_${Date.now()}`);
  await page.getByRole('button', { name: 'Crear cuenta con llave de acceso' }).click();

  await page.waitForURL(new RegExp(`/p/${post.id}$`), { timeout: 15000 });
  await expect(page.getByText('Post no encontrado')).toBeVisible({ timeout: 10000 });
  // Si hubiera un segundo rebote, la URL ya no sería esta — confirma que se quedó.
  await expect(page).toHaveURL(new RegExp(`/p/${post.id}$`));
});

test('H1: un posteo oculto por moderación no se resuelve por enlace directo', async ({ page, context }) => {
  await agregarPasskeyVirtual(context, page);
  await crearCuentaConPasskey(page, `e2e_oculto_${Date.now()}`);

  const contenido = `posteo que se oculta e2e ${Date.now()}`;
  const post = await publicar(page, contenido);

  const db = prisma();
  await db.post.update({ where: { id: post.id }, data: { hiddenAt: new Date() } });

  // La propia autora, con sesión, tampoco lo ve más — mismo criterio que el feed.
  await page.goto(`/p/${post.id}`, { waitUntil: 'load' });
  await expect(page.getByText('Post no encontrado')).toBeVisible({ timeout: 15000 });

  await db.$disconnect();
});
