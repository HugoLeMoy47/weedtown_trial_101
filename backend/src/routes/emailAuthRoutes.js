// Autenticación con enlace mágico por correo.
//
// Mismo patrón de dos pasos que el OAuth de Mastodon (start → callback), pero
// sin intermediario: el "código" es el token que sale por correo, y el
// callback lo canjea directo por la sesión — misma pantalla de destino
// (/auth/callback#token=...) que ya usa Mastodon, sin tocar el frontend.
//
// Con sesión abierta, pedir un enlace no es "entrar": es agregar ese correo
// como método de respaldo a la cuenta actual (ver `addToUserId` en el schema).
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

const prisma = require('../lib/prisma');
const avatar = require('../lib/avatar');
const mailer = require('../lib/mailer');
const { generarUnico: generarHandleUnico } = require('../lib/handle');
const { optionalAuth } = require('../middlewares/requireAuth');
const { log } = require('../lib/logger');

const TOKEN_TTL_MIN = 15;
const REENVIO_COOLDOWN_SEG = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizarEmail(raw) {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

function frontendUrl(path) {
  return `${process.env.FRONTEND_URL || 'http://localhost:3000'}${path}`;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// POST /api/auth/email/start { email }
router.post('/start', optionalAuth, async (req, res) => {
  const email = normalizarEmail(req.body?.email);
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Correo inválido' });
  }
  try {
    // Enfriamiento por correo: no golpear el mismo buzón en ráfaga aunque
    // quien pide el enlace rote de IP. Silencioso — responde igual, solo no
    // manda un segundo correo mientras el primero sigue vigente.
    const reciente = await prisma.magicLink.findFirst({
      where: { email, createdAt: { gte: new Date(Date.now() - REENVIO_COOLDOWN_SEG * 1000) } },
      select: { id: true }
    });
    if (!reciente) {
      const token = crypto.randomBytes(32).toString('base64url');
      await prisma.magicLink.create({
        data: {
          email,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000),
          // Solo si hay sesión: agregar correo de respaldo a la cuenta actual
          addToUserId: req.user?.id ?? null
        }
      });
      const base = process.env.BACKEND_URL || 'http://localhost:4000';
      const url = `${base}/api/auth/email/callback?token=${token}`;
      await mailer.enviarEnlaceMagico(email, url);
    }
    res.json({ message: 'Si el correo es válido, te llegará un enlace para entrar. Revisa spam si no aparece.' });
  } catch (e) {
    console.error('Error enviando enlace mágico:', e);
    res.status(500).json({ error: 'No se pudo enviar el correo. Intenta de nuevo en unos minutos.' });
  }
});

// GET /api/auth/email/callback?token=... — clic en el correo
router.get('/callback', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) return res.redirect(frontendUrl('/login?error=magiclink'));

  try {
    const enlace = await prisma.magicLink.findUnique({ where: { tokenHash: hashToken(token) } });
    const vigente = enlace && !enlace.usedAt && enlace.expiresAt > new Date();
    if (!vigente) return res.redirect(frontendUrl('/login?error=magiclink'));

    // Un solo uso: se marca ANTES de tocar Identity/User. La condición
    // `usedAt: null` en el WHERE hace que, si el enlace se abre dos veces a
    // la vez, solo una de las dos carreras gane el marcado.
    const marcado = await prisma.magicLink.updateMany({
      where: { id: enlace.id, usedAt: null },
      data: { usedAt: new Date() }
    });
    if (marcado.count === 0) return res.redirect(frontendUrl('/login?error=magiclink'));

    const identidad = await prisma.identity.findUnique({
      where: { provider_externalId: { provider: 'EMAIL', externalId: enlace.email } }
    });

    // Se calcula ANTES de las ramas de abajo porque `identidad` cambia de
    // significado según el camino (agregar respaldo vs. alta nueva) — esta
    // bandera es "de verdad se creó una cuenta en esta petición", nada más.
    const esAltaNueva = !enlace.addToUserId && !identidad;

    let userId;
    if (enlace.addToUserId) {
      // Se pidió como respaldo de una cuenta ya abierta.
      if (identidad && identidad.userId !== enlace.addToUserId) {
        // Ese correo ya es el método de acceso de OTRA cuenta: no se fusionan
        // cuentas por accidente desde un clic en el correo.
        return res.redirect(frontendUrl('/login?error=magiclink-en-uso'));
      }
      const dueño = await prisma.user.findUnique({ where: { id: enlace.addToUserId }, select: { id: true } });
      if (!dueño) return res.redirect(frontendUrl('/login?error=magiclink'));
      if (!identidad) {
        await prisma.identity.create({
          data: {
            userId: enlace.addToUserId,
            provider: 'EMAIL',
            externalId: enlace.email,
            originHandle: enlace.email,
            lastLoginAt: new Date()
          }
        });
      } else {
        await prisma.identity.update({ where: { id: identidad.id }, data: { lastLoginAt: new Date() } });
      }
      userId = enlace.addToUserId;
    } else if (identidad) {
      userId = identidad.userId;
      await prisma.identity.update({ where: { id: identidad.id }, data: { lastLoginAt: new Date() } });
    } else {
      // Alta nueva: mismo patrón que el primer login de Mastodon.
      const semilla = avatar.semillaDesde(enlace.email);
      const handle = await generarHandleUnico(enlace.email.split('@')[0]);
      const user = await prisma.user.create({
        data: {
          handle,
          name: handle,
          avatar: avatar.urlDeAvatar(semilla),
          identities: {
            create: {
              provider: 'EMAIL',
              externalId: enlace.email,
              originHandle: enlace.email,
              lastLoginAt: new Date()
            }
          }
        },
        select: { id: true }
      });
      userId = user.id;
    }

    const sessionToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
    log('auth_exito', {
      proveedor: 'EMAIL',
      modo: enlace.addToUserId ? 'agregar' : (identidad ? 'login' : 'alta'),
      userId, requestId: req.id
    });
    // Mismo criterio que Mastodon: `isNew` en la query, no en el fragmento —
    // es la señal para que el frontend registre la atribución (HU-CTA-002).
    res.redirect(frontendUrl(`/auth/callback${esAltaNueva ? '?isNew=1' : ''}#token=${sessionToken}`));
  } catch (e) {
    console.error('Error en callback de enlace mágico:', e);
    res.redirect(frontendUrl('/login?error=magiclink'));
  }
});

module.exports = router;
