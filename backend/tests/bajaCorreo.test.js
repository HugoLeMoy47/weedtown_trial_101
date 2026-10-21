// Ciclo 22 (B25): la baja en un clic con enlace firmado.
//
// Lo que hay que sostener:
//   1. El token es infalsificable y dice «esta persona, esta finalidad»: uno alterado,
//      de otra persona, de otra finalidad o inventado no sirve.
//   2. Tiene dominio propio: un token de baja NO es una sesión, y una sesión NO es un
//      token de baja.
//   3. La baja es un POST. Un GET (un escáner que «visita» el enlace) no baja a nadie.
//   4. Apaga ESA finalidad y ninguna otra. Es idempotente.
//   5. No revela si la cuenta existe, ni lleva datos de la persona.
//   6. Sirve el POST de un clic que hace el propio cliente de correo (RFC 8058).
const jwt = require('jsonwebtoken');
const { suite } = require('./lib');
const { firmarBaja, verificarBaja, urlsDeBaja } = require('../src/lib/bajaCorreo');
const { FINALIDADES } = require('../src/lib/consentimientos');

module.exports = async function run() {
  const { results, check, call, mkUser, token, cleanup, prisma } = suite('BajaCorreo', 'wtbaj');
  const BASE = `http://localhost:${process.env.PORT || 4010}`;

  const dar = (userId, finalidad) => prisma.consentimiento.upsert({
    where: { userId_finalidad: { userId, finalidad } },
    create: { userId, finalidad, version: FINALIDADES[finalidad].version, otorgado: true },
    update: { otorgado: true, version: FINALIDADES[finalidad].version }
  });
  const estado = async (userId, finalidad) => {
    const f = await prisma.consentimiento.findUnique({ where: { userId_finalidad: { userId, finalidad } } });
    return f ? f.otorgado : null;
  };

  await cleanup();
  try {
    const ana = await mkUser('ana', { email: 'wtbaj_ana@example.test' });
    const beto = await mkUser('beto', { email: 'wtbaj_beto@example.test' });

    console.log('\n  — El token —');
    const tAna = firmarBaja(ana.id, 'comunicaciones_comerciales');
    check('un token firmado se verifica y dice persona y finalidad', JSON.stringify(verificarBaja(tAna)) === JSON.stringify({ userId: ana.id, finalidad: 'comunicaciones_comerciales' }));
    check('es estable: la misma persona y finalidad dan el mismo token', firmarBaja(ana.id, 'comunicaciones_comerciales') === tAna);
    check('otra persona o otra finalidad dan otro token', firmarBaja(beto.id, 'comunicaciones_comerciales') !== tAna && firmarBaja(ana.id, 'avisos_correo') !== tAna);
    check('no lleva el correo ni el handle en claro', !tAna.includes('wtbaj') && !Buffer.from(tAna.split('.')[0], 'base64url').toString().includes('@'));

    const [carga, firma] = tAna.split('.');
    const comoOtro = Buffer.from(`${beto.id}.comunicaciones_comerciales`).toString('base64url');
    const comoOtraFinalidad = Buffer.from(`${ana.id}.avisos_correo`).toString('base64url');
    for (const [etiqueta, malo] of [
      ['con la carga de otra persona y la firma original', `${comoOtro}.${firma}`],
      ['con otra finalidad y la firma original', `${comoOtraFinalidad}.${firma}`],
      ['con la firma alterada', `${carga}.${firma.slice(0, -2)}AA`],
      ['sin firma', carga],
      ['con partes de más', `${tAna}.extra`],
      ['vacío', ''],
      ['no es texto', 12345],
      ['nulo', null],
      ['muy largo', 'a'.repeat(5000)],
      ['basura', '%%%.%%%']
    ]) {
      check(`un token ${etiqueta} no sirve`, verificarBaja(malo) === null);
    }
    const inventado = (carga2) => `${Buffer.from(carga2).toString('base64url')}.${firma}`;
    check('una carga con id negativo o no numérico no sirve', verificarBaja(inventado('-5.comunicaciones_comerciales')) === null && verificarBaja(inventado('abc.comunicaciones_comerciales')) === null);
    check('firmar con un id o una finalidad inválidos lanza (no existe un token inválido «válido»)',
      (() => { try { firmarBaja(0, 'comunicaciones_comerciales'); return false; } catch { return true; } })() &&
      (() => { try { firmarBaja(ana.id, 'inventada'); return false; } catch { return true; } })());

    console.log('\n  — Dominio propio: no es una sesión —');
    const sesion = jwt.sign({ userId: ana.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    check('un JWT de sesión NO vale como token de baja', verificarBaja(sesion) === null);
    let r = await call('GET', '/api/auth/me', { tok: tAna });
    check('un token de baja NO vale como sesión → 401', r.status === 401, `(fue ${r.status})`);

    console.log('\n  — Las dos direcciones del enlace —');
    const urls = urlsDeBaja(ana.id, 'comunicaciones_comerciales', { frontendUrl: 'https://weedtown.social/', backendUrl: 'https://api.weedtown.test/' });
    check('la página que ve la persona', urls.pagina === `https://weedtown.social/baja?token=${tAna}`);
    check('el POST de un clic del cliente de correo', urls.api === `https://api.weedtown.test/api/baja?token=${tAna}`);
    check('sin URL pública de la API no se inventa una', urlsDeBaja(ana.id, 'comunicaciones_comerciales', { frontendUrl: 'https://x.test', backendUrl: '' }).api === '' || Boolean(process.env.BACKEND_URL));

    console.log('\n  — GET /info no cambia nada —');
    await dar(ana.id, 'comunicaciones_comerciales');
    r = await call('GET', `/api/baja/info?token=${tAna}`);
    check('dice qué finalidad es y su título', r.status === 200 && r.data?.finalidad === 'comunicaciones_comerciales' && r.data?.titulo === FINALIDADES.comunicaciones_comerciales.titulo, `(fue ${r.status})`);
    check('...y no cambió nada', (await estado(ana.id, 'comunicaciones_comerciales')) === true);
    r = await call('GET', '/api/baja/info?token=basura');
    check('un token inválido → 400', r.status === 400, `(fue ${r.status})`);
    r = await call('GET', '/api/baja/info');
    check('sin token → 400', r.status === 400, `(fue ${r.status})`);

    console.log('\n  — Un GET (un escáner) no baja a nadie —');
    const get = await fetch(`${BASE}/api/baja?token=${tAna}`);
    check('GET /api/baja no existe → 404', get.status === 404, `(fue ${get.status})`);
    check('...y la persona sigue suscrita', (await estado(ana.id, 'comunicaciones_comerciales')) === true);

    console.log('\n  — La baja —');
    await dar(ana.id, 'avisos_correo');
    r = await call('POST', `/api/baja?token=${tAna}`);
    check('POST con el token → 200 y desactivada', r.status === 200 && r.data?.estado === 'desactivada', `(fue ${r.status})`);
    check('la finalidad quedó apagada en la base', (await estado(ana.id, 'comunicaciones_comerciales')) === false);
    check('...conservando la fila (la prueba de que se respetó)', (await prisma.consentimiento.count({ where: { userId: ana.id, finalidad: 'comunicaciones_comerciales' } })) === 1);
    check('SOLO esa finalidad: la otra de la misma persona sigue como estaba', (await estado(ana.id, 'avisos_correo')) === true);
    r = await call('POST', `/api/baja?token=${tAna}`);
    check('repetirla es idempotente → 200', r.status === 200 && r.data?.estado === 'desactivada');
    check('el token de baja de Ana no toca a Beto', (await estado(beto.id, 'comunicaciones_comerciales')) === null);

    console.log('\n  — El POST de un clic del cliente de correo (RFC 8058) —');
    await dar(ana.id, 'comunicaciones_comerciales');
    const uno = await fetch(`${BASE}/api/baja?token=${tAna}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click'
    });
    check('POST con el cuerpo fijo del formulario y el token en la URL → 200', uno.status === 200, `(fue ${uno.status})`);
    check('...y apaga la finalidad', (await estado(ana.id, 'comunicaciones_comerciales')) === false);
    r = await call('POST', '/api/baja', { body: { token: firmarBaja(ana.id, 'comunicaciones_comerciales') } });
    check('también acepta el token en el cuerpo JSON', r.status === 200);

    console.log('\n  — Lo que no se revela —');
    r = await call('POST', '/api/baja?token=basura');
    check('un token inválido → 400', r.status === 400 && !JSON.stringify(r.data).includes('@'), `(fue ${r.status})`);
    const fantasma = firmarBaja(2147483000, 'comunicaciones_comerciales');
    const rFantasma = await call('POST', `/api/baja?token=${fantasma}`);
    const rReal = await call('POST', `/api/baja?token=${tAna}`);
    check('una cuenta que no existe responde IGUAL que una que sí (no hay oráculo de cuentas)',
      rFantasma.status === 200 && rFantasma.status === rReal.status && JSON.stringify(rFantasma.data) === JSON.stringify(rReal.data));
    check('...y no crea ninguna fila', (await prisma.consentimiento.count({ where: { userId: 2147483000 } })) === 0);
    check('la respuesta no trae ningún dato de la persona', !JSON.stringify(rReal.data).match(/wtbaj|@|handle|email|id"/i), JSON.stringify(rReal.data));

    console.log('\n  — La baja se integra con el envío —');
    check('quien se dio de baja ya no tiene consentimiento activo', (await prisma.consentimiento.findUnique({ where: { userId_finalidad: { userId: ana.id, finalidad: 'comunicaciones_comerciales' } } })).otorgado === false);
    check('y su sesión normal sigue funcionando (la baja no toca la cuenta)', (await call('GET', '/api/auth/me', { tok: token(ana.id) })).status === 200);
  } finally {
    await cleanup();
  }
  return results;
};
