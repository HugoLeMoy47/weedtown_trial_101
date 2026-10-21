// Ciclo 22 (B26): el único camino para mandar correo que no es de servicio.
//
// `enviarCorreo` no tiene atajos. Lo que hay que sostener:
//   1. Sin consentimiento ACTIVO de la versión vigente, no sale nada (sin fila, apagado,
//      de un texto viejo, o dado de baja).
//   2. Cuenta viva, con correo y sin suspensión.
//   3. UN correo al día por persona, reclamado ANTES de enviar: dos envíos simultáneos
//      no se cuelan los dos, y si el envío falla se DEVUELVE lo reclamado.
//   4. Un tope diario para toda la plataforma.
//   5. Lleva siempre el pie (quién lo envía, enlace firmado de baja) y las cabeceras de
//      baja de un clic. Ningún llamador puede olvidarlos.
//
// Se prueba con un mailer de juguete y con `ahora` inyectado sobre días del futuro lejano,
// para no tocar el contador real del día.
const { suite } = require('./lib');
const { enviarCorreo, reclamar, maximoPorDia, MAX_DIA_POR_DEFECTO, agregarPie } = require('../src/lib/correos');
const { verificarBaja } = require('../src/lib/bajaCorreo');
const { FINALIDADES } = require('../src/lib/consentimientos');

const DIA = (iso, hora = '18:00:00') => new Date(`${iso}T${hora}.000Z`);   // 18:00Z = 12:00 en México

module.exports = async function run() {
  const { results, check, call, mkUser, cleanup, prisma } = suite('Correos', 'wtcor');

  const dar = (userId, finalidad, extra = {}) => prisma.consentimiento.upsert({
    where: { userId_finalidad: { userId, finalidad } },
    create: { userId, finalidad, version: FINALIDADES[finalidad].version, otorgado: true, ...extra },
    update: { otorgado: true, version: FINALIDADES[finalidad].version, ...extra }
  });
  const ultimo = async (userId) => {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { ultimoCorreoDia: true } });
    return u.ultimoCorreoDia ? u.ultimoCorreoDia.toISOString().slice(0, 10) : null;
  };
  const conteo = async (iso) => (await prisma.conteoCorreo.findUnique({ where: { dia: new Date(`${iso}T00:00:00.000Z`) } }))?.conteo ?? 0;
  const limpiarDias = () => prisma.conteoCorreo.deleteMany({ where: { dia: { gte: new Date('2031-01-01'), lt: new Date('2032-01-01') } } });

  const enviados = [];
  const mailer = { enviarAviso: async (a) => { enviados.push(a); } };
  const mensaje = { asunto: 'Novedades', texto: 'Texto del mensaje de la campaña.', html: '<p>Texto del mensaje de la campaña.</p>' };
  const F = 'comunicaciones_comerciales';

  await cleanup();
  await limpiarDias();
  try {
    const ana = await mkUser('ana', { email: 'wtcor_ana@example.test' });
    await dar(ana.id, F);

    console.log('\n  — Antes de enviar: lo que se comprueba —');
    let r = await enviarCorreo({ userId: ana.id, finalidad: 'medicion_personal', ...mensaje, mailer, ahora: DIA('2031-04-10') });
    check('una finalidad que no usa el correo → finalidad_invalida', r.enviado === false && r.motivo === 'finalidad_invalida');
    r = await enviarCorreo({ userId: ana.id, finalidad: 'inventada', ...mensaje, mailer, ahora: DIA('2031-04-10') });
    check('una finalidad que no existe → finalidad_invalida', r.motivo === 'finalidad_invalida');
    r = await enviarCorreo({ userId: ana.id, finalidad: F, asunto: '', texto: 'x', html: 'x', mailer, ahora: DIA('2031-04-10') });
    check('un mensaje incompleto → mensaje_incompleto', r.motivo === 'mensaje_incompleto');
    check('nada de eso llegó al mailer ni gastó el día', enviados.length === 0 && (await ultimo(ana.id)) === null);

    console.log('\n  — Sin consentimiento activo no sale nada —');
    const sin = await mkUser('sin', { email: 'wtcor_sin@example.test' });
    r = await enviarCorreo({ userId: sin.id, finalidad: F, ...mensaje, mailer, ahora: DIA('2031-04-10') });
    check('sin fila → sin_consentimiento', r.motivo === 'sin_consentimiento');
    const apagado = await mkUser('apag', { email: 'wtcor_apag@example.test' });
    await dar(apagado.id, F, { otorgado: false });
    r = await enviarCorreo({ userId: apagado.id, finalidad: F, ...mensaje, mailer, ahora: DIA('2031-04-10') });
    check('apagado → sin_consentimiento', r.motivo === 'sin_consentimiento');
    const vieja = await mkUser('vieja', { email: 'wtcor_vieja@example.test' });
    await dar(vieja.id, F, { version: '2020-01-01' });
    r = await enviarCorreo({ userId: vieja.id, finalidad: F, ...mensaje, mailer, ahora: DIA('2031-04-10') });
    check('de un texto VIEJO → sin_consentimiento', r.motivo === 'sin_consentimiento');
    check('ninguno llegó al mailer ni gastó el día', enviados.length === 0 && (await ultimo(sin.id)) === null && (await ultimo(apagado.id)) === null && (await ultimo(vieja.id)) === null);

    console.log('\n  — La cuenta —');
    const sinCorreo = await mkUser('sinc');
    await dar(sinCorreo.id, F);
    r = await enviarCorreo({ userId: sinCorreo.id, finalidad: F, ...mensaje, mailer, ahora: DIA('2031-04-10') });
    check('sin correo → sin_correo', r.motivo === 'sin_correo');
    const borrada = await mkUser('borr', { email: 'wtcor_borr@example.test', deletedAt: new Date() });
    await dar(borrada.id, F);
    r = await enviarCorreo({ userId: borrada.id, finalidad: F, ...mensaje, mailer, ahora: DIA('2031-04-10') });
    check('cuenta eliminada → cuenta_no_disponible', r.motivo === 'cuenta_no_disponible');
    const susp = await mkUser('susp', { email: 'wtcor_susp@example.test', suspendedUntil: new Date('2031-12-31T00:00:00Z') });
    await dar(susp.id, F);
    r = await enviarCorreo({ userId: susp.id, finalidad: F, ...mensaje, mailer, ahora: DIA('2031-04-10') });
    check('cuenta suspendida → cuenta_suspendida', r.motivo === 'cuenta_suspendida');
    r = await enviarCorreo({ userId: 2147483000, finalidad: F, ...mensaje, mailer, ahora: DIA('2031-04-10') });
    check('un id que no existe → sin_consentimiento (no revela nada más)', r.enviado === false);
    check('nada llegó al mailer', enviados.length === 0);

    console.log('\n  — El envío —');
    r = await enviarCorreo({ userId: ana.id, finalidad: F, ...mensaje, mailer, ahora: DIA('2031-04-10') });
    check('con consentimiento activo se envía', r.enviado === true, JSON.stringify(r));
    check('el mailer recibió UN correo, a su dirección', enviados.length === 1 && enviados[0].email === 'wtcor_ana@example.test');
    const e = enviados[0];
    check('con el asunto de la campaña', e.asunto === 'Novedades');
    check('el cuerpo conserva el mensaje y AGREGA el pie con quién lo envía', e.texto.startsWith(mensaje.texto) && e.texto.includes('Enviado por WeedTown Colectivo'));
    check('el pie dice por qué lo recibe, con el título de la finalidad', e.texto.includes(`«${FINALIDADES[F].titulo}»`));
    const enlace = /baja en un clic: (\S+)/.exec(e.texto)?.[1] || '';
    const tokenEnlace = new URL(enlace, 'https://x.test').searchParams.get('token');
    check('el enlace de baja lleva un token firmado DE ESA persona y ESA finalidad', JSON.stringify(verificarBaja(tokenEnlace)) === JSON.stringify({ userId: ana.id, finalidad: F }), enlace);
    check('el html también lleva el pie y la baja', e.html.includes('Darme de baja en un clic') && e.html.includes('/baja?token='));
    check('lleva las cabeceras de baja de UN clic (RFC 8058)', /^<.+\/api\/baja\?token=.+>$/.test(e.headers['List-Unsubscribe'] || '') && e.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click', JSON.stringify(e.headers));
    check('guarda el día del último correo y sube el contador del día', (await ultimo(ana.id)) === '2031-04-10' && (await conteo('2031-04-10')) === 1);
    check('no guarda a quién se le escribió: el contador es un número', typeof (await conteo('2031-04-10')) === 'number');

    console.log('\n  — Uno al día por persona —');
    r = await enviarCorreo({ userId: ana.id, finalidad: F, ...mensaje, mailer, ahora: DIA('2031-04-10', '23:00:00') });
    check('un segundo correo el MISMO día → tope_diario_persona', r.motivo === 'tope_diario_persona');
    check('...y no salió ni gastó presupuesto', enviados.length === 1 && (await conteo('2031-04-10')) === 1);
    await dar(ana.id, 'avisos_correo');
    r = await enviarCorreo({ userId: ana.id, finalidad: 'avisos_correo', ...mensaje, mailer, ahora: DIA('2031-04-10') });
    check('...con consentimiento para el otro tipo, sigue siendo el MISMO tope', r.motivo === 'tope_diario_persona');
    r = await enviarCorreo({ userId: ana.id, finalidad: F, ...mensaje, mailer, ahora: DIA('2031-04-11') });
    check('al día siguiente sí', r.enviado === true && (await ultimo(ana.id)) === '2031-04-11');
    r = await enviarCorreo({ userId: ana.id, finalidad: F, ...mensaje, mailer, ahora: new Date('2031-04-12T05:00:00Z') });
    check('el día se corta en hora de MÉXICO: 05:00Z del 12 todavía es el 11 allá, que ya se usó → tope', r.motivo === 'tope_diario_persona', JSON.stringify(r));
    r = await enviarCorreo({ userId: ana.id, finalidad: F, ...mensaje, mailer, ahora: new Date('2031-04-12T07:00:00Z') });
    check('...y 07:00Z ya es el 12 → sale', r.enviado === true && (await ultimo(ana.id)) === '2031-04-12', JSON.stringify(r));

    console.log('\n  — Dos envíos simultáneos a la misma persona: pasa uno —');
    const bea = await mkUser('bea', { email: 'wtcor_bea@example.test' });
    await dar(bea.id, F);
    const antes = enviados.length;
    const carrera = await Promise.all(Array.from({ length: 6 }, () => enviarCorreo({ userId: bea.id, finalidad: F, ...mensaje, mailer, ahora: DIA('2031-05-01') })));
    check('de 6 simultáneos EXACTAMENTE uno sale', carrera.filter(x => x.enviado).length === 1, JSON.stringify(carrera.map(x => x.motivo || 'ok')));
    check('...y el mailer recibió uno solo', enviados.length === antes + 1);
    check('...y el contador del día subió uno', (await conteo('2031-05-01')) === 1);

    console.log('\n  — Si el envío falla, se devuelve lo reclamado —');
    const caro = await mkUser('caro', { email: 'wtcor_caro@example.test' });
    await dar(caro.id, F);
    const fallador = { enviarAviso: async () => { throw new Error('Resend respondió 422'); } };
    r = await enviarCorreo({ userId: caro.id, finalidad: F, ...mensaje, mailer: fallador, ahora: DIA('2031-06-01') });
    check('un fallo → motivo fallo, con el error', r.enviado === false && r.motivo === 'fallo' && /422/.test(r.error));
    check('NO gastó el día de la persona', (await ultimo(caro.id)) === null);
    check('NO gastó el presupuesto del día', (await conteo('2031-06-01')) === 0);
    r = await enviarCorreo({ userId: caro.id, finalidad: F, ...mensaje, mailer, ahora: DIA('2031-06-01') });
    check('y se puede reintentar el MISMO día', r.enviado === true && (await ultimo(caro.id)) === '2031-06-01');
    check('un fallo no pisa el último día anterior: se restaura', await (async () => {
      const dani = await mkUser('dani', { email: 'wtcor_dani@example.test' });
      await dar(dani.id, F);
      await enviarCorreo({ userId: dani.id, finalidad: F, ...mensaje, mailer, ahora: DIA('2031-06-02') });
      const f2 = await enviarCorreo({ userId: dani.id, finalidad: F, ...mensaje, mailer: fallador, ahora: DIA('2031-06-03') });
      return f2.motivo === 'fallo' && (await ultimo(dani.id)) === '2031-06-02';
    })());

    console.log('\n  — El tope de toda la plataforma —');
    const grupo = [];
    for (let i = 0; i < 4; i++) {
      const u = await mkUser(`g${i}`, { email: `wtcor_g${i}@example.test` });
      await dar(u.id, F);
      grupo.push(u);
    }
    const salidas = [];
    for (const u of grupo) salidas.push(await enviarCorreo({ userId: u.id, finalidad: F, ...mensaje, mailer, ahora: DIA('2031-07-01'), maximo: 2 }));
    check('con tope de 2 salen 2 y el resto → tope_global', salidas.filter(x => x.enviado).length === 2 && salidas.filter(x => x.motivo === 'tope_global').length === 2, JSON.stringify(salidas.map(x => x.motivo || 'ok')));
    check('el contador del día se queda en el tope', (await conteo('2031-07-01')) === 2);
    const rechazadas = grupo.filter((u, i) => salidas[i].motivo === 'tope_global');
    check('a quien no cupo NO se le gastó su día (puede recibirlo mañana)', (await Promise.all(rechazadas.map(u => ultimo(u.id)))).every(d => d === null));
    const manana = await enviarCorreo({ userId: rechazadas[0].id, finalidad: F, ...mensaje, mailer, ahora: DIA('2031-07-02'), maximo: 2 });
    check('...y mañana sí entra', manana.enviado === true);

    console.log('\n  — El presupuesto por defecto —');
    check('por defecto 80, por debajo del diario del tier gratuito de Resend', MAX_DIA_POR_DEFECTO === 80 && maximoPorDia({}) === 80);
    check('CORREOS_MAX_DIA lo cambia dentro de 1–100', maximoPorDia({ CORREOS_MAX_DIA: '30' }) === 30);
    check('un valor fuera de rango o raro se ignora', maximoPorDia({ CORREOS_MAX_DIA: '500' }) === 80 && maximoPorDia({ CORREOS_MAX_DIA: 'mucho' }) === 80 && maximoPorDia({ CORREOS_MAX_DIA: '0' }) === 80);
    const rr = await reclamar(2147483000, DIA('2031-08-01'));
    check('reclamar para una cuenta que no existe no gasta presupuesto', rr.ok === false && (await conteo('2031-08-01')) === 0);

    console.log('\n  — El pie siempre está —');
    const pie = agregarPie({ texto: 'T', html: '<p>T</p>', finalidad: F, urls: { pagina: 'https://x.test/baja?token=abc', api: '' } });
    check('agregarPie añade quién lo envía, la baja y las decisiones de privacidad', /WeedTown Colectivo/.test(pie.texto) && /baja en un clic: https:\/\/x\.test\/baja\?token=abc/.test(pie.texto) && /privacidad/.test(pie.texto));

    console.log('\n  — La baja corta el envío (B25 + B26) —');
    const eli = await mkUser('eli', { email: 'wtcor_eli@example.test' });
    await dar(eli.id, F);
    const tok = new URL(/baja en un clic: (\S+)/.exec((await (async () => { const a = []; await enviarCorreo({ userId: eli.id, finalidad: F, ...mensaje, mailer: { enviarAviso: async (x) => a.push(x) }, ahora: DIA('2031-09-01') }); return a[0]; })()).texto)[1]).searchParams.get('token');
    const baja = await call('POST', `/api/baja?token=${tok}`);
    check('la baja desde el enlace del propio correo → 200', baja.status === 200);
    r = await enviarCorreo({ userId: eli.id, finalidad: F, ...mensaje, mailer, ahora: DIA('2031-09-02') });
    check('al día siguiente ya NO se le escribe: sin_consentimiento', r.enviado === false && r.motivo === 'sin_consentimiento');
  } finally {
    await limpiarDias();
    await cleanup();
  }
  return results;
};
