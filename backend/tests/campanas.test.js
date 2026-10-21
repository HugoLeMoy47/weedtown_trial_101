// Ciclo 22 (B26): campañas de comunicación comercial.
//
// Una campaña es un archivo que escribe el PO. Lo que hay que sostener:
//   1. Se valida: no se puede mandar un «ejemplo», ni una campaña que traiga su PROPIO
//      enlace de baja (el firmado de cada persona lo agrega `enviarCorreo`).
//   2. Solo se le escribe a quien tiene el consentimiento comercial ACTIVO de la
//      versión vigente, con correo, cuenta viva y sin suspensión. Quien nunca lo dio, lo
//      apagó, aceptó un texto que cambió o se dio de baja, NO está en la lista.
//   3. La planificación descuenta lo ya enviado y a quien ya recibió un correo hoy.
const fs = require('fs');
const path = require('path');
const { suite } = require('./lib');
const { validarCampana, destinatariosComerciales, planificarCampana, huella } = require('../src/lib/campanas');
const { FINALIDADES } = require('../src/lib/consentimientos');

module.exports = async function run() {
  const { results, check, mkUser, cleanup, prisma } = suite('Campanas', 'wtcam');
  const F = 'comunicaciones_comerciales';
  const dar = (userId, extra = {}) => prisma.consentimiento.upsert({
    where: { userId_finalidad: { userId, finalidad: F } },
    create: { userId, finalidad: F, version: FINALIDADES[F].version, otorgado: true, ...extra },
    update: { otorgado: true, version: FINALIDADES[F].version, ...extra }
  });
  const buena = { id: 'novedades-de-prueba', asunto: 'Novedades de WeedTown', texto: 'Hola:\n\nEste es el mensaje de la campaña.\n\nUn saludo.' };

  await cleanup();
  try {
    console.log('\n  — Validar la campaña —');
    const ok = validarCampana(buena);
    check('una campaña válida queda lista', ok.id === buena.id && ok.asunto === buena.asunto);
    check('sin html propio, se deriva del texto: un <p> por párrafo', (ok.html.match(/<p>/g) || []).length === 3);
    const peligroso = validarCampana({ ...buena, texto: 'Hola <script>alert(1)</script> & "todos"\n\nSegundo párrafo con suficiente texto.' });
    check('el html derivado ESCAPA el texto (nada se interpreta como etiqueta)', !peligroso.html.includes('<script>') && peligroso.html.includes('&lt;script&gt;') && peligroso.html.includes('&amp;'));
    check('un html propio se respeta tal cual', validarCampana({ ...buena, html: '<h1>Hola</h1>' }).html === '<h1>Hola</h1>');
    const rechaza = (c) => { try { validarCampana(c); return false; } catch { return true; } };
    check('un id «ejemplo-…» NO se puede enviar', rechaza({ ...buena, id: 'ejemplo-novedades' }));
    check('un id inválido se rechaza', rechaza({ ...buena, id: 'Mayúsculas y espacios' }) && rechaza({ ...buena, id: 'ab' }) && rechaza({ ...buena, id: '-empieza-mal' }));
    check('un asunto vacío o larguísimo se rechaza', rechaza({ ...buena, asunto: '' }) && rechaza({ ...buena, asunto: 'x'.repeat(200) }));
    check('un texto muy corto o ausente se rechaza', rechaza({ ...buena, texto: 'hola' }) && rechaza({ ...buena, texto: undefined }));
    check('una campaña que trae SU PROPIO enlace de baja se rechaza (se agrega solo, firmado)',
      rechaza({ ...buena, texto: 'Mensaje largo de la campaña.\n\nPara darte de baja entra aquí: https://x.test' }) &&
      rechaza({ ...buena, html: '<p>Mensaje</p><a href="https://x.test">Unsubscribe</a>' }));
    check('no es un objeto → se rechaza', rechaza(null) && rechaza('texto') && rechaza(42));
    const ejemplo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'campanas', 'ejemplo.json'), 'utf8'));
    check('el archivo de ejemplo del repositorio tiene la forma correcta pero NO se puede enviar', ejemplo.id.startsWith('ejemplo') && rechaza(ejemplo) && !rechaza({ ...ejemplo, id: 'ya-no-es-ejemplo' }));

    console.log('\n  — A quién se le escribe —');
    // Una cuenta que solo entra por correo (sin User.email: así es casi toda la base real) y otra con User.email.
    const activo = await mkUser('act');
    await prisma.identity.create({ data: { userId: activo.id, provider: 'EMAIL', externalId: 'WTCAM_Act@Example.Test ', originHandle: 'x' } });
    await dar(activo.id);
    const conPerfil = await mkUser('perf', { email: 'wtcam_perf@example.test' });
    await dar(conPerfil.id);
    const sinFila = await mkUser('sinf', { email: 'wtcam_sinf@example.test' });
    const apagado = await mkUser('apag', { email: 'wtcam_apag@example.test' });
    await dar(apagado.id, { otorgado: false });
    const vieja = await mkUser('vieja', { email: 'wtcam_vieja@example.test' });
    await dar(vieja.id, { version: '2020-01-01' });
    const otraFinalidad = await mkUser('otra', { email: 'wtcam_otra@example.test' });
    await prisma.consentimiento.create({ data: { userId: otraFinalidad.id, finalidad: 'avisos_correo', version: FINALIDADES.avisos_correo.version, otorgado: true } });
    const sinCorreo = await mkUser('sinc');
    await dar(sinCorreo.id);
    const borrada = await mkUser('borr', { email: 'wtcam_borr@example.test', deletedAt: new Date() });
    await dar(borrada.id);
    const suspendida = await mkUser('susp', { email: 'wtcam_susp@example.test', suspendedUntil: new Date(Date.now() + 86400000) });
    await dar(suspendida.id);
    const malCorreo = await mkUser('malc', { email: 'no-es-correo' });
    await dar(malCorreo.id);
    const lista = (await destinatariosComerciales(prisma)).filter(p => p.email.startsWith('wtcam_'));
    check('quien entra por correo y tiene el consentimiento comercial ACTIVO y vigente, sí (con la dirección de su acceso, normalizada)', lista.some(p => p.email === 'wtcam_act@example.test'));
    check('quien tiene User.email, también', lista.some(p => p.email === 'wtcam_perf@example.test'));
    check('quien nunca lo dio, no', !lista.some(p => p.id === sinFila.id));
    check('quien lo apagó (o se dio de baja), no', !lista.some(p => p.id === apagado.id));
    check('quien aceptó un texto que ya CAMBIÓ, no, hasta confirmar de nuevo', !lista.some(p => p.id === vieja.id));
    check('un consentimiento de OTRA finalidad no vale para esta', !lista.some(p => p.id === otraFinalidad.id));
    check('sin correo, cuenta eliminada o suspendida, no', !lista.some(p => [sinCorreo.id, borrada.id, suspendida.id].includes(p.id)));
    check('un correo con forma inválida no se usa', !lista.some(p => p.id === malCorreo.id));
    check('son exactamente las personas esperadas', lista.length === 2, `(${lista.map(p => p.email).join(', ')})`);

    console.log('\n  — La planificación —');
    const gente = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, email: `x${i}@example.test`, recibioHoy: i < 2 }));
    const plan = planificarCampana({ lista: gente, registro: { enviados: {} }, maximo: 5 })('novedades-de-prueba');
    check('cuenta el total y los pendientes', plan.total === 10 && plan.pendientes === 10);
    check('descuenta a quien ya recibió un correo HOY (un correo al día por persona)', plan.recibieronHoy === 2 && !plan.ahora.some(p => p.recibioHoy));
    check('respeta el tope de la corrida', plan.ahora.length === 5);
    const registro = { enviados: { [huella(3, 'novedades-de-prueba')]: 'x', [huella(4, 'novedades-de-prueba')]: 'x' } };
    const plan2 = planificarCampana({ lista: gente, registro, maximo: 50 })('novedades-de-prueba');
    check('no repite a quien ya recibió ESTA campaña', plan2.yaEnviadas === 2 && !plan2.ahora.some(p => p.id === 3 || p.id === 4));
    const otra = planificarCampana({ lista: gente, registro, maximo: 50 })('otra-campana-distinta');
    check('...pero SÍ puede recibir una campaña distinta (el registro es por campaña)', otra.yaEnviadas === 0);
    check('el registro guarda un hash, no la persona ni el correo', /^[0-9a-f]{64}$/.test(huella(3, 'novedades-de-prueba')) && huella(3, 'a') !== huella(3, 'b') && huella(3, 'a') !== huella(4, 'a'));
  } finally {
    await cleanup();
  }
  return results;
};
