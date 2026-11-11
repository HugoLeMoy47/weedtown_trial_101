// B8: el correo «¿cómo estás?» a quien lleva 21 días sin entrar.
//
// Lo que hay que sostener:
//   1. Solo a quien tiene `mensajes_comunitarios` ACTIVO y vigente, con correo y cuenta viva.
//   2. El criterio es 21 días sobre `ultimaActividadDia`; 20 no alcanza y sin fecha no entra.
//   3. UNO SOLO POR AUSENCIA: no se repite al día siguiente; sí tras volver y ausentarse de nuevo.
//   4. La constancia se guarda solo si el correo salió (el tope de uno al día lo pospone).
//   5. El correo no lleva nada de nadie ni cuántos días lleva la persona sin entrar.
//   6. La finalidad sigue apagada: el mecanismo existe, pero nadie puede activarla todavía.
//   7. La ruta del cron exige el secreto y devuelve solo cuentas.
// Todo con reloj inyectado: ninguna fecha depende del día en que corre la suite.
const { suite } = require('./lib');
const {
  FINALIDAD, DIAS_DE_AUSENCIA, corteDeAusencia, ausentesPendientes, armarMensaje, enviarMensajesComunitarios
} = require('../src/lib/mensajeComunitario');
const { FINALIDADES } = require('../src/lib/consentimientos');

module.exports = async function run() {
  const { results, check, call, mkUser, cleanup, prisma } = suite('MensajeComunitario', 'wtcom');
  const AHORA = new Date('2033-10-15T18:00:00.000Z');          // 15 de octubre en México
  const dia = (iso) => new Date(`${iso}T00:00:00.000Z`);
  const masDias = (n) => new Date(AHORA.getTime() + n * 86400000);

  const dar = (userId, extra = {}) => prisma.consentimiento.upsert({
    where: { userId_finalidad: { userId, finalidad: FINALIDAD } },
    create: { userId, finalidad: FINALIDAD, version: FINALIDADES[FINALIDAD].version, otorgado: true, ...extra },
    update: { otorgado: true, version: FINALIDADES[FINALIDAD].version, ...extra }
  });
  const constancia = async (id) => {
    const u = await prisma.user.findUnique({ where: { id }, select: { avisoAusenciaDia: true } });
    return u.avisoAusenciaDia ? u.avisoAusenciaDia.toISOString().slice(0, 10) : null;
  };
  const limpiarDias = () => prisma.conteoCorreo.deleteMany({ where: { dia: { gte: new Date('2033-01-01'), lt: new Date('2034-01-01') } } });
  const idsDe = async (ahora) => (await ausentesPendientes(prisma, ahora)).map(p => p.userId);

  await cleanup();
  await limpiarDias();
  try {
    console.log('\n  — El criterio —');
    check('son 21 días (decisión del PO)', DIAS_DE_AUSENCIA === 21);
    check('el corte es el día de México menos 21', corteDeAusencia(AHORA).toISOString().slice(0, 10) === '2033-09-24');
    check('a las 23:30 de México sigue siendo el mismo día (no el de UTC)',
      corteDeAusencia(new Date('2033-10-16T05:30:00.000Z')).toISOString().slice(0, 10) === '2033-09-24');

    console.log('\n  — A quién —');
    const ana = await mkUser('ana', { email: 'wtcom_ana@example.test', ultimaActividadDia: dia('2033-09-24'), name: 'wtcom_NombreDeAna' });
    await dar(ana.id);
    // Entra solo por correo (sin User.email): así es casi toda la base real.
    const otra = await mkUser('otra', { ultimaActividadDia: dia('2033-08-01') });
    await prisma.identity.create({ data: { userId: otra.id, provider: 'EMAIL', externalId: 'wtcom_otra@example.test', originHandle: 'x' } });
    await dar(otra.id);

    const reciente = await mkUser('rec', { email: 'wtcom_rec@example.test', ultimaActividadDia: dia('2033-09-25') });
    await dar(reciente.id);
    const sinCons = await mkUser('sinc', { email: 'wtcom_sinc@example.test', ultimaActividadDia: dia('2033-08-01') });
    const apagada = await mkUser('apag', { email: 'wtcom_apag@example.test', ultimaActividadDia: dia('2033-08-01') });
    await dar(apagada.id, { otorgado: false });
    const vieja = await mkUser('vieja', { email: 'wtcom_vieja@example.test', ultimaActividadDia: dia('2033-08-01') });
    await dar(vieja.id, { version: '2020-01-01' });
    const sinCorreo = await mkUser('sinco', { ultimaActividadDia: dia('2033-08-01') });
    await dar(sinCorreo.id);
    const borrada = await mkUser('borr', { email: 'wtcom_borr@example.test', ultimaActividadDia: dia('2033-08-01'), deletedAt: new Date() });
    await dar(borrada.id);
    const sinFecha = await mkUser('sinf', { email: 'wtcom_sinf@example.test' });
    await dar(sinFecha.id);

    let ids = await idsDe(AHORA);
    check('entra quien lleva exactamente 21 días', ids.includes(ana.id));
    check('entra quien solo tiene correo como identidad de acceso', ids.includes(otra.id));
    check('20 días no alcanza', !ids.includes(reciente.id));
    check('sin consentimiento, apagado o de una versión vieja: no', !ids.includes(sinCons.id) && !ids.includes(apagada.id) && !ids.includes(vieja.id));
    check('sin correo o con la cuenta eliminada: no', !ids.includes(sinCorreo.id) && !ids.includes(borrada.id));
    check('sin fecha de actividad no entra (no se sabe nada de ella)', !ids.includes(sinFecha.id));

    // Mañana cumpliría 21 días: se retira para que no se cuele en las corridas de abajo.
    await dar(reciente.id, { otorgado: false });

    console.log('\n  — El correo —');
    const m = armarMensaje({ urlBase: 'https://weedtown.social' });
    check('pregunta cómo está y enlaza a la app', m.asunto === '¿Cómo estás?' && m.texto.includes('https://weedtown.social/feed') && m.html.includes('https://weedtown.social/feed'));
    check('dice que es uno solo', m.texto.includes('una sola vez'));
    check('no dice cuántos días lleva sin entrar', !/\b\d+\s+d[ií]as\b/.test(m.texto));
    check('no trae su propio enlace de baja (lo pone enviarCorreo)', !/baja/i.test(m.texto));

    console.log('\n  — Enviar: uno solo por ausencia —');
    const enviados = [];
    const mailer = { enviarAviso: async (a) => { enviados.push(a); } };
    const mios = () => enviados.filter(e => e.email.startsWith('wtcom_'));
    let salida = await enviarMensajesComunitarios({ prisma, mailer, ahora: AHORA });
    check('sale uno a cada ausente con consentimiento', salida.enviados === 2 && mios().length === 2, JSON.stringify(salida));
    check('devuelve solo cuentas, nunca a quién', JSON.stringify(salida) === JSON.stringify({ candidatas: 2, enviados: 2, omitidos: {} }));
    const alAna = mios().find(e => e.email === 'wtcom_ana@example.test');
    check('lleva el pie con la baja y las cabeceras de un clic', alAna.texto.includes('baja en un clic') && Boolean(alAna.headers['List-Unsubscribe']));
    check('el pie nombra la finalidad correcta', alAna.texto.includes(FINALIDADES[FINALIDAD].titulo));
    check('no lleva el nombre de nadie', !/NombreDeAna/.test(`${alAna.asunto} ${alAna.texto} ${alAna.html}`));
    check('queda la constancia de la ausencia', (await constancia(ana.id)) === '2033-09-24' && (await constancia(otra.id)) === '2033-08-01');

    salida = await enviarMensajesComunitarios({ prisma, mailer, ahora: masDias(1) });
    check('al día siguiente no se repite', salida.candidatas === 0 && salida.enviados === 0 && mios().length === 2, JSON.stringify(salida));
    salida = await enviarMensajesComunitarios({ prisma, mailer, ahora: masDias(60) });
    check('ni dos meses después, si la persona no ha vuelto', salida.enviados === 0 && mios().length === 2, JSON.stringify(salida));

    console.log('\n  — Volver y ausentarse de nuevo —');
    await prisma.user.update({ where: { id: ana.id }, data: { ultimaActividadDia: dia('2033-10-20') } });
    ids = await idsDe(new Date('2033-11-09T18:00:00.000Z'));
    check('volvió hace 20 días: todavía no', !ids.includes(ana.id));
    salida = await enviarMensajesComunitarios({ prisma, mailer, ahora: new Date('2033-11-10T18:00:00.000Z') });
    check('una ausencia NUEVA de 21 días sí genera otro', salida.enviados === 1 && mios().length === 3, JSON.stringify(salida));
    check('y la constancia pasa a la ausencia nueva', (await constancia(ana.id)) === '2033-10-20');

    console.log('\n  — Si el correo no sale, no hay constancia —');
    const HOY2 = new Date('2033-12-01T18:00:00.000Z');
    const tope = await mkUser('tope', { email: 'wtcom_tope@example.test', ultimaActividadDia: dia('2033-11-01'), ultimoCorreoDia: dia('2033-12-01') });
    await dar(tope.id);
    const susp = await mkUser('susp', { email: 'wtcom_susp@example.test', ultimaActividadDia: dia('2033-11-01'), suspendedUntil: new Date('2040-01-01') });
    await dar(susp.id);
    salida = await enviarMensajesComunitarios({ prisma, mailer, ahora: HOY2 });
    check('quien ya recibió un correo hoy se pospone; la cuenta suspendida no recibe',
      salida.enviados === 0 && salida.omitidos.tope_diario_persona === 1 && salida.omitidos.cuenta_suspendida === 1, JSON.stringify(salida));
    check('ninguna de las dos queda marcada', (await constancia(tope.id)) === null && (await constancia(susp.id)) === null);
    salida = await enviarMensajesComunitarios({ prisma, mailer, ahora: new Date('2033-12-02T18:00:00.000Z') });
    check('al día siguiente sí le llega a la pospuesta', salida.enviados === 1 && (await constancia(tope.id)) === '2033-11-01', JSON.stringify(salida));

    const fallo = await mkUser('fallo', { email: 'wtcom_fallo@example.test', ultimaActividadDia: dia('2033-11-01') });
    await dar(fallo.id);
    salida = await enviarMensajesComunitarios({ prisma, mailer: { enviarAviso: async () => { throw new Error('proveedor caído'); } }, ahora: new Date('2033-12-03T18:00:00.000Z') });
    check('si el proveedor falla no queda constancia y se reintenta después', salida.omitidos.fallo === 1 && (await constancia(fallo.id)) === null, JSON.stringify(salida));

    console.log('\n  — Sigue apagada —');
    check('la finalidad NO está disponible: falta que el PO apruebe el texto', FINALIDADES[FINALIDAD].disponible === false);

    console.log('\n  — La ruta del cron —');
    const url = `http://localhost:${process.env.PORT || 4010}/api/interno/mensajes-comunitarios`;
    const r = await call('POST', '/api/interno/mensajes-comunitarios');
    check('sin cabecera → 401', r.status === 401, `(fue ${r.status})`);
    const mal = await fetch(url, { method: 'POST', headers: { 'x-cron-secret': 'equivocado' } });
    check('con secreto equivocado → 401', mal.status === 401, `(fue ${mal.status})`);
    // Antes de llamar de verdad: que no quede nadie pendiente con la fecha real de hoy.
    await prisma.consentimiento.deleteMany({ where: { finalidad: FINALIDAD, user: { handle: { startsWith: 'wtcom_' } } } });
    const bien = await fetch(url, { method: 'POST', headers: { 'x-cron-secret': process.env.CRON_SECRET } });
    const cuerpo = await bien.json().catch(() => ({}));
    check('con el secreto correcto → 200 y solo cuentas',
      bien.status === 200 && typeof cuerpo.candidatas === 'number' && typeof cuerpo.enviados === 'number' && !JSON.stringify(cuerpo).includes('@'), JSON.stringify(cuerpo));
  } finally {
    await limpiarDias();
    await cleanup();
  }
  return results;
};
