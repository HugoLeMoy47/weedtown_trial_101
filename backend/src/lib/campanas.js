// Campañas de comunicación comercial (ciclo 22, B26).
//
// UNA CAMPAÑA ES UN ARCHIVO. El texto lo escribe el PO (no está en el código):
//   { "id": "2026-11-novedades", "asunto": "…", "texto": "…", "html": "…" }   (`html` opcional)
// y el script `scripts/enviar-comercial.js` la manda. Este módulo valida la campaña,
// decide a quién y arma el mensaje; el envío en sí lo hace `correos.enviarCorreo`, que
// es quien exige el consentimiento, el tope de uno al día y el pie de baja.
//
// A QUIÉN. Solo a quien tiene un consentimiento ACTIVO de `comunicaciones_comerciales`
// de la versión vigente, con correo, cuenta viva y sin suspensión. Quien nunca lo dio, lo
// apagó o aceptó un texto que ya cambió, NO está en la lista. Aquí se filtra para poder
// decir cuántas personas son ANTES de enviar; `enviarCorreo` lo vuelve a comprobar al
// mandar cada una (una baja que llegue a mitad de envío se respeta).
const crypto = require('crypto');
const { FINALIDADES } = require('./consentimientos');
const { diaMexicoISO } = require('./diaMexico');

const FINALIDAD = 'comunicaciones_comerciales';
const ID_VALIDO = /^[a-z0-9][a-z0-9-]{2,60}$/;

const escaparHtml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Valida el contenido de una campaña. Devuelve la campaña lista o lanza con el motivo.
 * Un `ejemplo-…` NO se puede enviar: existe para mostrar el formato.
 */
function validarCampana(c) {
  if (!c || typeof c !== 'object') throw new Error('La campaña debe ser un objeto JSON');
  if (typeof c.id !== 'string' || !ID_VALIDO.test(c.id)) throw new Error('id inválido: minúsculas, números y guiones, de 3 a 61 caracteres');
  if (c.id.startsWith('ejemplo')) throw new Error('Una campaña de ejemplo no se puede enviar: cámbiale el id');
  if (typeof c.asunto !== 'string' || c.asunto.trim().length < 3 || c.asunto.length > 150) throw new Error('asunto requerido (3 a 150 caracteres)');
  if (typeof c.texto !== 'string' || c.texto.trim().length < 20 || c.texto.length > 5000) throw new Error('texto requerido (20 a 5000 caracteres)');
  if (c.html !== undefined && typeof c.html !== 'string') throw new Error('html, si se da, debe ser texto');
  // El pie con la baja lo agrega `enviarCorreo`: una campaña que traiga el suyo duplicaría
  // o, peor, pondría uno falso.
  if (/darte de baja|unsubscribe|cancelar suscripci/i.test(`${c.texto} ${c.html || ''}`)) {
    throw new Error('El texto no debe incluir su propio enlace de baja: se agrega solo, con el enlace firmado de cada persona');
  }
  const texto = c.texto.trim();
  const html = c.html ? c.html : texto.split(/\n{2,}/).map(p => `<p>${escaparHtml(p).replace(/\n/g, '<br>')}</p>`).join('\n');
  return { id: c.id, asunto: c.asunto.trim(), texto, html };
}

/**
 * A quién se le escribiría hoy. `elegiblesHoy` descuenta a quien ya recibió un correo
 * hoy (de cualquier tipo): el tope es uno al día por persona.
 * @returns {Promise<{id: number, email: string}[]>}
 */
async function destinatariosComerciales(prisma, { ahora = new Date() } = {}) {
  const dia = new Date(`${diaMexicoISO(ahora)}T00:00:00.000Z`);
  const filas = await prisma.user.findMany({
    where: {
      deletedAt: null,
      email: { not: null },
      OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: ahora } }],
      consentimientos: { some: { finalidad: FINALIDAD, otorgado: true, version: FINALIDADES[FINALIDAD].version } }
    },
    select: { id: true, email: true, ultimoCorreoDia: true },
    orderBy: { id: 'asc' }
  });
  const vistos = new Set();
  const lista = [];
  for (const f of filas) {
    const correo = String(f.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || vistos.has(correo)) continue;
    vistos.add(correo);
    lista.push({ id: f.id, email: correo, recibioHoy: Boolean(f.ultimoCorreoDia && f.ultimoCorreoDia >= dia) });
  }
  return lista;
}

const huella = (userId, campanaId) => crypto.createHash('sha256').update(`${campanaId}:${userId}`).digest('hex');

/** Lo que se enviaría ahora, sin enviar nada. */
function planificarCampana({ lista, registro, maximo }) {
  const yaEnviadas = new Set(Object.keys(registro?.enviados || {}));
  return (campanaId) => {
    const pendientes = lista.filter(p => !yaEnviadas.has(huella(p.id, campanaId)));
    const elegibles = pendientes.filter(p => !p.recibioHoy);
    return {
      total: lista.length,
      yaEnviadas: lista.length - pendientes.length,
      pendientes: pendientes.length,
      recibieronHoy: pendientes.length - elegibles.length,
      ahora: elegibles.slice(0, Math.max(0, maximo))
    };
  };
}

module.exports = { FINALIDAD, validarCampana, destinatariosComerciales, planificarCampana, huella, escaparHtml };
