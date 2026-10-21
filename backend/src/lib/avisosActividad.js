// Aviso diario de actividad por correo (ciclo 22, B26).
//
// QUÉ ES. Una vez al día, a quien lo activó (`avisos_correo`), UN correo que dice que en
// las últimas 24 horas pasaron cosas en su cuenta: «3 reacciones a tus publicaciones,
// 1 respuesta, 2 mensajes». Nada más.
//
// QUÉ NO LLEVA, y es la línea que no se cruza (la lección del ciclo 15, cuando una
// mención en un posteo solo para amigos filtraba el contenido a quien no podía leerlo):
// ni quién reaccionó, respondió o escribió, ni lo que dijeron, ni el título de nada. Solo
// cuántas y de qué clase. El correo es una puerta hacia afuera de la plataforma y lo que
// salga ahí sale: por eso solo lleva números.
//
// UNO AL DÍA, NO UNO POR EVENTO. Un correo por reacción sería ruido, gastaría el tope del
// día en el primer evento y dejaría sin aviso a los siguientes. Un resumen diario de las
// últimas 24 h, una vez, es lo que dice el texto de la finalidad.
//
// QUÉ CUENTA. Notificaciones SIN LEER de las últimas 24 horas, de tres clases:
//   reacciones (REACTION) · respuestas (REPLY_POST, REPLY_COMMENT) · mensajes (CHAT_MESSAGE).
// Las ya leídas no (la persona ya lo vio), ni las de moderación ni las de amistad: no son
// «novedades» de interacción y algunas son sensibles.
//
// ESTA FUNCIÓN NO DECIDE SI SE PUEDE ESCRIBIR: solo arma el resumen. Quien lo manda es
// `correos.enviarCorreo`, que exige el consentimiento, el tope diario y el pie de baja.
const { FINALIDADES } = require('./consentimientos');
const { enviarCorreo } = require('./correos');
const { DONDE_HAY_CORREO } = require('./contacto');

const FINALIDAD = 'avisos_correo';
const VENTANA_MS = 24 * 60 * 60 * 1000;

const CLASE = {
  REACTION: 'reacciones',
  REPLY_POST: 'respuestas',
  REPLY_COMMENT: 'respuestas',
  CHAT_MESSAGE: 'mensajes'
};

/**
 * A quién se le resume qué. Solo cuentas con consentimiento ACTIVO de la versión vigente.
 * @returns {Promise<{userId: number, reacciones: number, respuestas: number, mensajes: number}[]>}
 */
async function resumenesPendientes(prisma, ahora = new Date()) {
  const desde = new Date(ahora.getTime() - VENTANA_MS);
  const grupos = await prisma.notification.groupBy({
    by: ['recipientId', 'type'],
    where: {
      readAt: null,
      createdAt: { gte: desde },
      type: { in: Object.keys(CLASE) },
      recipient: {
        deletedAt: null,
        AND: [DONDE_HAY_CORREO],
        consentimientos: { some: { finalidad: FINALIDAD, otorgado: true, version: FINALIDADES[FINALIDAD].version } }
      }
    },
    _count: { _all: true }
  });
  const porPersona = new Map();
  for (const g of grupos) {
    const r = porPersona.get(g.recipientId) || { userId: g.recipientId, reacciones: 0, respuestas: 0, mensajes: 0 };
    r[CLASE[g.type]] += g._count._all;
    porPersona.set(g.recipientId, r);
  }
  return [...porPersona.values()].sort((a, b) => a.userId - b.userId);
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * El correo. Solo números y el enlace a la app: ningún nombre, ningún contenido.
 * El pie con la baja lo agrega `enviarCorreo`.
 */
function armarAviso({ reacciones, respuestas, mensajes }, { urlBase } = {}) {
  const base = String(urlBase || process.env.FRONTEND_URL || 'https://weedtown.social').replace(/\/$/, '');
  const partes = [];
  if (reacciones) partes.push(plural(reacciones, 'reacción a tus publicaciones', 'reacciones a tus publicaciones'));
  if (respuestas) partes.push(plural(respuestas, 'respuesta', 'respuestas'));
  if (mensajes) partes.push(plural(mensajes, 'mensaje', 'mensajes'));
  const resumen = partes.join(', ');
  const asunto = 'Tienes novedades en WeedTown';
  const texto = [
    'Hola:',
    '',
    `En las últimas 24 horas tuviste ${resumen} sin leer.`,
    '',
    `Entra para verlos: ${base}/feed`
  ].join('\n');
  const html = `<p>Hola:</p>\n<p>En las últimas 24 horas tuviste <strong>${resumen}</strong> sin leer.</p>\n<p><a href="${base}/feed">Entrar a WeedTown</a></p>`;
  return { asunto, texto, html };
}

/**
 * Corre el resumen diario. Cada persona pasa por `enviarCorreo`, que vuelve a comprobar el
 * consentimiento y aplica los topes. Devuelve solo CUENTAS, nunca a quién.
 * @returns {Promise<{candidatas: number, enviados: number, omitidos: Object<string, number>}>}
 */
async function enviarAvisosDiarios({ prisma, mailer, ahora = new Date(), maximo } = {}) {
  const resumenes = await resumenesPendientes(prisma, ahora);
  const salida = { candidatas: resumenes.length, enviados: 0, omitidos: {} };
  for (const r of resumenes) {
    const resultado = await enviarCorreo({ userId: r.userId, finalidad: FINALIDAD, ...armarAviso(r), mailer, ahora, maximo });
    if (resultado.enviado) salida.enviados++;
    else salida.omitidos[resultado.motivo] = (salida.omitidos[resultado.motivo] || 0) + 1;
    // Presupuesto del día agotado: no tiene caso seguir intentando con el resto.
    if (resultado.motivo === 'tope_global') break;
  }
  return salida;
}

module.exports = { FINALIDAD, CLASE, resumenesPendientes, armarAviso, enviarAvisosDiarios };
