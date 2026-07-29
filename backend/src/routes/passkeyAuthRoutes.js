// Autenticación con llave de acceso (passkey / WebAuthn).
//
// Dos flujos comparten las mismas dos rutas (options → verify):
//   - Con sesión abierta (Authorization: Bearer): agrega una llave a la cuenta actual.
//   - Sin sesión: da de alta una cuenta nueva con esa llave — igual que el
//     primer login de Mastodon crea la cuenta la primera vez que entra.
//
// El reto (challenge) no se guarda en el servidor: viaja firmado en un JWT de
// vida corta hacia el navegador y vuelve en la verificación. Mismo patrón que
// el "state" del OAuth de Mastodon (ver authRoutes.js) — así no hace falta
// sesión de servidor entre las dos peticiones.
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const router = express.Router();

const prisma = require('../lib/prisma');
const avatar = require('../lib/avatar');
const { rpName, rpID, origin } = require('../lib/webauthn');
const { generarUnico: generarHandleUnico } = require('../lib/handle');
const { optionalAuth } = require('../middlewares/requireAuth');

function firmarReto(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function leerReto(token, purpose) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (payload.purpose !== purpose) throw new Error('token de reto con propósito inesperado');
  return payload;
}

// POST /api/auth/passkey/register/options
// body: { handle? } — solo se usa cuando no hay sesión (alta nueva), como sugerencia
router.post('/register/options', optionalAuth, async (req, res) => {
  try {
    const autenticado = Boolean(req.user?.id);
    let userIDBuffer, userName, userDisplayName;
    let excludeCredentials = [];

    if (autenticado) {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, handle: true, name: true }
      });
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
      userIDBuffer = Buffer.from(String(user.id), 'utf8');
      userName = user.handle;
      userDisplayName = user.name || user.handle;

      const propias = await prisma.identity.findMany({
        where: { userId: user.id, provider: 'PASSKEY' },
        select: { externalId: true }
      });
      excludeCredentials = propias.map(p => ({ id: p.externalId }));
    } else {
      // Alta nueva: todavía no hay cuenta. Un id aleatorio identifica esta
      // ceremonia sin comprometerse con ningún handle hasta que se verifique.
      userIDBuffer = crypto.randomBytes(16);
      userName = 'Nueva cuenta WeedTown';
      userDisplayName = 'Nueva cuenta';
    }

    const options = await generateRegistrationOptions({
      rpName,
      rpID: rpID(),
      userID: userIDBuffer,
      userName,
      userDisplayName,
      attestationType: 'none',
      excludeCredentials,
      // residentKey 'required': la llave queda descubrible en el dispositivo,
      // que es lo que permite el login "usernameless" de /login/options.
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }
    });

    const regToken = firmarReto({
      purpose: 'passkey-register',
      challenge: options.challenge,
      modo: autenticado ? 'add' : 'signup',
      userId: autenticado ? req.user.id : null,
      handlePropuesto: typeof req.body?.handle === 'string' ? req.body.handle.slice(0, 40) : null
    });

    res.json({ options, regToken });
  } catch (e) {
    console.error('Error generando opciones de registro de passkey:', e);
    res.status(500).json({ error: 'No se pudieron generar las opciones de registro' });
  }
});

// POST /api/auth/passkey/register/verify
// body: { attResp, regToken }
router.post('/register/verify', optionalAuth, async (req, res) => {
  const { attResp, regToken } = req.body || {};
  if (!attResp || !regToken) return res.status(400).json({ error: 'Falta la respuesta del autenticador' });

  let reto;
  try {
    reto = leerReto(regToken, 'passkey-register');
  } catch {
    return res.status(400).json({ error: 'El registro expiró o es inválido. Intenta de nuevo.' });
  }

  // El modo tiene que calzar con el estado de sesión actual de esta petición:
  // no se puede verificar un alta "signup" con sesión abierta, ni al revés.
  const autenticado = Boolean(req.user?.id);
  const modoValido = reto.modo === 'add'
    ? autenticado && reto.userId === req.user.id
    : reto.modo === 'signup' && !autenticado;
  if (!modoValido) return res.status(400).json({ error: 'El registro no corresponde a esta sesión' });

  try {
    const verificacion = await verifyRegistrationResponse({
      response: attResp,
      expectedChallenge: reto.challenge,
      expectedOrigin: origin(),
      expectedRPID: rpID()
    });
    if (!verificacion.verified || !verificacion.registrationInfo) {
      return res.status(400).json({ error: 'No se pudo verificar la llave de acceso' });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verificacion.registrationInfo;
    const transports = (attResp.response?.transports || []).join(',') || null;
    const datosPasskey = {
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp
    };

    if (reto.modo === 'add') {
      const identity = await prisma.identity.create({
        data: {
          userId: req.user.id,
          provider: 'PASSKEY',
          externalId: credential.id,
          originHandle: 'Llave de acceso',
          lastLoginAt: new Date(),
          passkey: { create: datosPasskey }
        }
      });
      return res.json({ message: 'Llave de acceso registrada', identityId: identity.id });
    }

    // Alta nueva: mismo patrón que el primer login de Mastodon — se crea la
    // cuenta con avatar generado a partir de un identificador estable.
    const semilla = avatar.semillaDesde(credential.id);
    const handle = await generarHandleUnico(reto.handlePropuesto || 'wtuser');
    const user = await prisma.user.create({
      data: {
        handle,
        name: handle,
        avatar: avatar.urlDeAvatar(semilla),
        identities: {
          create: {
            provider: 'PASSKEY',
            externalId: credential.id,
            originHandle: 'Llave de acceso',
            lastLoginAt: new Date(),
            passkey: { create: datosPasskey }
          }
        }
      },
      select: { id: true }
    });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (e) {
    console.error('Error verificando registro de passkey:', e);
    res.status(400).json({ error: 'No se pudo completar el registro de la llave de acceso' });
  }
});

// POST /api/auth/passkey/login/options
router.post('/login/options', async (req, res) => {
  try {
    const options = await generateAuthenticationOptions({
      rpID: rpID(),
      userVerification: 'preferred'
      // allowCredentials vacío a propósito: es login "usernameless" — el
      // navegador ofrece las llaves de este dominio guardadas en el dispositivo.
    });
    const loginToken = firmarReto({ purpose: 'passkey-login', challenge: options.challenge });
    res.json({ options, loginToken });
  } catch (e) {
    console.error('Error generando opciones de acceso con passkey:', e);
    res.status(500).json({ error: 'No se pudieron generar las opciones de acceso' });
  }
});

// POST /api/auth/passkey/login/verify
// body: { authResp, loginToken }
router.post('/login/verify', async (req, res) => {
  const { authResp, loginToken } = req.body || {};
  if (!authResp || !loginToken) return res.status(400).json({ error: 'Falta la respuesta del autenticador' });

  let reto;
  try {
    reto = leerReto(loginToken, 'passkey-login');
  } catch {
    return res.status(400).json({ error: 'El intento de acceso expiró. Intenta de nuevo.' });
  }

  try {
    const credentialId = authResp.id;
    const identidad = await prisma.identity.findUnique({
      where: { provider_externalId: { provider: 'PASSKEY', externalId: credentialId } },
      include: { passkey: true }
    });
    if (!identidad || !identidad.passkey) {
      return res.status(400).json({ error: 'Llave de acceso no reconocida' });
    }

    const verificacion = await verifyAuthenticationResponse({
      response: authResp,
      expectedChallenge: reto.challenge,
      expectedOrigin: origin(),
      expectedRPID: rpID(),
      credential: {
        id: identidad.externalId,
        publicKey: identidad.passkey.publicKey,
        counter: identidad.passkey.counter,
        transports: identidad.passkey.transports ? identidad.passkey.transports.split(',') : undefined
      }
    });
    if (!verificacion.verified) {
      return res.status(400).json({ error: 'No se pudo verificar la llave de acceso' });
    }

    // El contador anti-replay debe crecer en cada uso; si un clon de la llave
    // reporta uno igual o menor, algo raro pasó — pero eso ya lo rechaza
    // verifyAuthenticationResponse antes de llegar aquí.
    await prisma.$transaction([
      prisma.passkey.update({
        where: { identityId: identidad.id },
        data: { counter: verificacion.authenticationInfo.newCounter }
      }),
      prisma.identity.update({ where: { id: identidad.id }, data: { lastLoginAt: new Date() } })
    ]);

    const token = jwt.sign({ userId: identidad.userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (e) {
    console.error('Error verificando acceso con passkey:', e);
    res.status(400).json({ error: 'No se pudo completar el acceso' });
  }
});

module.exports = router;
