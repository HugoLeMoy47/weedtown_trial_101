// Autenticación federada con Mastodon (OAuth 2.0, multi-instancia)
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

const prisma = require('../lib/prisma');
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

    const user = await prisma.user.upsert({
      where: { mastodonInstance_mastodonId: { mastodonInstance: instance, mastodonId: String(account.id) } },
      update: {
        acct: account.acct,
        displayName: account.display_name || null,
        name: account.display_name || account.username,
        avatar: account.avatar || null
      },
      create: {
        mastodonInstance: instance,
        mastodonId: String(account.id),
        acct: account.acct,
        displayName: account.display_name || null,
        name: account.display_name || account.username,
        avatar: account.avatar || null
      }
    });

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
        id: true, mastodonInstance: true, acct: true, displayName: true, email: true,
        name: true, avatar: true, phone: true, fullName: true, bio: true, age: true,
        birthdate: true, gender: true, createdAt: true, updatedAt: true
      }
    });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  } catch (e) {
    console.error('Error en /auth/me:', e);
    res.status(500).json({ error: 'Error al obtener la sesión' });
  }
});

module.exports = router;
