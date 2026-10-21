// Ciclo 19.5: registro de la aceptación de los Términos.
//
// Cuatro cosas que hay que sostener:
//   1. Solo se acepta la versión VIGENTE: una vieja o inventada no escribe nada.
//   2. Es idempotente: la fecha que cuenta es la de la PRIMERA aceptación.
//   3. Es un dato personal como cualquier otro: se exporta y se borra con la cuenta.
//   4. La constante del servidor y la del navegador DICEN LO MISMO, y la cláusula
//      aprobada por el PO está de verdad en Terms.jsx (si no, el aviso describiría
//      un texto que nadie puede leer).
const fs = require('fs');
const path = require('path');
const { suite } = require('./lib');
const { TERMINOS_VIGENTES } = require('../src/lib/terminos');

const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('TerminosAceptacion', 'wtter');

  await cleanup();
  try {
    console.log('\n  — Paridad con el frontend y con el texto publicado —');
    const constanteFront = /export const TERMINOS_VIGENTES = '([^']+)'/.exec(fs.readFileSync(path.join(FRONT, 'lib', 'terminos.js'), 'utf8'));
    check('la constante del navegador existe', Boolean(constanteFront));
    check('y es IGUAL a la del servidor', constanteFront?.[1] === TERMINOS_VIGENTES, `(front ${constanteFront?.[1]} / back ${TERMINOS_VIGENTES})`);
    const terms = fs.readFileSync(path.join(FRONT, 'pages', 'Terms.jsx'), 'utf8');
    check('Terms.jsx muestra la versión vigente (importa la constante)', terms.includes('TERMINOS_VIGENTES'));
    check('Terms.jsx lleva la cláusula «Medición de uso, sin historial»', terms.includes('Medición de uso, sin historial'));
    check('...con su promesa central: solo la fecha, sobrescrita', terms.includes('únicamente la fecha del último día') && terms.includes('sobrescribe'));
    check('...y dice que se borra y se exporta', terms.includes('esa fecha se borra') && terms.includes('exportación de tus datos'));
    check('Terms.jsx declara el registro de aceptación (qué versión y cuándo, se borra y se exporta)',
      terms.includes('Registro de aceptación') && terms.includes('qué versión de estos Términos aceptaste y cuándo'));
    check('Terms.jsx lleva la sección «Aceptación y acceso» con el plazo de 30 días y la cuenta intacta (ciclo 21)',
      terms.includes('Aceptación y acceso') && terms.includes('30 días de anticipación') && terms.includes('tu cuenta no se borra'));
    check('...y la de «Decisiones opcionales»: apagadas por defecto y sin limitar el acceso',
      terms.includes('Decisiones opcionales') && terms.includes('apagado por defecto') && terms.includes('nunca limita tu acceso'));
    check('Terms.jsx sigue prometiendo no guardar historiales persistentes (la cláusula no lo contradice)', terms.includes('historiales de navegación persistentes'));

    const ana = await mkUser('ana');
    const tAna = token(ana.id);

    console.log('\n  — /api/auth/me dice qué versión es la vigente —');
    let r = await call('GET', '/api/auth/me', { tok: tAna });
    check('responde 200', r.status === 200, `(fue ${r.status})`);
    check('trae terminosVigentes del servidor', r.data?.terminosVigentes === TERMINOS_VIGENTES);
    check('una cuenta nueva no tiene versión aceptada (null)', r.data?.terminosVersion === null && r.data?.terminosAceptadosEn === null);

    console.log('\n  — Solo se acepta la versión vigente —');
    r = await call('POST', '/api/profile/me/terminos', { body: { version: TERMINOS_VIGENTES } });
    check('sin sesión → 401', r.status === 401, `(fue ${r.status})`);
    for (const [etiqueta, version] of [
      ['una versión vieja', '2020-01-01'],
      ['una versión inventada con forma válida', '2099-12-31'],
      ['un texto cualquiera', 'la-ultima'],
      ['un intento de inyección', "2026-10-20'; DROP TABLE \"User\"; --"],
      ['un número', 20261020],
      ['vacía', ''],
      ['ausente', undefined]
    ]) {
      r = await call('POST', '/api/profile/me/terminos', { tok: tAna, body: version === undefined ? {} : { version } });
      check(`${etiqueta} → 400`, r.status === 400, `(fue ${r.status})`);
    }
    r = await call('POST', '/api/profile/me/terminos', { tok: tAna });
    check('sin cuerpo → 400', r.status === 400, `(fue ${r.status})`);
    let u = await prisma.user.findUnique({ where: { id: ana.id }, select: { terminosVersion: true, terminosAceptadosEn: true } });
    check('ninguno de esos intentos escribió nada', u.terminosVersion === null && u.terminosAceptadosEn === null);

    console.log('\n  — La versión vigente se registra, y la primera fecha manda —');
    r = await call('POST', '/api/profile/me/terminos', { tok: tAna, body: { version: TERMINOS_VIGENTES } });
    check('aceptar la vigente → 200', r.status === 200, `(fue ${r.status})`);
    check('responde la versión y la fecha', r.data?.terminosVersion === TERMINOS_VIGENTES && Boolean(r.data?.terminosAceptadosEn));
    u = await prisma.user.findUnique({ where: { id: ana.id }, select: { terminosVersion: true, terminosAceptadosEn: true } });
    check('quedó guardada', u.terminosVersion === TERMINOS_VIGENTES && u.terminosAceptadosEn instanceof Date);
    const primera = u.terminosAceptadosEn.getTime();
    await new Promise(res => setTimeout(res, 50));
    r = await call('POST', '/api/profile/me/terminos', { tok: tAna, body: { version: TERMINOS_VIGENTES } });
    check('aceptar de nuevo la misma versión → 200 (idempotente)', r.status === 200);
    u = await prisma.user.findUnique({ where: { id: ana.id }, select: { terminosAceptadosEn: true } });
    check('la fecha NO se movió: cuenta la primera aceptación', u.terminosAceptadosEn.getTime() === primera);
    r = await call('GET', '/api/auth/me', { tok: tAna });
    check('/auth/me ya refleja la aceptación', r.data?.terminosVersion === TERMINOS_VIGENTES);

    console.log('\n  — Una versión anterior se sustituye por la vigente —');
    const beto = await mkUser('beto');
    const tBeto = token(beto.id);
    const antes = new Date(Date.now() - 86400000);
    await prisma.user.update({ where: { id: beto.id }, data: { terminosVersion: '2020-01-01', terminosAceptadosEn: antes } });
    r = await call('POST', '/api/profile/me/terminos', { tok: tBeto, body: { version: TERMINOS_VIGENTES } });
    u = await prisma.user.findUnique({ where: { id: beto.id }, select: { terminosVersion: true, terminosAceptadosEn: true } });
    check('beto pasa de la versión vieja a la vigente', r.status === 200 && u.terminosVersion === TERMINOS_VIGENTES);
    check('...con una fecha nueva (aceptó un texto distinto)', u.terminosAceptadosEn.getTime() > antes.getTime());

    console.log('\n  — Es un dato personal: se exporta y se borra con la cuenta —');
    r = await call('GET', '/api/profile/me/export', { tok: tAna });
    check('la exportación incluye terminosVersion y terminosAceptadosEn',
      r.status === 200 && r.data?.perfil?.terminosVersion === TERMINOS_VIGENTES && Boolean(r.data?.perfil?.terminosAceptadosEn));
    r = await call('DELETE', '/api/profile/me', { tok: tAna, body: { confirm: ana.handle } });
    check('eliminar la cuenta responde 200', r.status === 200, `(fue ${r.status})`);
    u = await prisma.user.findUnique({ where: { id: ana.id }, select: { terminosVersion: true, terminosAceptadosEn: true } });
    check('al anonimizarla, el registro de aceptación se borra', u.terminosVersion === null && u.terminosAceptadosEn === null);
  } finally {
    await cleanup();
  }
  return results;
};
