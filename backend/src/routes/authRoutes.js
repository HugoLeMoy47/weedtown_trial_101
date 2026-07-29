// Autenticación federada con Mastodon (OAuth 2.0, multi-instancia)
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

const prisma = require('../lib/prisma');
const avatar = require('../lib/avatar');
const { generarUnico: generarHandleUnico } = require('../lib/handle');
const { requireAuth } = require('../middlewares/requireAuth');

const SCOPES = 'read:accounts';

// Normaliza el dominio de instancia: acepta "mastodon.social", "https://mastodon.social/", "@user@mastodon.social"
function normalizeInstance(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let value = raw.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (value.includes('@')) value = value.split('@').pop();
  // Dominio válido: letras/números/guiones y al menos un punto
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value)) return null;
  return value;
}

function redirectUri() {
  return `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/auth/mastodon/callback`;
}

function frontendUrl(path) {
  return `${process.env.FRONTEND_URL || 'http://localhost:3000'}${path}`;
}

// Obtiene (o registra dinámicamente) las credenciales OAuth de esta app en la instancia
async function getOrRegisterApp(instance) {
  const existing = await prisma.mastodonApp.findUnique({ where: { instance } });
  if (existing) return existing;

  const res = await fetch(`https://${instance}/api/v1/apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'WeedTown',
      redirect_uris: redirectUri(),
      scopes: SCOPES,
      website: process.env.FRONTEND_URL || 'http://localhost:3000'
    })
  });
  if (!res.ok) throw new Error(`Registro de app falló en ${instance}: ${res.status}`);
  const app = await res.json();
  if (!app.client_id || !app.client_secret) throw new Error(`Respuesta inválida de ${instance} al registrar app`);

  return prisma.mastodonApp.create({
    data: { instance, clientId: app.client_id, clientSecret: app.client_secret }
  });
}

// GET /api/auth/mastodon/start?instance=mastodon.social
router.get('/mastodon/start', async (req, res) => {
  const instance = normalizeInstance(req.query.instance);
  if (!instance) return res.status(400).json({ error: 'Instancia de Mastodon inválida' });
  try {
    const app = await getOrRegisterApp(instance);
    // state firmado y de corta vida: evita CSRF y lleva la instancia sin estado en servidor
    const state = jwt.sign({ instance, purpose: 'mastodon-oauth' }, process.env.JWT_SECRET, { expiresIn: '10m' });
    const params = new URLSearchParams({
      client_id: app.clientId,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: SCOPES,
      state
    });
    res.redirect(`https://${instance}/oauth/authorize?${params}`);
  } catch (e) {
    console.error('Error iniciando OAuth Mastodon:', e);
    res.redirect(frontendUrl('/login?error=instance'));
  }
});

// GET /api/auth/mastodon/callback?code=...&state=...
router.get('/mastodon/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.redirect(frontendUrl('/login?error=denied'));

  let instance;
  try {
    const payload = jwt.verify(state, process.env.JWT_SECRET);
    if (payload.purpose !== 'mastodon-oauth') throw new Error('state inválido');
    instance = payload.instance;
  } catch {
    return res.redirect(frontendUrl('/login?error=state'));
  }

  try {
    const app = await prisma.mastodonApp.findUnique({ where: { instance } });
    if (!app) throw new Error(`App no registrada para ${instance}`);

    // Canjear el código por un access token
    const tokenRes = await fetch(`https://${instance}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: app.clientId,
        client_secret: app.clientSecret,
        redirect_uri: redirectUri(),
        scope: SCOPES
      })
    });
    if (!tokenRes.ok) throw new Error(`Canje de token falló: ${tokenRes.status}`);
    const { access_token } = await tokenRes.json();

    // Obtener el perfil de la cuenta autenticada
    const profileRes = await fetch(`https://${instance}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    if (!profileRes.ok) throw new Error(`verify_credentials falló: ${profileRes.status}`);
    const account = await profileRes.json();

    // El avatar por defecto es uno GENERADO, no la foto de la instancia: esa
    // foto suele ser la cara de la persona y aparece junto a su zona en "Cerca".
    // Usarla sigue siendo posible, pero como decisión explícita desde el perfil.
    //
    // La semilla se deriva de la identidad federada, así que es estable: la
    // misma cuenta estrena siempre el mismo avatar sin tener que elegir nada.
    const semilla = avatar.semillaDesde(`${instance}:${account.id}`);

    // La identidad ya no vive en User: se busca la fila de Identity de este
    // proveedor. Así, cuando existan llaves de acceso o correo, entrar por
    // cualquiera de ellos lleva a la misma cuenta sin tocar nada de esto.
    const externalId = `${instance}:${account.id}`;
    const identidad = await prisma.identity.findUnique({
      where: { provider_externalId: { provider: 'MASTODON', externalId } },
      include: { user: { select: { id: true } } }
    });

    let user;
    if (identidad) {
      user = identidad.user;
      await prisma.$transaction([
        prisma.identity.update({
          where: { id: identidad.id },
          data: { originHandle: account.acct, lastLoginAt: new Date() }
        }),
        prisma.user.update({
          where: { id: user.id },
          data: {
            displayName: account.display_name || null,
            name: account.display_name || account.username,
            // Ni `handle` ni `avatar` se tocan al volver a entrar: son
            // elecciones de la persona, no datos de origen. Solo se refresca la
            // foto de la instancia, que sí lo es.
            mastodonAvatar: account.avatar || null
          }
        })
      ]);
    } else {
      // Alta: el handle sale del acct de origen, pero ya es de WeedTown y la
      // persona puede cambiarlo desde su perfil.
      const handle = await generarHandleUnico(account.username || account.acct);
      user = await prisma.user.create({
        data: {
          handle,
          displayName: account.display_name || null,
          name: account.display_name || account.username,
          avatar: avatar.urlDeAvatar(semilla),
          mastodonAvatar: account.avatar || null,
          identities: {
            create: {
              provider: 'MASTODON',
              externalId,
              instance,
              originHandle: account.acct,
              lastLoginAt: new Date()
            }
          }
        },
        select: { id: true }
      });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    // Token en el fragmento (#): no llega al servidor del frontend ni queda en logs de acceso
    res.redirect(frontendUrl(`/auth/callback#token=${token}`));
  } catch (e) {
    console.error('Error en callback OAuth Mastodon:', e);
    res.redirect(frontendUrl('/login?error=oauth'));
  }
});

// GET /api/auth/me — usuario de la sesión actual
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, handle: true, displayName: true, email: true,
        name: true, avatar: true, phone: true, fullName: true, bio: true, age: true,
        birthdate: true, gender: true, createdAt: true, updatedAt: true,
        // El rol viaja en la sesión para que el frontend sepa si pintar /admin.
        // No es la autorización: esa se verifica en el servidor en cada petición.
        role: true, suspendedUntil: true, suspendedReason: true,
        // Para que el perfil pueda ofrecer "usar mi foto de Mastodon"
        mastodonAvatar: true
      }
    });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    // La suspensión caduca sola: no se expone si ya venció
    const vigente = user.suspendedUntil && new Date(user.suspendedUntil) > new Date();
    res.json({
      ...user,
      suspendedUntil: vigente ? user.suspendedUntil : null,
      suspendedReason: vigente ? user.suspendedReason : null
    });
  } catch (e) {
    console.error('Error en /auth/me:', e);
    res.status(500).json({ error: 'Error al obtener la sesión' });
  }
});

module.exports = router;
