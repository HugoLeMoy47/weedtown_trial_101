// Ciclo 20: la compuerta de la capa base.
//
// Decisión del PO (2026-10-20): quien no acepte la versión vigente de los
// Términos no accede, con 30 días de gracia, y la cuenta NUNCA se borra. Lo que
// hay que sostener:
//   1. Antes del límite no se bloquea a nadie. Desde el límite, solo a quien no
//      aceptó la versión vigente.
//   2. Bloqueado no es incomunicado: las rutas que necesita la pantalla de la
//      compuerta (ver quién soy, aceptar, decidir finalidades, descargar mis
//      datos, eliminar la cuenta) SIGUEN respondiendo. Todo lo demás, 403.
//   3. Se aplica en el SERVIDOR: si solo estuviera en el navegador, bastaría
//      llamar a la API.
//   4. Solo exige la base. Ninguna finalidad opcional condiciona el acceso.
//   5. No hay bomba de tiempo: el entorno de pruebas aleja el límite.
//
// La compuerta con reloj y límite inyectados se prueba contra la FÁBRICA
// `crearRequireAuth` con req/res de juguete sobre la base real; la integración
// por HTTP (con el límite lejano que fija el runner) comprueba lo que se ve.
const { suite } = require('./lib');
const { crearRequireAuth, rutaPermitidaConTerminosPendientes } = require('../src/middlewares/requireAuth');
const { TERMINOS_VIGENTES, LIMITE_POR_DEFECTO, limiteDeTerminos, terminosExigidos } = require('../src/lib/terminos');
const { _vaciarMemoria } = require('../src/lib/actividad');

function res() {
  const r = { estado: null, cuerpo: null };
  r.status = (n) => { r.estado = n; return r; };
  r.json = (c) => { r.cuerpo = c; return r; };
  return r;
}

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('TerminosCompuerta', 'wtcomp');
  const jwt = require('jsonwebtoken');
  const tok = (id) => jwt.sign({ userId: id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  // Ejecuta el middleware y dice qué pasó: 'paso' si llamó a next, o el 4xx.
  const correr = async (mw, usuario, metodo, ruta) => {
    const [baseUrl, ...resto] = ruta.split('|');
    const req = { headers: { authorization: `Bearer ${tok(usuario.id)}` }, method: metodo, baseUrl, path: resto.join('|') || '/' };
    const r = res();
    let paso = false;
    await mw(req, r, () => { paso = true; });
    return { paso, estado: r.estado, cuerpo: r.cuerpo };
  };

  await cleanup();
  _vaciarMemoria();
  try {
    console.log('\n  — La regla, sin base de datos —');
    const ANTES = new Date('2026-11-19T18:00:00Z');   // 12:00 en México
    const DESPUES = new Date('2026-11-20T18:00:00Z');
    check('el límite por defecto es 30 días tras el último envío del aviso (2026-11-23)', LIMITE_POR_DEFECTO === '2026-11-23');
    check('antes del límite NO se exige a nadie', terminosExigidos(null, ANTES, '2026-11-20') === false);
    check('desde el límite SÍ se exige a quien no tiene versión', terminosExigidos(null, DESPUES, '2026-11-20') === true);
    check('...y a quien tiene una versión vieja', terminosExigidos('2020-01-01', DESPUES, '2026-11-20') === true);
    check('quien aceptó la vigente nunca está bloqueado', terminosExigidos(TERMINOS_VIGENTES, new Date('2040-01-01T12:00:00Z'), '2026-11-20') === false);
    check('el límite se mide en el día de MÉXICO, no en UTC (04:00Z del 20 todavía es el 19 allá)',
      terminosExigidos(null, new Date('2026-11-20T04:00:00Z'), '2026-11-20') === false &&
      terminosExigidos(null, new Date('2026-11-20T06:30:00Z'), '2026-11-20') === true);
    check('TERMINOS_LIMITE lo sobreescribe', limiteDeTerminos({ TERMINOS_LIMITE: '2099-12-31' }) === '2099-12-31');
    check('un valor inválido se IGNORA: no se apaga la compuerta con un typo', limiteDeTerminos({ TERMINOS_LIMITE: 'nunca' }) === LIMITE_POR_DEFECTO && limiteDeTerminos({}) === LIMITE_POR_DEFECTO);
    check('el runner de pruebas aleja el límite (sin bomba de tiempo)', limiteDeTerminos() >= '2099-01-01', `(es ${limiteDeTerminos()})`);

    console.log('\n  — Qué rutas siguen respondiendo con la compuerta cerrada —');
    const permitida = (metodo, baseUrl, path) => rutaPermitidaConTerminosPendientes({ method: metodo, baseUrl, path });
    check('GET /api/auth/me', permitida('GET', '/api/auth', '/me'));
    check('POST /api/profile/me/terminos', permitida('POST', '/api/profile', '/me/terminos'));
    check('GET /api/profile/me/export (descargar mis datos)', permitida('GET', '/api/profile', '/me/export'));
    check('DELETE /api/profile/me (eliminar la cuenta)', permitida('DELETE', '/api/profile', '/me'));
    check('GET y PUT /api/consentimientos', permitida('GET', '/api/consentimientos', '/') && permitida('PUT', '/api/consentimientos', '/comunicaciones_comerciales'));
    for (const [m, b, p] of [
      ['GET', '/api/posts', '/'], ['POST', '/api/posts', '/'], ['GET', '/api/chat', '/conversations'],
      ['GET', '/api/profile', '/me'], ['PUT', '/api/profile', '/me'], ['GET', '/api/profile', '/1'],
      ['POST', '/api/chat', '/conversations/1/messages'], ['GET', '/api/admin', '/indicadores'],
      ['DELETE', '/api/auth', '/me'], ['POST', '/api/auth', '/me'], ['GET', '/api/profile', '/me/terminos'],
      ['DELETE', '/api/consentimientos', '/comunicaciones_comerciales']
    ]) {
      check(`${m} ${b}${p} NO está permitida`, permitida(m, b, p) === false);
    }

    console.log('\n  — El middleware con reloj inyectado —');
    const sinAceptar = await mkUser('sinacep');
    const previa = await mkUser('previa'); // la que se usa ANTES del límite (esa llamada sí cuenta en el medidor)
    const aceptada = await mkUser('acept', { terminosVersion: TERMINOS_VIGENTES, terminosAceptadosEn: new Date() });
    const vieja = await mkUser('vieja', { terminosVersion: '2020-01-01', terminosAceptadosEn: new Date() });
    const borrada = await mkUser('borrada', { deletedAt: new Date() });
    const antes = crearRequireAuth({ ahora: () => ANTES, limite: () => '2026-11-20' });
    const despues = crearRequireAuth({ ahora: () => DESPUES, limite: () => '2026-11-20' });

    let x = await correr(antes, previa, 'GET', '/api/posts|/');
    check('ANTES del límite: quien no aceptó pasa', x.paso === true && x.estado === null);
    x = await correr(despues, sinAceptar, 'GET', '/api/posts|/');
    check('DESDE el límite: quien no aceptó recibe 403', x.paso === false && x.estado === 403);
    check('...con el código TERMINOS_PENDIENTES, la versión vigente y el límite',
      x.cuerpo?.code === 'TERMINOS_PENDIENTES' && x.cuerpo?.terminosVigentes === TERMINOS_VIGENTES && x.cuerpo?.terminosLimite === '2026-11-20');
    x = await correr(despues, vieja, 'POST', '/api/posts|/');
    check('quien tiene una versión VIEJA también', x.paso === false && x.estado === 403);
    x = await correr(despues, aceptada, 'GET', '/api/posts|/');
    check('quien aceptó la vigente pasa siempre', x.paso === true);
    for (const [m, b, p] of [['GET', '/api/auth', '/me'], ['POST', '/api/profile', '/me/terminos'], ['GET', '/api/profile', '/me/export'], ['DELETE', '/api/profile', '/me'], ['GET', '/api/consentimientos', '/']]) {
      x = await correr(despues, sinAceptar, m, `${b}|${p}`);
      check(`bloqueada, pero ${m} ${b}${p} SIGUE respondiendo`, x.paso === true);
    }
    x = await correr(despues, borrada, 'GET', '/api/auth|/me');
    check('una cuenta eliminada sigue siendo 401 (la compuerta no lo cambia)', x.paso === false && x.estado === 401);
    const sinToken = res();
    await despues({ headers: {}, method: 'GET', baseUrl: '/api/posts', path: '/' }, sinToken, () => {});
    check('sin token sigue siendo 401', sinToken.estado === 401);

    console.log('\n  — La medición no cuenta a quien aún no aceptó la base —');
    await new Promise(r => setTimeout(r, 400));
    const marcaBloqueada = (await prisma.user.findUnique({ where: { id: sinAceptar.id }, select: { ultimaActividadDia: true } })).ultimaActividadDia;
    check('un usuario bloqueado NO queda en el medidor (ultimaActividadDia sigue vacía)', marcaBloqueada === null);
    const marcaAntes = (await prisma.user.findUnique({ where: { id: aceptada.id }, select: { ultimaActividadDia: true } })).ultimaActividadDia;
    check('y el que sí aceptó cuenta como siempre', marcaAntes !== null);

    console.log('\n  — La integración por HTTP (límite lejano, sin bomba de tiempo) —');
    const ana = await mkUser('http');
    let r = await call('GET', '/api/auth/me', { tok: token(ana.id) });
    check('/auth/me trae terminosLimite del servidor', typeof r.data?.terminosLimite === 'string', `(fue ${JSON.stringify(r.data?.terminosLimite)})`);
    check('...y terminosExigidos en falso mientras no llegue el límite', r.data?.terminosExigidos === false);
    r = await call('GET', '/api/posts', { tok: token(ana.id) });
    check('una cuenta sin versión aceptada sigue usando la API normalmente antes del límite', r.status === 200, `(fue ${r.status})`);
    r = await call('POST', '/api/profile/me/terminos', { tok: token(ana.id), body: { version: TERMINOS_VIGENTES } });
    check('aceptar sigue funcionando', r.status === 200);
  } finally {
    await cleanup();
  }
  return results;
};
