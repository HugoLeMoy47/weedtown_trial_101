// Ciclo 20: consentimientos por finalidad.
//
// Lo que hay que sostener (el principio del PO: congruentes, y flexibles solo
// siendo claros):
//   1. Sin fila = apagada. Nunca hay un valor por defecto «encendido».
//   2. Solo se activa lo que EXISTE (`disponible`): consentir algo que no existe
//      no es consentimiento informado. Apagar siempre se puede.
//   3. Lo que usa el correo exige que la cuenta TENGA correo.
//   4. Cada finalidad lleva SU versión: un texto que cambió solo vuelve a
//      preguntar por esa finalidad, y un consentimiento de una versión vieja no
//      vale hasta confirmarlo.
//   5. Revocar no borra: queda la fila con su fecha, que es la prueba.
//   6. Es un dato personal: se exporta y se borra con la cuenta.
const { suite } = require('./lib');
const { FINALIDADES, tieneConsentimiento } = require('../src/lib/consentimientos');

const APROBADAS = ['medicion_personal', 'reconocimientos', 'avisos_correo', 'mensajes_comunitarios', 'resumen_cerca', 'comunicaciones_comerciales'];

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Consentimientos', 'wtcons');

  await cleanup();
  try {
    console.log('\n  — El catálogo —');
    check('son EXACTAMENTE las finalidades que aprobó el PO', JSON.stringify(Object.keys(FINALIDADES).sort()) === JSON.stringify([...APROBADAS].sort()));
    check('todas llevan título, para qué, cómo se trata y qué no hacemos',
      Object.values(FINALIDADES).every(f => f.titulo && f.paraQue && f.comoSeTrata && f.queNoHacemos));
    check('todas llevan su propia versión con forma de fecha', Object.values(FINALIDADES).every(f => /^\d{4}-\d{2}-\d{2}$/.test(f.version)));
    const DISPONIBLES = ['comunicaciones_comerciales', 'avisos_correo'];
    check('solo están disponibles las que YA existen (la comercial y, desde que el cron está configurado, los avisos por correo); las demás son «próximamente»',
      DISPONIBLES.every(f => FINALIDADES[f].disponible === true) &&
      APROBADAS.filter(f => !DISPONIBLES.includes(f)).every(f => FINALIDADES[f].disponible === false));
    check('las que usan el correo lo declaran', ['avisos_correo', 'mensajes_comunitarios', 'resumen_cerca', 'comunicaciones_comerciales'].every(f => FINALIDADES[f].requiereCorreo));
    check('la comercial promete no compartir ni vender el correo', /no compartimos ni vendemos/i.test(FINALIDADES.comunicaciones_comerciales.queNoHacemos));

    const sinCorreo = await mkUser('sinc');
    const conCorreo = await mkUser('conc', { email: 'wtcons_conc@example.test' });
    const tSin = token(sinCorreo.id);
    const tCon = token(conCorreo.id);

    console.log('\n  — Todo apagado por defecto —');
    let r = await call('GET', '/api/consentimientos');
    check('sin sesión → 401', r.status === 401, `(fue ${r.status})`);
    r = await call('GET', '/api/consentimientos', { tok: tCon });
    check('responde 200 con las seis', r.status === 200 && r.data?.finalidades?.length === 6, `(fue ${r.status})`);
    check('una cuenta recién creada las tiene TODAS desactivadas', r.data.finalidades.every(f => f.estado === 'desactivada'));
    check('y sin fecha ni versión consentida', r.data.finalidades.every(f => f.decididoEn === null && f.versionConsentida === null));
    check('no hay ninguna fila guardada', (await prisma.consentimiento.count({ where: { userId: conCorreo.id } })) === 0);

    console.log('\n  — Entradas inválidas —');
    r = await call('PUT', '/api/consentimientos/inventada', { tok: tCon, body: { otorgado: true } });
    check('una finalidad que no existe → 404', r.status === 404 && r.data?.codigo === 'finalidad_desconocida', `(fue ${r.status})`);
    r = await call('PUT', '/api/consentimientos/comunicaciones_comerciales', { tok: tCon, body: { otorgado: 'si' } });
    check('otorgado que no es booleano → 400', r.status === 400 && r.data?.codigo === 'otorgado_invalido', `(fue ${r.status})`);
    r = await call('PUT', '/api/consentimientos/comunicaciones_comerciales', { tok: tCon });
    check('sin cuerpo → 400', r.status === 400, `(fue ${r.status})`);
    r = await call('PUT', '/api/consentimientos/comunicaciones_comerciales', { body: { otorgado: true } });
    check('sin sesión → 401', r.status === 401, `(fue ${r.status})`);
    check('nada de eso escribió una fila', (await prisma.consentimiento.count({ where: { userId: conCorreo.id } })) === 0);

    console.log('\n  — Solo se activa lo que existe —');
    r = await call('PUT', '/api/consentimientos/medicion_personal', { tok: tCon, body: { otorgado: true } });
    check('activar algo «próximamente» → 409', r.status === 409 && r.data?.codigo === 'no_disponible', `(fue ${r.status})`);
    check('...y no deja fila', (await prisma.consentimiento.count({ where: { userId: conCorreo.id } })) === 0);
    r = await call('PUT', '/api/consentimientos/medicion_personal', { tok: tCon, body: { otorgado: false } });
    check('apagar algo que no estaba encendido → 200 y sigue desactivada', r.status === 200 && r.data?.estado === 'desactivada', `(fue ${r.status})`);
    check('...sin crear una fila «otorgado: false» de la nada', (await prisma.consentimiento.count({ where: { userId: conCorreo.id } })) === 0);

    console.log('\n  — Lo que usa el correo exige tener correo —');
    r = await call('PUT', '/api/consentimientos/comunicaciones_comerciales', { tok: tSin, body: { otorgado: true } });
    check('sin correo en el perfil → 400 requiere_correo', r.status === 400 && r.data?.codigo === 'requiere_correo', `(fue ${r.status})`);
    check('...y no deja fila', (await prisma.consentimiento.count({ where: { userId: sinCorreo.id } })) === 0);

    console.log('\n  — El correo de contacto: el del perfil O el de su acceso por correo —');
    const soloAcceso = await mkUser('acc');
    await prisma.identity.create({ data: { userId: soloAcceso.id, provider: 'EMAIL', externalId: 'wtcons_Acceso@Example.Test', originHandle: 'x' } });
    const tAcc = token(soloAcceso.id);
    r = await call('GET', '/api/consentimientos', { tok: tAcc });
    check('quien entra por correo (sin User.email, así es casi toda la base real) ve a qué dirección se le escribiría, ENMASCARADA', r.data?.correo === 'w***@example.test', JSON.stringify(r.data?.correo));
    r = await call('PUT', '/api/consentimientos/comunicaciones_comerciales', { tok: tAcc, body: { otorgado: true } });
    check('...y SÍ puede activar una finalidad de correo (antes de este arreglo nadie podía)', r.status === 200 && r.data?.estado === 'activa', `(fue ${r.status})`);
    r = await call('GET', '/api/consentimientos', { tok: tSin });
    check('quien no tiene ninguna dirección (llave de acceso o Mastodon) ve correo null', r.data?.correo === null);
    r = await call('PUT', '/api/consentimientos/comunicaciones_comerciales', { tok: tSin, body: { otorgado: true } });
    check('...y no puede activarla: el mensaje explica por qué', r.status === 400 && r.data?.codigo === 'requiere_correo' && /llave de acceso|Mastodon/.test(r.data?.error), JSON.stringify(r.data));
    r = await call('GET', '/api/consentimientos', { tok: tCon });
    check('con User.email el correo también sale enmascarado, nunca entero', r.data?.correo === 'w***@example.test' && !JSON.stringify(r.data).includes('wtcons_conc'));

    console.log('\n  — Activar, idempotencia y revocar —');
    r = await call('PUT', '/api/consentimientos/comunicaciones_comerciales', { tok: tCon, body: { otorgado: true } });
    check('con correo se activa → 200', r.status === 200 && r.data?.estado === 'activa', `(fue ${r.status})`);
    check('queda con la versión VIGENTE del texto de esa finalidad', r.data?.versionConsentida === FINALIDADES.comunicaciones_comerciales.version);
    let fila = await prisma.consentimiento.findUnique({ where: { userId_finalidad: { userId: conCorreo.id, finalidad: 'comunicaciones_comerciales' } } });
    check('la fila guarda versión, estado y fecha', fila?.otorgado === true && fila.version === FINALIDADES.comunicaciones_comerciales.version && fila.decididoEn instanceof Date);
    const primera = fila.decididoEn.getTime();
    await new Promise(res => setTimeout(res, 50));
    r = await call('PUT', '/api/consentimientos/comunicaciones_comerciales', { tok: tCon, body: { otorgado: true } });
    fila = await prisma.consentimiento.findUnique({ where: { userId_finalidad: { userId: conCorreo.id, finalidad: 'comunicaciones_comerciales' } } });
    check('activar de nuevo es idempotente y NO mueve la fecha', r.status === 200 && fila.decididoEn.getTime() === primera);
    check('tieneConsentimiento (lo que usará quien envíe correos) dice que sí', (await tieneConsentimiento(conCorreo.id, 'comunicaciones_comerciales')) === true);
    check('...y que no para una finalidad que no se dio', (await tieneConsentimiento(conCorreo.id, 'avisos_correo')) === false);
    check('...ni para una que no existe', (await tieneConsentimiento(conCorreo.id, 'inventada')) === false);
    r = await call('GET', '/api/consentimientos', { tok: tCon });
    check('la lista refleja solo esa como activa', r.data.finalidades.filter(f => f.estado === 'activa').map(f => f.finalidad).join() === 'comunicaciones_comerciales');

    await new Promise(res => setTimeout(res, 50));
    r = await call('PUT', '/api/consentimientos/comunicaciones_comerciales', { tok: tCon, body: { otorgado: false } });
    check('apagar → 200 y desactivada', r.status === 200 && r.data?.estado === 'desactivada', `(fue ${r.status})`);
    fila = await prisma.consentimiento.findUnique({ where: { userId_finalidad: { userId: conCorreo.id, finalidad: 'comunicaciones_comerciales' } } });
    check('revocar NO borra: la fila queda con otorgado en falso', fila?.otorgado === false);
    check('...y con la fecha de la revocación (la prueba de que se respetó)', fila.decididoEn.getTime() > primera);
    check('tieneConsentimiento dice que no', (await tieneConsentimiento(conCorreo.id, 'comunicaciones_comerciales')) === false);
    r = await call('PUT', '/api/consentimientos/comunicaciones_comerciales', { tok: tCon, body: { otorgado: true } });
    check('se puede volver a activar', r.status === 200 && r.data?.estado === 'activa');

    console.log('\n  — Cada finalidad lleva su versión —');
    await prisma.consentimiento.update({
      where: { userId_finalidad: { userId: conCorreo.id, finalidad: 'comunicaciones_comerciales' } },
      data: { version: '2020-01-01' }
    });
    r = await call('GET', '/api/consentimientos', { tok: tCon });
    check('un consentimiento de un texto VIEJO se muestra «desactualizada»', r.data.finalidades.find(f => f.finalidad === 'comunicaciones_comerciales')?.estado === 'desactualizada');
    check('y NO vale: tieneConsentimiento dice que no hasta confirmarlo', (await tieneConsentimiento(conCorreo.id, 'comunicaciones_comerciales')) === false);
    r = await call('PUT', '/api/consentimientos/comunicaciones_comerciales', { tok: tCon, body: { otorgado: true } });
    check('confirmarlo de nuevo lo deja activo con la versión vigente', r.data?.estado === 'activa' && r.data?.versionConsentida === FINALIDADES.comunicaciones_comerciales.version);

    console.log('\n  — Una persona no toca las decisiones de otra —');
    r = await call('GET', '/api/consentimientos', { tok: tSin });
    check('la otra cuenta sigue con todo apagado', r.data.finalidades.every(f => f.estado === 'desactivada'));

    console.log('\n  — Es un dato personal: se exporta y se borra con la cuenta —');
    r = await call('GET', '/api/profile/me/export', { tok: tCon });
    const exportada = r.data?.consentimientos || [];
    check('la exportación incluye mis consentimientos con versión, estado y fecha',
      r.status === 200 && exportada.length === 1 && exportada[0].finalidad === 'comunicaciones_comerciales' && exportada[0].otorgado === true && Boolean(exportada[0].decididoEn));
    r = await call('DELETE', '/api/profile/me', { tok: tCon, body: { confirm: conCorreo.handle } });
    check('eliminar la cuenta → 200', r.status === 200, `(fue ${r.status})`);
    check('al anonimizarla, sus consentimientos se borran', (await prisma.consentimiento.count({ where: { userId: conCorreo.id } })) === 0);
  } finally {
    await cleanup();
  }
  return results;
};
