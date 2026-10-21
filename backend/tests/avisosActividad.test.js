// Ciclo 22 (B26): el aviso diario de actividad por correo.
//
// Lo que hay que sostener:
//   1. El correo lleva SOLO números: cuántas reacciones, respuestas y mensajes. Ni quién
//      ni qué dijeron (la lección del ciclo 15: una puerta hacia afuera de la plataforma
//      solo puede llevar lo que se pueda decir a cualquiera).
//   2. Cuenta únicamente lo SIN LEER de las últimas 24 horas y de tres clases.
//   3. Solo a quien tiene el consentimiento `avisos_correo` ACTIVO y vigente.
//   4. Un correo al día por persona aunque se corra dos veces.
//   5. La ruta del cron no existe sin CRON_SECRET y exige el secreto correcto.
const { suite } = require('./lib');
const { resumenesPendientes, armarAviso, enviarAvisosDiarios } = require('../src/lib/avisosActividad');
const { secretoValido, exigirSecreto } = require('../src/routes/internoRoutes');
const { FINALIDADES } = require('../src/lib/consentimientos');

const F = 'avisos_correo';

module.exports = async function run() {
  const { results, check, call, mkUser, cleanup, prisma } = suite('AvisosActividad', 'wtavs');
  const AHORA = new Date('2031-10-15T18:00:00.000Z');
  const hace = (horas) => new Date(AHORA.getTime() - horas * 3600000);

  const dar = (userId, extra = {}) => prisma.consentimiento.upsert({
    where: { userId_finalidad: { userId, finalidad: F } },
    create: { userId, finalidad: F, version: FINALIDADES[F].version, otorgado: true, ...extra },
    update: { otorgado: true, version: FINALIDADES[F].version, ...extra }
  });
  const notif = (recipientId, actorId, type, extra = {}) => prisma.notification.create({ data: { recipientId, actorId, type, ...extra } });
  const limpiarDias = () => prisma.conteoCorreo.deleteMany({ where: { dia: { gte: new Date('2031-01-01'), lt: new Date('2032-01-01') } } });

  await cleanup();
  await limpiarDias();
  try {
    const actor = await mkUser('actor', { name: 'wtavs_ElActorSecreto', displayName: 'Nombre Muy Reconocible' });
    const ana = await mkUser('ana', { email: 'wtavs_ana@example.test' });
    await dar(ana.id);

    console.log('\n  — Qué se cuenta —');
    for (let i = 0; i < 3; i++) await notif(ana.id, actor.id, 'REACTION', { createdAt: hace(2) });
    await notif(ana.id, actor.id, 'REPLY_POST', { createdAt: hace(3) });
    await notif(ana.id, actor.id, 'REPLY_COMMENT', { createdAt: hace(4) });
    for (let i = 0; i < 2; i++) await notif(ana.id, actor.id, 'CHAT_MESSAGE', { createdAt: hace(1) });
    // Lo que NO cuenta:
    await notif(ana.id, actor.id, 'REACTION', { createdAt: hace(30) });                          // muy vieja
    await notif(ana.id, actor.id, 'REACTION', { createdAt: hace(1), readAt: hace(0.5) });        // ya leída
    await notif(ana.id, actor.id, 'FRIEND_REQUEST', { createdAt: hace(1) });                     // otra clase
    await notif(ana.id, actor.id, 'POKE', { createdAt: hace(1) });                               // otra clase
    await notif(ana.id, actor.id, 'CONTENIDO_OCULTO', { createdAt: hace(1) });                   // moderación: sensible
    await notif(ana.id, actor.id, 'MENTION', { createdAt: hace(1) });                            // fuera de las tres clases
    let res = (await resumenesPendientes(prisma, AHORA)).find(r => r.userId === ana.id);
    check('3 reacciones, 2 respuestas (posteo y comentario) y 2 mensajes', res && res.reacciones === 3 && res.respuestas === 2 && res.mensajes === 2, JSON.stringify(res));
    check('no cuenta lo viejo, lo ya leído ni otras clases (amistad, toques, moderación, menciones)', res.reacciones + res.respuestas + res.mensajes === 7);

    console.log('\n  — A quién —');
    const sinCons = await mkUser('sinc', { email: 'wtavs_sinc@example.test' });
    await notif(sinCons.id, actor.id, 'REACTION', { createdAt: hace(1) });
    const apagada = await mkUser('apag', { email: 'wtavs_apag@example.test' });
    await dar(apagada.id, { otorgado: false });
    await notif(apagada.id, actor.id, 'REACTION', { createdAt: hace(1) });
    const vieja = await mkUser('vieja', { email: 'wtavs_vieja@example.test' });
    await dar(vieja.id, { version: '2020-01-01' });
    await notif(vieja.id, actor.id, 'REACTION', { createdAt: hace(1) });
    const sinCorreo = await mkUser('sinco');
    await dar(sinCorreo.id);
    await notif(sinCorreo.id, actor.id, 'REACTION', { createdAt: hace(1) });
    const borrada = await mkUser('borr', { email: 'wtavs_borr@example.test', deletedAt: new Date() });
    await dar(borrada.id);
    await notif(borrada.id, actor.id, 'REACTION', { createdAt: hace(1) });
    const lista = await resumenesPendientes(prisma, AHORA);
    const ids = lista.map(r => r.userId);
    check('solo Ana: la única con consentimiento activo, vigente, correo y cuenta viva', ids.includes(ana.id) && !ids.includes(sinCons.id) && !ids.includes(apagada.id) && !ids.includes(vieja.id) && !ids.includes(sinCorreo.id) && !ids.includes(borrada.id), JSON.stringify(ids));

    console.log('\n  — El correo lleva SOLO números —');
    const aviso = armarAviso({ reacciones: 3, respuestas: 2, mensajes: 2 }, { urlBase: 'https://weedtown.social' });
    check('dice cuántas de cada clase', aviso.texto.includes('3 reacciones a tus publicaciones, 2 respuestas, 2 mensajes') && aviso.html.includes('3 reacciones a tus publicaciones'));
    check('singulares bien dichos', armarAviso({ reacciones: 1, respuestas: 1, mensajes: 1 }).texto.includes('1 reacción a tus publicaciones, 1 respuesta, 1 mensaje sin leer'));
    check('una clase en cero no se menciona', !armarAviso({ reacciones: 2, respuestas: 0, mensajes: 0 }).texto.includes('respuesta') && !armarAviso({ reacciones: 2, respuestas: 0, mensajes: 0 }).texto.includes('mensaje'));
    check('enlaza a la app', aviso.texto.includes('https://weedtown.social/feed'));

    console.log('\n  — Enviar —');
    const enviados = [];
    const mailer = { enviarAviso: async (a) => { enviados.push(a); } };
    const otra = await mkUser('otra', { email: 'wtavs_otra@example.test' });
    await dar(otra.id);
    await notif(otra.id, actor.id, 'CHAT_MESSAGE', { createdAt: hace(1) });
    let salida = await enviarAvisosDiarios({ prisma, mailer, ahora: AHORA });
    const mios = enviados.filter(e => e.email.startsWith('wtavs_'));
    check('manda uno por persona con novedades y consentimiento', salida.enviados === 2 && mios.length === 2, JSON.stringify(salida));
    check('devuelve solo cuentas, nunca a quién', JSON.stringify(salida) === JSON.stringify({ candidatas: 2, enviados: 2, omitidos: {} }) && !JSON.stringify(salida).includes('@'));
    const alAna = mios.find(e => e.email === 'wtavs_ana@example.test');
    check('el correo de Ana dice sus números', /3 reacciones a tus publicaciones, 2 respuestas, 2 mensajes/.test(alAna.texto));
    const todo = enviados.map(e => `${e.asunto} ${e.texto} ${e.html}`).join('\n');
    check('NO lleva quién (ni nombre ni handle) ni ningún contenido', !/ElActorSecreto|Nombre Muy Reconocible|wtavs_actor/.test(todo));
    check('lleva el pie con la baja y las cabeceras de un clic (lo pone enviarCorreo)', alAna.texto.includes('baja en un clic') && Boolean(alAna.headers['List-Unsubscribe']));
    salida = await enviarAvisosDiarios({ prisma, mailer, ahora: AHORA });
    check('correrlo OTRA VEZ el mismo día no repite: un correo al día', salida.enviados === 0 && salida.omitidos.tope_diario_persona === 2 && enviados.filter(e => e.email.startsWith('wtavs_')).length === 2, JSON.stringify(salida));

    console.log('\n  — El tope global corta el resto —');
    await limpiarDias();
    await prisma.user.updateMany({ where: { id: { in: [ana.id, otra.id] } }, data: { ultimoCorreoDia: null } });
    const antes = enviados.length;
    salida = await enviarAvisosDiarios({ prisma, mailer, ahora: AHORA, maximo: 1 });
    check('con presupuesto de 1: sale uno y se detiene, anotando el motivo', salida.enviados === 1 && salida.omitidos.tope_global === 1 && enviados.length === antes + 1, JSON.stringify(salida));

    console.log('\n  — La ruta del cron —');
    const guardado = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    const falsa = (secreto) => { const r = { estado: null, cuerpo: null }; r.status = (n) => { r.estado = n; return r; }; r.json = (c) => { r.cuerpo = c; return r; }; return [{ get: () => secreto }, r]; };
    let [req, res2] = falsa('lo-que-sea');
    let paso = false;
    exigirSecreto(req, res2, () => { paso = true; });
    check('SIN CRON_SECRET la ruta no existe: 404, ni con un secreto cualquiera', res2.estado === 404 && paso === false);
    process.env.CRON_SECRET = guardado;
    [req, res2] = falsa(undefined);
    exigirSecreto(req, res2, () => { paso = true; });
    check('con CRON_SECRET y sin cabecera → 401', res2.estado === 401 && paso === false);
    [req, res2] = falsa('equivocado');
    exigirSecreto(req, res2, () => { paso = true; });
    check('con un secreto equivocado → 401', res2.estado === 401 && paso === false);
    [req, res2] = falsa(guardado);
    exigirSecreto(req, res2, () => { paso = true; });
    check('con el secreto correcto pasa', paso === true);
    check('la comparación es de tiempo constante y no se confunde con prefijos', secretoValido(guardado, guardado) === true && secretoValido(guardado.slice(0, -1), guardado) === false && secretoValido('', guardado) === false && secretoValido(guardado, '') === false && secretoValido(null, guardado) === false);

    let r = await call('POST', '/api/interno/avisos-diarios');
    check('por HTTP sin cabecera → 401', r.status === 401, `(fue ${r.status})`);
    const sinSecreto = await fetch(`http://localhost:${process.env.PORT || 4010}/api/interno/avisos-diarios`, { method: 'POST', headers: { 'x-cron-secret': 'equivocado' } });
    check('por HTTP con secreto equivocado → 401', sinSecreto.status === 401, `(fue ${sinSecreto.status})`);
    const bien = await fetch(`http://localhost:${process.env.PORT || 4010}/api/interno/avisos-diarios`, { method: 'POST', headers: { 'x-cron-secret': guardado } });
    const cuerpo = await bien.json().catch(() => ({}));
    check('por HTTP con el secreto correcto → 200 y solo cuentas', bien.status === 200 && typeof cuerpo.candidatas === 'number' && typeof cuerpo.enviados === 'number' && !JSON.stringify(cuerpo).includes('@'), JSON.stringify(cuerpo));
  } finally {
    await limpiarDias();
    await cleanup();
  }
  return results;
};
