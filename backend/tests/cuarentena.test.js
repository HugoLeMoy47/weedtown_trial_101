// Cuarentena diferenciada por método de identidad (HU-SEG-007), ciclo 2.
//
// Antes la regla era binaria: ¿tiene Mastodon? Ahora cada proveedor tiene su
// propia ventana (Mastodon 0h, correo ~3h, llave 24h por default) y la cuenta
// toma la MÁS CORTA de las que tenga. El caso clave del plan es llave+correo:
// debe tomar la ventana corta, no la larga — es el costo aceptado a propósito
// (D1), no algo que "corregir".
const { suite } = require('./lib');
const { estaEstablecida } = require('../src/middlewares/requireAuth');

// Ventanas por default en .env.test (sin overrides): EMAIL=3h, PASSKEY=24h.
const HORAS_EMAIL = Number(process.env.SIGNUP_QUARANTINE_HOURS_EMAIL) || 3;
const HORAS_PASSKEY = Number(process.env.SIGNUP_QUARANTINE_HOURS_PASSKEY) || 24;

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Cuarentena', 'wtcua');

  await cleanup();
  try {
    // Crea una cuenta con las identidades exactas que se pidan (sustituye la
    // MASTODON por default de mkUser) y una antigüedad controlada.
    const crearCuenta = (suffix, identidades, horasDeAntiguedad) => mkUser(suffix, {
      createdAt: new Date(Date.now() - horasDeAntiguedad * 60 * 60 * 1000),
      identities: {
        create: identidades.map((provider, i) => ({
          provider,
          externalId: `wtcua:${provider}:${suffix}:${i}:${Date.now()}:${Math.random()}`,
          instance: provider === 'MASTODON' ? 'wtcua.test' : null
        }))
      }
    });

    console.log('\n  — Mastodon: cuarentena 0h, sin importar la antigüedad —');
    let u = await crearCuenta('mas_j', ['MASTODON'], 0);
    let r = await estaEstablecida(u.id);
    check('cuenta de Mastodon recién creada (0h) → establecida de inmediato', r.ok === true, `(${JSON.stringify(r)})`);

    console.log('\n  — Solo correo: ventana intermedia —');
    u = await crearCuenta('mail_j', ['EMAIL'], 0);
    r = await estaEstablecida(u.id);
    check(`correo con 0h de antigüedad → NO establecida (ventana ${HORAS_EMAIL}h)`, r.ok === false && Boolean(r.disponibleEn), `(${JSON.stringify(r)})`);

    u = await crearCuenta('mail_v', ['EMAIL'], HORAS_EMAIL + 1);
    r = await estaEstablecida(u.id);
    check(`correo con ${HORAS_EMAIL + 1}h de antigüedad → establecida`, r.ok === true, `(${JSON.stringify(r)})`);

    console.log('\n  — Solo llave de acceso: la ventana más larga —');
    u = await crearCuenta('pk_j', ['PASSKEY'], HORAS_EMAIL + 1); // pasó la ventana de correo, pero esta cuenta no tiene correo
    r = await estaEstablecida(u.id);
    check(`llave con ${HORAS_EMAIL + 1}h (menos que ${HORAS_PASSKEY}h) → NO establecida`, r.ok === false, `(${JSON.stringify(r)})`);

    u = await crearCuenta('pk_v', ['PASSKEY'], HORAS_PASSKEY + 1);
    r = await estaEstablecida(u.id);
    check(`llave con ${HORAS_PASSKEY + 1}h → establecida`, r.ok === true, `(${JSON.stringify(r)})`);

    console.log('\n  — Caso clave: llave + correo toma la ventana CORTA —');
    u = await crearCuenta('pk_mail', ['PASSKEY', 'EMAIL'], HORAS_EMAIL + 1);
    r = await estaEstablecida(u.id);
    check(
      `llave+correo con ${HORAS_EMAIL + 1}h (pasó la de correo, no la de llave) → establecida — toma la corta`,
      r.ok === true,
      `(${JSON.stringify(r)})`
    );
    u = await crearCuenta('pk_mail_j', ['PASSKEY', 'EMAIL'], 0);
    r = await estaEstablecida(u.id);
    check('llave+correo recién creada (0h) → NO establecida (ni la ventana corta pasó)', r.ok === false, `(${JSON.stringify(r)})`);

    console.log('\n  — Mastodon + llave: Mastodon manda (0h) —');
    u = await crearCuenta('mas_pk', ['MASTODON', 'PASSKEY'], 0);
    r = await estaEstablecida(u.id);
    check('Mastodon+llave, 0h → establecida (Mastodon pone el piso en 0)', r.ok === true, `(${JSON.stringify(r)})`);

    console.log('\n  — Casos límite —');
    r = await estaEstablecida(999999999);
    check('usuario inexistente → establecida (fail-open)', r.ok === true, `(${JSON.stringify(r)})`);

    console.log('\n  — De punta a punta por HTTP: el toque de Cerca y abrir chat respetan la ventana —');
    const CELL = '5000_8000';
    const nueva = await crearCuenta('h_pk', ['PASSKEY'], 0);
    const establecida = await crearCuenta('h_mail', ['EMAIL'], HORAS_EMAIL + 1);
    const tNueva = token(nueva.id);
    const tEstablecida = token(establecida.id);
    await call('PUT', '/api/nearby/location', { tok: tNueva, body: { cell: CELL } });
    await call('PUT', '/api/nearby/location', { tok: tEstablecida, body: { cell: CELL } });

    r = await call('POST', '/api/nearby/poke', { tok: tNueva, body: { userId: establecida.id } });
    check('toque desde cuenta de llave recién creada → 403 con disponibleEn', r.status === 403 && Boolean(r.data?.disponibleEn), `(${r.status}, ${JSON.stringify(r.data)})`);
    check('el mensaje habla de protección, no de castigo', /protección/i.test(r.data?.error || ''), `(${r.data?.error})`);

    r = await call('POST', '/api/nearby/poke', { tok: tEstablecida, body: { userId: nueva.id } });
    check('toque desde cuenta de correo ya establecida → no lo bloquea la cuarentena (puede dar 404 por cercanía, pero no 403)', r.status !== 403, `(fue ${r.status})`);

    r = await call('POST', '/api/chat/conversations', { tok: tNueva, body: { userId: establecida.id } });
    check('abrir chat nuevo desde cuenta de llave recién creada → 403 con disponibleEn', r.status === 403 && Boolean(r.data?.disponibleEn), `(${r.status}, ${JSON.stringify(r.data)})`);

    r = await call('POST', '/api/chat/conversations', { tok: tEstablecida, body: { userId: nueva.id } });
    check('abrir chat nuevo desde cuenta de correo ya establecida → 200', r.status === 200, `(fue ${r.status})`);
    // Con el chat ya abierto, reabrirlo (recuperar, no crear) no debe pasar por cuarentena aunque sea la cuenta nueva
    r = await call('POST', '/api/chat/conversations', { tok: tNueva, body: { userId: establecida.id } });
    check('recuperar ESE MISMO chat ya existente desde la cuenta nueva → 200 (no es "alcanzar por primera vez")', r.status === 200, `(fue ${r.status})`);
  } finally {
    await cleanup();
  }

  return results;
};
