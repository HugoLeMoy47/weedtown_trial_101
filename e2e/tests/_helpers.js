// Utilidades compartidas por las specs E2E.
const crypto = require('crypto');

/** Agrega un autenticador WebAuthn virtual (CDP) al contexto: simula una
 * llave de acceso real sin depender de hardware ni de un navegador con perfil. */
async function agregarPasskeyVirtual(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true
    }
  });
}

/** Marca la casilla obligatoria de 18+/Términos: todos los botones de acceso
 * de /login están deshabilitados hasta que se acepta. */
async function aceptarTerminos(page) {
  await page.getByRole('checkbox').check();
}

/** Da de alta una cuenta nueva con llave de acceso desde /login y espera a
 * llegar a /feed. Requiere que agregarPasskeyVirtual ya haya corrido.
 * Selectores por rol/nombre accesible (no texto literal ni placeholder): el
 * ciclo 2 reordenó /login en pestañas "Entrar"/"Crear cuenta", y el copy de
 * esta pantalla ya rompió estos helpers una vez por depender de texto exacto. */
async function crearCuentaConPasskey(page, handle) {
  await page.goto('/login', { waitUntil: 'load' });
  await aceptarTerminos(page);
  await page.getByRole('tab', { name: 'Crear cuenta' }).click();
  await page.getByRole('textbox', { name: 'Handle (opcional)' }).fill(handle);
  await page.getByRole('button', { name: 'Crear cuenta con llave de acceso' }).click();
  await page.waitForURL('**/feed', { timeout: 15000 });
}

/** Siembra un MagicLink válido directamente en la base (MAIL_DRIVER=log no
 * manda correo de verdad) y devuelve la URL de callback del backend. */
async function sembrarEnlaceMagico(email, extra = {}) {
  // Se requiere aquí (no arriba) para que solo las specs que lo usan paguen
  // el costo de levantar un Prisma Client apuntando a la base de pruebas.
  const prisma = require(require('path').join(__dirname, '../../backend/src/lib/prisma'));
  const raw = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  await prisma.magicLink.create({
    data: { email, tokenHash, expiresAt: new Date(Date.now() + 15 * 60 * 1000), ...extra }
  });
  const backendUrl = process.env.E2E_BACKEND_URL || 'http://localhost:4020';
  return { url: `${backendUrl}/api/auth/email/callback?token=${raw}`, prisma };
}

module.exports = { agregarPasskeyVirtual, aceptarTerminos, crearCuentaConPasskey, sembrarEnlaceMagico };
