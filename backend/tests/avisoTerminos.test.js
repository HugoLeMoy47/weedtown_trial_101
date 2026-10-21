// Ciclos 21 y 22.1: el aviso único de la actualización de los Términos.
//
// Es un correo de SERVICIO, de una sola vez, y lo manda el BACKEND (no una computadora).
// Lo que hay que sostener:
//   1. Se le avisa solo a quien debe: cuenta viva, con DIRECCIÓN DE CONTACTO (la del perfil o
//      la de su acceso por correo) que NO ha aceptado la versión vigente ni tiene constancia.
//   2. La simulación (por defecto) NO llama al mailer: no manda nada.
//   3. La prueba manda UN correo [PRUEBA] a la dirección dada y no deja constancia.
//   4. El envío deja constancia en la base y NO se repite; un fallo no deja constancia.
//   5. El envío real exige estar ARMADO (si no, 409) y la ruta exige el secreto.
//   6. El mensaje no lleva datos de nadie ni promueve nada.
//
// El mailer es de juguete: lo que se prueba es la lógica, no Resend.
const { suite } = require('./lib');
const { TERMINOS_VIGENTES, diasParaLimite, LIMITE_POR_DEFECTO } = require('../src/lib/terminos');
const { correoDeContacto, enmascarar } = require('../src/lib/contacto');
const { pendientes, armarMensaje, enviarAvisoTerminos, fechaLarga, MAXIMO_POR_DEFECTO } = require('../src/lib/avisoTerminos');

module.exports = async function run() {
  const { results, check, call, mkUser, cleanup, prisma } = suite('AvisoTerminos', 'wtavi');
  const BASE = `http://localhost:${process.env.PORT || 4010}`;
  const V = TERMINOS_VIGENTES;
  const conAcceso = async (suffix, correo, extra = {}) => {
    const u = await mkUser(suffix, extra);
    await prisma.identity.create({ data: { userId: u.id, provider: 'EMAIL', externalId: correo, originHandle: correo } });
    return u;
  };
  const constancia = async (id) => (await prisma.user.findUnique({ where: { id }, select: { avisoTerminosVersion: true } })).avisoTerminosVersion;
  const mios = (lista) => lista.filter(p => p.correo.startsWith('wtavi_'));

  await cleanup();
  try {
    console.log('\n  — Los días que quedan —');
    check('el límite por defecto es 30 días tras el último envío del aviso (2026-11-23)', LIMITE_POR_DEFECTO === '2026-11-23');
    check('el día de la publicación (21-oct) quedan 30', diasParaLimite(new Date('2026-10-21T18:00:00Z'), '2026-11-20') === 30);
    check('el 19 de noviembre queda 1', diasParaLimite(new Date('2026-11-19T18:00:00Z'), '2026-11-20') === 1);
    check('el día del límite quedan 0 (ya se exige)', diasParaLimite(new Date('2026-11-20T18:00:00Z'), '2026-11-20') === 0);
    check('después nunca es negativo', diasParaLimite(new Date('2027-03-01T18:00:00Z'), '2026-11-20') === 0);

    console.log('\n  — La dirección de contacto (el error que se encontró contando cuentas reales) —');
    check('User.email gana si existe y es válido', correoDeContacto({ email: ' A@X.Test ', identities: [{ externalId: 'otra@x.test' }] }) === 'a@x.test');
    check('sin User.email, vale la dirección con la que entra por correo (así es casi toda la base)', correoDeContacto({ email: null, identities: [{ externalId: 'Acceso@X.Test' }] }) === 'acceso@x.test');
    check('un User.email inválido cae a la del acceso', correoDeContacto({ email: 'no-es-correo', identities: [{ externalId: 'ok@x.test' }] }) === 'ok@x.test');
    check('sin ninguna, null (llave de acceso o Mastodon)', correoDeContacto({ email: null, identities: [] }) === null && correoDeContacto({}) === null && correoDeContacto(null) === null);
    check('enmascarar no vuelca la dirección', enmascarar('Persona@Dominio.com') === 'p***@dominio.com');

    console.log('\n  — A quién se le avisa —');
    const soloAcceso = await conAcceso('acc', 'WTAVI_Acceso@Example.Test ');
    const soloPerfil = await mkUser('perf', { email: 'wtavi_perfil@example.test' });
    const acepto = await conAcceso('acep', 'wtavi_acepto@example.test', { terminosVersion: V });
    const vieja = await conAcceso('vieja', 'wtavi_vieja@example.test', { terminosVersion: '2020-01-01' });
    const sinCorreo = await mkUser('sinc');
    const borrada = await conAcceso('borr', 'wtavi_borr@example.test', { deletedAt: new Date() });
    const susp = await conAcceso('susp', 'wtavi_susp@example.test', { suspendedUntil: new Date(Date.now() + 86400000) });
    const yaAvisada = await conAcceso('yaav', 'wtavi_yaav@example.test', { avisoTerminosVersion: V });
    const malCorreo = await mkUser('malc', { email: 'esto-no-es-un-correo' });
    let lista = mios(await pendientes(prisma, V));
    const correos = lista.map(p => p.correo);
    check('quien entra por correo (solo identidad, sin User.email) SÍ, con la dirección normalizada', correos.includes('wtavi_acceso@example.test'));
    check('quien tiene User.email, sí', correos.includes('wtavi_perfil@example.test'));
    check('quien tiene una versión VIEJA, sí', correos.includes('wtavi_vieja@example.test'));
    check('una cuenta suspendida SÍ: el aviso es sobre su cuenta', correos.includes('wtavi_susp@example.test'));
    check('quien ya aceptó la vigente, no', !correos.includes('wtavi_acepto@example.test'));
    check('quien ya tiene constancia de aviso, no', !correos.includes('wtavi_yaav@example.test'));
    check('una cuenta eliminada, no', !correos.includes('wtavi_borr@example.test'));
    check('una cuenta sin ninguna dirección (llave de acceso o Mastodon) no aparece: solo verá el aviso dentro de la red', !lista.some(p => p.ids.includes(sinCorreo.id)));
    check('un correo con forma inválida y sin otra dirección no se usa', !lista.some(p => p.ids.includes(malCorreo.id)));
    check('son exactamente las esperadas', lista.length === 4, `(${correos.join(', ')})`);
    check('la lista sale ordenada', JSON.stringify(correos) === JSON.stringify([...correos].sort()));
    const gemela = await conAcceso('gem', 'WTAVI_perfil@example.test');
    lista = mios(await pendientes(prisma, V));
    const compartida = lista.find(p => p.correo === 'wtavi_perfil@example.test');
    check('dos cuentas con la MISMA dirección se agrupan: se escribe una vez y la constancia va en las dos', lista.length === 4 && compartida.ids.includes(soloPerfil.id) && compartida.ids.includes(gemela.id) && compartida.ids.length === 2);

    console.log('\n  — La simulación no manda nada —');
    const enviados = [];
    const mailer = { enviarAviso: async (a) => { enviados.push(a); } };
    const args = { prisma, mailer, versionVigente: V, limite: '2026-11-20', urlBase: 'https://weedtown.social', pausaMs: 0 };
    let r = await enviarAvisoTerminos({ ...args });
    check('por defecto es SIMULACIÓN: cuenta y no llama al mailer', r.modo === 'simulacion' && enviados.length === 0 && r.pendientes >= 4);
    check('la muestra va enmascarada (inicial + ***@dominio): nunca la parte local completa', r.muestra.every(m => /^.\*\*\*@/.test(m)) && !JSON.stringify(r).includes('wtavi_'));
    check('...y no dejó constancia en nadie', (await constancia(soloAcceso.id)) === null);

    console.log('\n  — La prueba: un correo [PRUEBA] a una dirección, sin constancia —');
    r = await enviarAvisoTerminos({ ...args, solo: 'prueba@example.test' });
    check('manda UN correo a la dirección dada', r.modo === 'prueba' && r.enviados === 1 && enviados.length === 1 && enviados[0].email === 'prueba@example.test');
    check('con [PRUEBA] en el asunto', enviados[0].asunto.startsWith('[PRUEBA] Actualizamos los Términos'));
    check('y el mismo cuerpo que el real', enviados[0].texto === armarMensaje({ limite: '2026-11-20', urlBase: 'https://weedtown.social' }).texto);
    check('NO deja constancia en nadie', (await constancia(soloAcceso.id)) === null && (await constancia(soloPerfil.id)) === null);
    let rechazo = null;
    try { await enviarAvisoTerminos({ ...args, solo: 'no-es-correo' }); } catch (e) { rechazo = e; }
    check('una dirección de prueba inválida se rechaza (400) sin mandar nada', rechazo && rechazo.estado === 400 && enviados.length === 1);

    console.log('\n  — El envío deja constancia y no se repite —');
    enviados.length = 0;
    r = await enviarAvisoTerminos({ ...args, enviar: true, maximo: 2 });
    check('con tope 2 manda 2 y dice cuántos quedan', r.modo === 'envio' && r.enviados === 2 && r.fallidos === 0 && r.restantes === r.pendientes - 2 && enviados.length === 2);
    const mandadas = enviados.map(e => e.email);
    const conConstancia = [];
    for (const u of [soloAcceso, soloPerfil, gemela, vieja, susp]) if ((await constancia(u.id)) === V) conConstancia.push(u.id);
    check('dejó constancia (la versión) en las cuentas avisadas, incluida la gemela de la dirección compartida', conConstancia.length >= 2);
    r = await enviarAvisoTerminos({ ...args, enviar: true });
    const todas = [...mandadas, ...enviados.slice(2).map(e => e.email)].filter(c => c.startsWith('wtavi_'));
    check('una segunda llamada manda el resto y NO repite a nadie', new Set(todas).size === todas.length && r.restantes === 0, JSON.stringify(todas));
    r = await enviarAvisoTerminos({ ...args, enviar: true });
    check('una tercera no manda nada: ya no hay pendientes', r.enviados === 0 && r.pendientes === 0 || mios(await pendientes(prisma, V)).length === 0);

    console.log('\n  — Un fallo no deja constancia —');
    const reintento = await conAcceso('reint', 'wtavi_reint@example.test');
    const fallador = { enviarAviso: async ({ email }) => { if (email === 'wtavi_reint@example.test') throw new Error('Resend respondió 422'); } };
    r = await enviarAvisoTerminos({ ...args, mailer: fallador, enviar: true });
    check('un fallo se cuenta y se explica', r.fallidos === 1 && r.errores.includes('Resend respondió 422'));
    check('NO deja constancia (se puede reintentar)', (await constancia(reintento.id)) === null);
    r = await enviarAvisoTerminos({ ...args, enviar: true });
    check('y el reintento sí lo manda', r.enviados === 1 && (await constancia(reintento.id)) === V);

    console.log('\n  — El mensaje: aviso de servicio, no publicidad —');
    const mensaje = armarMensaje({ limite: '2026-11-20', urlBase: 'https://weedtown.social' });
    check('el asunto es el aprobado', mensaje.asunto === 'Actualizamos los Términos de WeedTown — tu cuenta sigue intacta');
    check('dice la fecha límite en español', mensaje.texto.includes('antes del 20 de noviembre de 2026') && mensaje.html.includes('20 de noviembre de 2026'));
    check('dice que la cuenta no se borra y que se puede descargar o eliminar', /tu cuenta no se borra/.test(mensaje.texto) && /descargar tus datos, eliminarla/.test(mensaje.texto));
    check('dice qué se guarda: solo la fecha del último día, sin hora ni páginas', /solo la fecha del último día que entraste, sin hora ni páginas/.test(mensaje.texto));
    check('dice que es un aviso de servicio y no publicidad', /aviso de servicio[^.]*no es publicidad/.test(mensaje.texto));
    check('menciona que lo opcional está apagado, SIN llamada a la acción', /todas están apagadas y ninguna es necesaria/.test(mensaje.texto) && !/activa(r)? (esto|tus|las)|suscr[ií]bete|oferta|promoci/i.test(mensaje.texto));
    check('no lleva enlace de baja (es un aviso de una sola vez, no una lista)', !/baja|unsubscribe|darte de baja/i.test(mensaje.texto));
    check('no lleva datos de nadie: saluda con «Hola:»', mensaje.texto.startsWith('Hola:'));
    check('fechaLarga da el día sin desfase', fechaLarga('2026-11-20') === '20 de noviembre de 2026');
    check('el tope por llamada deja margen bajo el diario de Resend', MAXIMO_POR_DEFECTO <= 100);

    console.log('\n  — La ruta del backend —');
    const secreto = process.env.CRON_SECRET;
    const llamar = (cuerpo, cabeceras = { 'x-cron-secret': secreto }) => fetch(`${BASE}/api/interno/aviso-terminos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...cabeceras }, body: JSON.stringify(cuerpo || {})
    });
    let h = await llamar({}, {});
    check('sin secreto → 401', h.status === 401, `(fue ${h.status})`);
    h = await llamar({}, { 'x-cron-secret': 'equivocado' });
    check('con un secreto equivocado → 401', h.status === 401);
    h = await llamar({});
    let cuerpo = await h.json();
    check('con el secreto y sin cuerpo: SIMULACIÓN (200), sin mandar nada', h.status === 200 && cuerpo.modo === 'simulacion', JSON.stringify(cuerpo));
    h = await llamar({ enviar: true });
    cuerpo = await h.json();
    check('enviar:true SIN armar → 409: nada se manda por accidente', h.status === 409 && cuerpo.armado === false && cuerpo.versionVigente === V, `(fue ${h.status})`);
    check('...y no dejó constancia en nadie', (await constancia(vieja.id)) === V || (await constancia(vieja.id)) === null);
    h = await llamar({ solo: 'prueba@example.test' });
    cuerpo = await h.json();
    check('la PRUEBA funciona aunque el envío no esté armado (200, un correo; el mailer de pruebas es `log`)', h.status === 200 && cuerpo.modo === 'prueba' && cuerpo.enviados === 1, JSON.stringify(cuerpo));
    h = await llamar({ solo: 'no-es-correo' });
    check('una dirección de prueba inválida → 400', h.status === 400, `(fue ${h.status})`);
    const sinAvisar = await mkUser('http');
    check('la respuesta de la simulación no incluye ninguna dirección completa', !JSON.stringify(await (await llamar({})).json()).includes('wtavi_') && Boolean(sinAvisar));
  } finally {
    await cleanup();
  }
  return results;
};
