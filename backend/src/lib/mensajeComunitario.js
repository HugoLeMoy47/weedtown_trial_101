// Correo «¿cómo estás?» a quien lleva tiempo sin entrar (B8).
//
// QUÉ ES. Un saludo de la comunidad, en tono de cuidado y de reducción de riesgos, a quien
// activó «Mensajes de la comunidad» (`mensajes_comunitarios`) y lleva 21 días o más sin
// usar WeedTown. No es una campaña: no promueve nada ni pide publicar.
//
// EL CRITERIO (PO, 2026-11-11): 21 días sin actividad, contados sobre
// `User.ultimaActividadDia`, la única fecha de actividad que se guarda por persona (una
// fecha sin hora que se sobrescribe; ciclo 19A). No se crea ningún historial nuevo.
//
// UNO SOLO POR AUSENCIA. Una ausencia se identifica por su último día de actividad. Al
// escribirle a alguien se guarda ese día en `User.avisoAusenciaDia`; mientras coincida con
// `ultimaActividadDia`, ya se le escribió por esa ausencia y no se repite. Cuando la
// persona vuelve, su último día de actividad cambia, y solo una ausencia NUEVA de 21 días
// puede generar otro correo. La constancia se guarda SOLO si el correo salió: si lo frenó
// el tope de un correo al día, se intenta en la corrida siguiente.
//
// QUÉ NO LLEVA. Nada de nadie más: ni nombres, ni contenido, ni cifras de actividad. Tampoco
// dice cuántos días exactos lleva la persona sin entrar.
//
// ESTA FUNCIÓN NO DECIDE SI SE PUEDE ESCRIBIR. Quien lo manda es `correos.enviarCorreo`,
// que exige el consentimiento vigente, el tope diario y el pie con la baja en un clic.
// Mientras la finalidad siga `disponible: false` nadie puede activarla y esto no manda nada.
const { FINALIDADES } = require('./consentimientos');
const { enviarCorreo } = require('./correos');
const { DONDE_HAY_CORREO } = require('./contacto');
const { diaMexicoISO } = require('./diaMexico');

const FINALIDAD = 'mensajes_comunitarios';
const DIAS_DE_AUSENCIA = 21;
const DIA_MS = 24 * 60 * 60 * 1000;

/** El último día de actividad que ya cuenta como ausencia: hoy (en México) menos 21 días. */
function corteDeAusencia(ahora = new Date(), dias = DIAS_DE_AUSENCIA) {
  const hoy = new Date(`${diaMexicoISO(ahora)}T00:00:00.000Z`);
  return new Date(hoy.getTime() - dias * DIA_MS);
}

/**
 * A quién le toca. Solo cuentas vivas, con correo, con el consentimiento ACTIVO de la
 * versión vigente, con 21 días o más sin actividad y a las que no se les ha escrito por
 * esta misma ausencia. Una cuenta sin fecha de actividad no entra: no se sabe nada de ella.
 * @returns {Promise<{userId: number, ausenteDesde: Date}[]>}
 */
async function ausentesPendientes(prisma, ahora = new Date()) {
  const filas = await prisma.user.findMany({
    where: {
      deletedAt: null,
      ultimaActividadDia: { lte: corteDeAusencia(ahora) },
      AND: [
        DONDE_HAY_CORREO,
        { OR: [{ avisoAusenciaDia: null }, { avisoAusenciaDia: { lt: prisma.user.fields.ultimaActividadDia } }] }
      ],
      consentimientos: { some: { finalidad: FINALIDAD, otorgado: true, version: FINALIDADES[FINALIDAD].version } }
    },
    select: { id: true, ultimaActividadDia: true },
    orderBy: { id: 'asc' }
  });
  return filas.map(f => ({ userId: f.id, ausenteDesde: f.ultimaActividadDia }));
}

/**
 * El correo. BORRADOR pendiente de la revisión del PO (2026-11-11): la finalidad no se
 * vuelve `disponible` hasta que lo apruebe. El pie con la baja lo agrega `enviarCorreo`.
 */
function armarMensaje({ urlBase } = {}) {
  const base = String(urlBase || process.env.FRONTEND_URL || 'https://weedtown.social').replace(/\/$/, '');
  const asunto = '¿Cómo estás?';
  const parrafos = [
    'Hola:',
    'Hace unas semanas que no te vemos por WeedTown y queríamos saber cómo estás.',
    'No es una campaña ni un recordatorio para que publiques. Es un saludo de la comunidad: si estás bien y andas en otras cosas, qué gusto; aquí seguimos.',
    'Si la estás pasando difícil, no tienes que cargarlo a solas. En la red hay gente dispuesta a escuchar sin juzgar. Y si necesitas hablar con alguien ahora, en México la Línea de la Vida atiende gratis las 24 horas: 800 911 2000.',
    'Este mensaje se manda una sola vez. No te volveremos a escribir por esta ausencia.'
  ];
  const texto = [...parrafos, `Entra cuando quieras: ${base}/feed`].join('\n\n');
  const html = [...parrafos.map(p => `<p>${p}</p>`), `<p><a href="${base}/feed">Entrar a WeedTown</a></p>`].join('\n');
  return { asunto, texto, html };
}

/**
 * Corre el saludo. Cada persona pasa por `enviarCorreo`, que vuelve a comprobar el
 * consentimiento y aplica los topes. Devuelve solo CUENTAS, nunca a quién.
 * @returns {Promise<{candidatas: number, enviados: number, omitidos: Object<string, number>}>}
 */
async function enviarMensajesComunitarios({ prisma, mailer, ahora = new Date(), maximo } = {}) {
  const pendientes = await ausentesPendientes(prisma, ahora);
  const salida = { candidatas: pendientes.length, enviados: 0, omitidos: {} };
  const mensaje = armarMensaje();
  for (const p of pendientes) {
    const resultado = await enviarCorreo({ userId: p.userId, finalidad: FINALIDAD, ...mensaje, mailer, ahora, maximo });
    if (resultado.enviado) {
      salida.enviados++;
      // Constancia: ya se le escribió por la ausencia que empezó ese día. Si entre la
      // consulta y este punto la persona volvió, su fecha ya es otra y esto no la pisa.
      await prisma.user.updateMany({
        where: { id: p.userId, ultimaActividadDia: p.ausenteDesde },
        data: { avisoAusenciaDia: p.ausenteDesde }
      });
    } else {
      salida.omitidos[resultado.motivo] = (salida.omitidos[resultado.motivo] || 0) + 1;
    }
    if (resultado.motivo === 'tope_global') break;
  }
  return salida;
}

module.exports = { FINALIDAD, DIAS_DE_AUSENCIA, corteDeAusencia, ausentesPendientes, armarMensaje, enviarMensajesComunitarios };
