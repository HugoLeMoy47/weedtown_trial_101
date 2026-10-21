// Ciclo 21: el aviso único de la actualización de los Términos.
//
// Es un correo de SERVICIO, de una sola vez. Lo que hay que sostener:
//   1. Se le avisa solo a quien debe: cuenta viva, con correo válido y que NO ha
//      aceptado la versión vigente. Cada dirección cuenta una vez.
//   2. La prueba (`enviar: false`) NO llama al mailer: no manda nada.
//   3. No se manda dos veces a la misma dirección, y el registro guarda el HASH,
//      no la dirección.
//   4. Un envío que falla NO se marca como enviado (se puede reintentar) y no
//      detiene al resto.
//   5. Hay un tope por corrida.
//   6. El mensaje no lleva datos de nadie ni promueve nada: es un aviso de
//      servicio. Dice lo que el PO aprobó (fecha límite, cuenta intacta).
//
// El mailer es de juguete: lo que se prueba es la lógica, no Resend.
const { suite } = require('./lib');
const { TERMINOS_VIGENTES, diasParaLimite, LIMITE_POR_DEFECTO } = require('../src/lib/terminos');
const {
  destinatarios, armarMensaje, planificar, enviarLote, huella, enmascarar, fechaLarga, MAXIMO_POR_DEFECTO
} = require('../src/lib/avisoTerminos');

module.exports = async function run() {
  const { results, check, mkUser, cleanup, prisma } = suite('AvisoTerminos', 'wtavi');

  await cleanup();
  try {
    console.log('\n  — Los días que quedan —');
    check('el límite por defecto es publicación + 30 días (2026-11-20)', LIMITE_POR_DEFECTO === '2026-11-20');
    check('el día de la publicación (21-oct) quedan 30', diasParaLimite(new Date('2026-10-21T18:00:00Z'), '2026-11-20') === 30);
    check('el 19 de noviembre queda 1', diasParaLimite(new Date('2026-11-19T18:00:00Z'), '2026-11-20') === 1);
    check('el día del límite quedan 0 (ya se exige)', diasParaLimite(new Date('2026-11-20T18:00:00Z'), '2026-11-20') === 0);
    check('después nunca es negativo', diasParaLimite(new Date('2027-03-01T18:00:00Z'), '2026-11-20') === 0);
    check('se cuenta en días de MÉXICO (04:00Z del 20 todavía es el 19 allá)', diasParaLimite(new Date('2026-11-20T04:00:00Z'), '2026-11-20') === 1);

    console.log('\n  — A quién se le avisa —');
    const acepto = await mkUser('acepto', { email: 'wtavi_acepto@example.test', terminosVersion: TERMINOS_VIGENTES });
    const pendiente = await mkUser('pend', { email: 'WTAVI_Pend@Example.Test ' });          // mayúsculas y espacio: se normaliza
    const vieja = await mkUser('vieja', { email: 'wtavi_vieja@example.test', terminosVersion: '2020-01-01' });
    const sinCorreo = await mkUser('sinc');
    const borrada = await mkUser('borr', { email: 'wtavi_borr@example.test', deletedAt: new Date() });
    const malCorreo = await mkUser('malc', { email: 'esto-no-es-un-correo' });
    const suspendida = await mkUser('susp', { email: 'wtavi_susp@example.test', suspendedUntil: new Date(Date.now() + 86400000) });
    const lista = (await destinatarios(prisma, TERMINOS_VIGENTES)).filter(c => c.startsWith('wtavi_'));
    check('quien aún no aceptó la vigente, sí (y el correo se normaliza)', lista.includes('wtavi_pend@example.test'));
    check('quien tiene una versión VIEJA, sí', lista.includes('wtavi_vieja@example.test'));
    check('quien ya aceptó la vigente, no', !lista.includes('wtavi_acepto@example.test'));
    check('una cuenta eliminada, no', !lista.includes('wtavi_borr@example.test'));
    check('una cuenta suspendida SÍ: el aviso es sobre su cuenta', lista.includes('wtavi_susp@example.test'));
    check('una cuenta sin correo no aparece (solo verá el aviso dentro de la red)', lista.length === 3, `(${lista.join(', ')})`);
    check('un correo con forma inválida no se usa', !lista.some(c => c.includes('esto-no-es')));
    check('la lista sale ordenada', JSON.stringify(lista) === JSON.stringify([...lista].sort()));
    const gemela = await mkUser('gemela', { email: 'wtavi_pend@example.test ' });
    const sinDuplicar = (await destinatarios(prisma, TERMINOS_VIGENTES)).filter(c => c === 'wtavi_pend@example.test');
    check('una dirección repetida cuenta UNA vez', sinDuplicar.length === 1 && Boolean(gemela));

    console.log('\n  — La planificación y el tope —');
    const grande = Array.from({ length: 200 }, (_, i) => `x${String(i).padStart(3, '0')}@example.test`);
    let plan = planificar({ lista: grande, registro: { enviados: {} } });
    check('el tope por defecto deja margen bajo el diario de Resend (≤ 100)', MAXIMO_POR_DEFECTO <= 100 && plan.ahora.length === MAXIMO_POR_DEFECTO);
    check('el total y los pendientes cuentan TODOS, no solo los de esta corrida', plan.total === 200 && plan.pendientes === 200);
    plan = planificar({ lista: grande, registro: { enviados: {} }, maximo: 5 });
    check('--maximo lo baja', plan.ahora.length === 5);
    plan = planificar({ lista: grande, registro: { enviados: { [huella(grande[0])]: 'x', [huella(grande[1])]: 'x' } }, maximo: 3 });
    check('quien ya está en el registro no se repite', plan.yaAvisadas === 2 && plan.pendientes === 198 && !plan.ahora.includes(grande[0]) && !plan.ahora.includes(grande[1]));

    console.log('\n  — La prueba no manda nada —');
    const enviosFalsos = [];
    const mailerFalso = { enviarAviso: async (a) => { enviosFalsos.push(a); } };
    const mensaje = armarMensaje({ limite: '2026-11-20', urlBase: 'https://weedtown.social' });
    const registro = { enviados: {} };
    let r = await enviarLote({ ahora: ['a@example.test', 'b@example.test'], mailer: mailerFalso, registro, mensaje, enviar: false, pausaMs: 0 });
    check('con enviar:false el mailer NO se llama', enviosFalsos.length === 0 && r.enviados === 0 && r.simulados === 2);
    check('...ni se toca el registro', Object.keys(registro.enviados).length === 0);

    console.log('\n  — El envío, el registro y los fallos —');
    r = await enviarLote({ ahora: ['a@example.test', 'b@example.test'], mailer: mailerFalso, registro, mensaje, enviar: true, pausaMs: 0 });
    check('enviar:true manda uno por dirección', r.enviados === 2 && enviosFalsos.length === 2 && enviosFalsos[0].email === 'a@example.test');
    check('cada envío lleva asunto, texto y html', enviosFalsos.every(e => e.asunto && e.texto && e.html));
    check('el registro guarda el HASH de la dirección, no la dirección', Object.keys(registro.enviados).every(k => /^[0-9a-f]{64}$/.test(k)) && !JSON.stringify(registro).includes('example.test'));
    const plan2 = planificar({ lista: ['a@example.test', 'b@example.test', 'c@example.test'], registro });
    check('una segunda corrida solo ve a la que falta', plan2.ahora.length === 1 && plan2.ahora[0] === 'c@example.test' && plan2.yaAvisadas === 2);

    const fallador = { enviarAviso: async ({ email }) => { if (email.startsWith('mala')) throw new Error('Resend respondió 422'); } };
    const reg2 = { enviados: {} };
    r = await enviarLote({ ahora: ['mala@example.test', 'buena@example.test'], mailer: fallador, registro: reg2, mensaje, enviar: true, pausaMs: 0 });
    check('un fallo no detiene al resto', r.enviados === 1 && r.fallidos.length === 1);
    check('el fallo NO se marca como enviado (se puede reintentar)', !reg2.enviados[huella('mala@example.test')] && Boolean(reg2.enviados[huella('buena@example.test')]));
    check('el reporte del fallo enmascara la dirección', !JSON.stringify(r.fallidos).includes('mala@example.test') && r.fallidos[0].correo === 'm***@example.test');
    check('enmascarar no vuelca la dirección', enmascarar('Persona@Dominio.com') === 'p***@dominio.com');

    console.log('\n  — El mensaje: aviso de servicio, no publicidad —');
    check('el asunto es el aprobado', mensaje.asunto === 'Actualizamos los Términos de WeedTown — tu cuenta sigue intacta');
    check('dice la fecha límite en español', mensaje.texto.includes('antes del 20 de noviembre de 2026') && mensaje.html.includes('20 de noviembre de 2026'));
    check('dice que la cuenta no se borra y que se puede descargar o eliminar', /tu cuenta no se borra/.test(mensaje.texto) && /descargar tus datos, eliminarla/.test(mensaje.texto));
    check('dice qué se guarda: solo la fecha del último día, sin hora ni páginas', /solo la fecha del último día que entraste, sin hora ni páginas/.test(mensaje.texto));
    check('dice que es un aviso de servicio y no publicidad', /aviso de servicio[^.]*no es publicidad/.test(mensaje.texto));
    check('enlaza a los Términos y a la app', mensaje.texto.includes('https://weedtown.social/terms') && mensaje.texto.includes('https://weedtown.social/feed'));
    check('menciona que lo opcional está apagado, SIN llamada a la acción', /todas están apagadas y ninguna es necesaria/.test(mensaje.texto) && !/activa(r)? (esto|tus|las)|suscr[ií]bete|oferta|promoci/i.test(mensaje.texto));
    check('no lleva enlace de baja (es un aviso de una sola vez, no una lista)', !/baja|unsubscribe|darte de baja/i.test(mensaje.texto));
    check('no lleva datos de nadie: saluda con «Hola:»', mensaje.texto.startsWith('Hola:') && !/@(?!weedtown)/.test(mensaje.texto.replace(/https?:\/\/\S+/g, '')));
    check('la URL base sin barra final funciona igual', armarMensaje({ limite: '2026-11-20', urlBase: 'https://weedtown.social/' }).texto.includes('https://weedtown.social/terms'));
    check('fechaLarga da el día sin desfase', fechaLarga('2026-11-20') === '20 de noviembre de 2026');
  } finally {
    await cleanup();
  }
  return results;
};
