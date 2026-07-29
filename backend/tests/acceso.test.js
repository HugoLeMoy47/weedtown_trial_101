// Etapa 2 del plan de autenticación: llaves de acceso (passkey/WebAuthn) y
// enlace mágico por correo, más la cuarentena de altas nuevas para contacto
// directo (HU-SEG-006) que abrir esos dos métodos hizo necesaria.
//
// Las ceremonias de passkey se simulan con un autenticador de software real
// (tests/webauthnAuthenticator.js): produce bytes CBOR/COSE de verdad con los
// helpers de @simplewebauthn/server, así que la verificación del servidor
// corre sin mocks. El enlace mágico se siembra directo en MagicLink —mismo
// criterio que el resto de la suite: HTTP para lo que hay que demostrar a
// través de rutas y middlewares, Prisma para preparar el escenario— porque
// MAIL_DRIVER=log en pruebas no manda el correo de verdad.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { suite, BASE } = require('./lib');
const { crearLlave, responderRegistro, responderLogin } = require('./webauthnAuthenticator');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost:3000'; // debe calzar con FRONTEND_URL de .env.test

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Acceso', 'wtacc');

  async function limpiarEnlaces() {
    await prisma.magicLink.deleteMany({ where: { email: { startsWith: 'wtacc' } } });
  }

  async function crearEnlace(email, extra = {}) {
    const raw = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    await prisma.magicLink.create({
      data: { email, tokenHash, expiresAt: new Date(Date.now() + 15 * 60 * 1000), ...extra }
    });
    return raw;
  }

  // El callback es un redirect (302) hacia el frontend, que no está levantado
  // en las pruebas: hay que evitar que fetch lo siga, o intentaría conectarse
  // a un puerto muerto y tronaría la prueba en vez de dar un resultado.
  async function callback(rawToken) {
    const res = await fetch(`${BASE}/api/auth/email/callback?token=${rawToken}`, { redirect: 'manual' });
    return { status: res.status, location: res.headers.get('location') };
  }

  function tokenDeFragmento(location) {
    const frag = (location || '').split('#')[1] || '';
    return new URLSearchParams(frag).get('token');
  }

  async function crearCuentaEmailPura(suffix, antiguedadHoras = null) {
    const handle = `wtacc_${suffix}`;
    return prisma.user.create({
      data: {
        handle,
        name: handle,
        identities: {
          create: { provider: 'EMAIL', externalId: `${handle}@example.com`, originHandle: `${handle}@example.com` }
        },
        ...(antiguedadHoras !== null ? { createdAt: new Date(Date.now() - antiguedadHoras * 3600 * 1000) } : {})
      }
    });
  }

  await cleanup();
  await limpiarEnlaces();
  try {
    console.log('\n  — Passkey: alta de cuenta nueva —');
    let r = await call('POST', '/api/auth/passkey/register/options', { body: { handle: 'wtacc_pk1' } });
    check('sin sesión da opciones de alta', r.status === 200 && !!r.data.options && !!r.data.regToken, `(${r.status})`);

    const llave1 = crearLlave();
    let attResp = responderRegistro(llave1, { rpID: RP_ID, origin: ORIGIN, challenge: r.data.options.challenge });
    let r2 = await call('POST', '/api/auth/passkey/register/verify', {
      body: { attResp, regToken: r.data.regToken }
    });
    check('la verificación crea la cuenta y da una sesión', r2.status === 200 && typeof r2.data.token === 'string',
      JSON.stringify(r2.data));
    const tokenPk1 = r2.data.token;

    r = await call('GET', '/api/auth/me', { tok: tokenPk1 });
    check('la cuenta nueva usa el handle propuesto', r.status === 200 && r.data.handle?.startsWith('wtacc_pk1'),
      `(${r.data.handle})`);
    const userIdPk1 = r.data.id;

    r = await call('GET', '/api/profile/me', { tok: tokenPk1 });
    check('tiene exactamente una identidad PASSKEY', r.data.identities?.length === 1 && r.data.identities[0].provider === 'PASSKEY');

    console.log('\n  — Passkey: entrar de nuevo con la misma llave —');
    r = await call('POST', '/api/auth/passkey/login/options', {});
    check('da opciones de login sin pedir handle', r.status === 200 && !!r.data.options && !!r.data.loginToken);
    let authResp = responderLogin(llave1, { rpID: RP_ID, origin: ORIGIN, challenge: r.data.options.challenge });
    r2 = await call('POST', '/api/auth/passkey/login/verify', { body: { authResp, loginToken: r.data.loginToken } });
    check('el login verifica y da sesión', r2.status === 200, JSON.stringify(r2.data));
    check('la sesión es de la MISMA cuenta', jwt.verify(r2.data.token, process.env.JWT_SECRET).userId === userIdPk1);

    console.log('\n  — Passkey: agregar una segunda llave a una cuenta con sesión —');
    const ana = await mkUser('ana'); // ya nace con una identidad MASTODON
    const tAna = token(ana.id);
    r = await call('POST', '/api/auth/passkey/register/options', { tok: tAna, body: {} });
    check('con sesión abierta también da opciones', r.status === 200);
    const llave2 = crearLlave();
    attResp = responderRegistro(llave2, { rpID: RP_ID, origin: ORIGIN, challenge: r.data.options.challenge });
    r2 = await call('POST', '/api/auth/passkey/register/verify', {
      tok: tAna, body: { attResp, regToken: r.data.regToken }
    });
    check('se agrega a la cuenta actual, no crea una nueva', r2.status === 200 && !!r2.data.identityId, JSON.stringify(r2.data));

    r = await call('GET', '/api/profile/me', { tok: tAna });
    check('ahora tiene 2 métodos de acceso', r.data.identities.length === 2, `(${r.data.identities.length})`);
    const idPasskeyDeAna = r.data.identities.find(i => i.provider === 'PASSKEY').id;

    console.log('\n  — Passkey: errores de reto —');
    r = await call('POST', '/api/auth/passkey/register/options', { body: { handle: 'wtacc_x' } });
    const optsSignup = r.data;
    attResp = responderRegistro(crearLlave(), { rpID: RP_ID, origin: ORIGIN, challenge: optsSignup.options.challenge });
    r2 = await call('POST', '/api/auth/passkey/register/verify', {
      tok: tAna, body: { attResp, regToken: optsSignup.regToken }
    });
    check('un regToken de ALTA no sirve con sesión abierta → 400', r2.status === 400, `(fue ${r2.status})`);

    const retoVencido = jwt.sign(
      { purpose: 'passkey-register', challenge: 'x', modo: 'signup', userId: null },
      process.env.JWT_SECRET, { expiresIn: '-1s' }
    );
    r2 = await call('POST', '/api/auth/passkey/register/verify', { body: { attResp, regToken: retoVencido } });
    check('un regToken vencido se rechaza → 400', r2.status === 400, `(fue ${r2.status})`);

    const loginTokenSuelto = jwt.sign({ purpose: 'passkey-login', challenge: 'reto-cualquiera' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    authResp = responderLogin(crearLlave(), { rpID: RP_ID, origin: ORIGIN, challenge: 'reto-cualquiera' });
    r2 = await call('POST', '/api/auth/passkey/login/verify', { body: { authResp, loginToken: loginTokenSuelto } });
    check('una llave nunca registrada se rechaza → 400', r2.status === 400, `(fue ${r2.status})`);

    console.log('\n  — Métodos de acceso: borrar —');
    r = await call('DELETE', '/api/auth/identities/999999999', { tok: tAna });
    check('borrar una identidad inexistente → 404', r.status === 404);

    r = await call('DELETE', `/api/auth/identities/${idPasskeyDeAna}`, { tok: tAna });
    check('se puede quitar un método si queda otro → 200', r.status === 200, `(fue ${r.status})`);

    r = await call('GET', '/api/profile/me', { tok: tAna });
    const idMastodonDeAna = r.data.identities[0].id;
    r = await call('DELETE', `/api/auth/identities/${idMastodonDeAna}`, { tok: tAna });
    check('no se puede quitar el ÚLTIMO método de acceso → 400', r.status === 400, `(fue ${r.status})`);

    console.log('\n  — Enlace mágico: validación de /start —');
    r = await call('POST', '/api/auth/email/start', { body: { email: 'no-es-un-correo' } });
    check('correo con formato inválido → 400', r.status === 400);
    r = await call('POST', '/api/auth/email/start', { body: { email: 'wtacc_cualquiera@example.com' } });
    check('correo válido → 200 (exista o no la cuenta, misma respuesta)', r.status === 200, `(fue ${r.status})`);

    console.log('\n  — Enlace mágico: alta y reingreso (token sembrado directo) —');
    const emailAlta = 'wtacc_alta@example.com';
    let raw = await crearEnlace(emailAlta);
    let cb = await callback(raw);
    check('el callback redirige con un token de sesión → 302', cb.status === 302 && cb.location?.includes('/auth/callback#token='),
      `(${cb.status} ${cb.location})`);
    let tk = tokenDeFragmento(cb.location);
    r = await call('GET', '/api/auth/me', { tok: tk });
    check('la sesión resultante tiene handle propio', r.status === 200 && !!r.data.handle);
    const userIdEmail = r.data.id;

    cb = await callback(raw);
    check('reusar el mismo enlace ya no funciona (un solo uso)', cb.status === 302 && cb.location?.includes('error=magiclink'),
      `(${cb.location})`);

    raw = await crearEnlace(emailAlta);
    cb = await callback(raw);
    tk = tokenDeFragmento(cb.location);
    r = await call('GET', '/api/auth/me', { tok: tk });
    check('pedir el enlace de nuevo con el mismo correo entra a la MISMA cuenta', r.data.id === userIdEmail,
      `(${r.data.id} vs ${userIdEmail})`);

    cb = await callback('token-que-jamas-se-emitio');
    check('un token que no existe redirige con error, no truena', cb.status === 302 && cb.location?.includes('error=magiclink'));

    console.log('\n  — Enlace mágico: agregar correo de respaldo con sesión abierta —');
    const beto = await mkUser('beto');
    const tBeto = token(beto.id);
    const emailRespaldo = 'wtacc_respaldo@example.com';
    raw = await crearEnlace(emailRespaldo, { addToUserId: beto.id });
    cb = await callback(raw);
    check('el callback también redirige con token para un correo de respaldo', cb.status === 302 && cb.location?.includes('#token='));
    const decodedResp = jwt.verify(tokenDeFragmento(cb.location), process.env.JWT_SECRET);
    check('el token es de la cuenta que lo pidió, no una cuenta nueva', decodedResp.userId === beto.id);

    r = await call('GET', '/api/profile/me', { tok: tBeto });
    check('el correo quedó agregado a los métodos de Beto', r.data.identities.some(i => i.provider === 'EMAIL' && i.originHandle === emailRespaldo));

    const carla = await mkUser('carla');
    raw = await crearEnlace(emailRespaldo, { addToUserId: carla.id });
    cb = await callback(raw);
    check('agregar un correo que ya es de OTRA cuenta se rechaza', cb.status === 302 && cb.location?.includes('error=magiclink-en-uso'),
      `(${cb.location})`);

    console.log('\n  — Cuarentena de cuentas nuevas: HU-SEG-006 —');
    const nueva = await crearCuentaEmailPura('nueva');
    const tNueva = token(nueva.id);
    const vieja = await crearCuentaEmailPura('vieja', 48); // 48h: ya establecida
    const tVieja = token(vieja.id);
    const destino = await mkUser('destino');
    const CELL = '5000_5000';
    await call('PUT', '/api/nearby/location', { tok: token(destino.id), body: { cell: CELL } });
    await call('PUT', '/api/nearby/location', { tok: tNueva, body: { cell: CELL } });
    await call('PUT', '/api/nearby/location', { tok: tVieja, body: { cell: CELL } });

    r = await call('POST', '/api/nearby/poke', { tok: tNueva, body: { userId: destino.id } });
    check('una cuenta EMAIL recién creada no puede mandar un toque → 403', r.status === 403, `(fue ${r.status})`);

    r = await call('POST', '/api/nearby/poke', { tok: tVieja, body: { userId: destino.id } });
    check('una cuenta EMAIL de +24h sí puede mandar un toque', r.status === 200, `(fue ${r.status})`);

    r = await call('POST', '/api/chat/conversations', { tok: tNueva, body: { userId: destino.id } });
    check('una cuenta EMAIL recién creada no puede abrir un chat nuevo → 403', r.status === 403, `(fue ${r.status})`);

    // Que destino (establecido) abra el chat POR SU LADO no pasa por la
    // cuarentena de nueva — el gate solo mira a quien llama, no al destino.
    r = await call('POST', '/api/chat/conversations', { tok: token(destino.id), body: { userId: nueva.id } });
    check('el otro lado sí puede abrir el chat', r.status === 200, `(fue ${r.status})`);

    r = await call('POST', '/api/chat/conversations', { tok: tNueva, body: { userId: destino.id } });
    check('con el chat ya existente, nueva SÍ puede "abrirlo" — es recuperar, no contactar por primera vez',
      r.status === 200, `(fue ${r.status})`);

    const mastodonNueva = await mkUser('mastnueva');
    await call('PUT', '/api/nearby/location', { tok: token(mastodonNueva.id), body: { cell: CELL } });
    r = await call('POST', '/api/nearby/poke', { tok: token(mastodonNueva.id), body: { userId: destino.id } });
    check('una cuenta con identidad Mastodon no pasa por cuarentena aunque sea nueva', r.status === 200, `(fue ${r.status})`);
  } finally {
    await limpiarEnlaces();
    await cleanup();
  }

  return results;
};
