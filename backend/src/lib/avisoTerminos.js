// Aviso único de la actualización de los Términos (ciclo 21).
//
// QUÉ ES. Un correo de SERVICIO, una sola vez, a las cuentas que tienen correo y
// aún no aceptan la versión vigente: avisa que los Términos cambiaron, cuál es la
// fecha límite y qué pasa si no se aceptan. NO es comunicación comercial.
//
// LA LÍNEA QUE NO SE CRUZA. Este mensaje informa; no promueve y no pide activar
// nada. Menciona que existen decisiones opcionales (porque la gente tiene derecho
// a saberlo) pero sin llamada a la acción sobre ellas: si las promoviera
// («activa esto para…») pasaría a ser comunicación comercial, y esa exige
// consentimiento previo (finalidad `comunicaciones_comerciales`, ciclo 20). Por
// eso tampoco lleva enlace de baja: un aviso de servicio de una sola vez no es una
// lista a la que te suscribes. Cualquier correo que SÍ promueva algo tiene que
// consultar `tieneConsentimiento` y llevar su baja en un clic.
//
// QUÉ NO LLEVA. Ningún dato de la persona más allá de su dirección: ni handle, ni
// nombre, ni actividad, ni contenido ajeno. El saludo es «Hola».
//
// CÓMO SE MANDA SIN ACCIDENTES (lo orquesta scripts/enviar-aviso-terminos.js):
//   · Por defecto es una PRUEBA: dice a quién le escribiría y no manda nada.
//   · No manda dos veces a la misma dirección: guarda un registro con el hash de
//     cada dirección ya avisada, no la dirección.
//   · Tiene un tope por corrida (el tier gratuito de Resend admite ~100 al día).
//   · Un envío que falla NO se marca como enviado.
const crypto = require('crypto');
const { diaMexicoISO } = require('./diaMexico');

const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Cuántos correos como máximo por corrida: por debajo del tope diario de Resend. */
const MAXIMO_POR_DEFECTO = 80;

const normalizar = (correo) => String(correo || '').trim().toLowerCase();

/** El registro guarda esto, no la dirección. */
const huella = (correo) => crypto.createHash('sha256').update(normalizar(correo)).digest('hex');

/** 'a***@gmail.com': para que quien revisa la lista vea de qué se trata sin volcar direcciones. */
function enmascarar(correo) {
  const [local, dominio] = normalizar(correo).split('@');
  return `${(local || '')[0] || '?'}***@${dominio || '?'}`;
}

/** 'AAAA-MM-DD' → «20 de noviembre de 2026». Mediodía UTC: sin desfase de zona. */
function fechaLarga(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso;
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * A quién se le avisa: cuentas vivas, con un correo válido, que no han aceptado la
 * versión vigente. Se incluyen las suspendidas: es un aviso sobre su cuenta.
 * Direcciones repetidas se cuentan una vez.
 * @returns {Promise<string[]>} correos normalizados
 */
async function destinatarios(prisma, versionVigente) {
  const filas = await prisma.user.findMany({
    where: {
      deletedAt: null,
      email: { not: null },
      OR: [{ terminosVersion: null }, { terminosVersion: { not: versionVigente } }]
    },
    select: { email: true }
  });
  const vistos = new Set();
  const lista = [];
  for (const { email } of filas) {
    const c = normalizar(email);
    if (!FORMATO_CORREO.test(c) || vistos.has(c)) continue;
    vistos.add(c);
    lista.push(c);
  }
  return lista.sort();
}

/**
 * El mensaje. El texto es el que aprobó el PO (borrador del ciclo 21, §3).
 * @param {{limite: string, urlBase: string}} datos
 */
function armarMensaje({ limite, urlBase }) {
  const fecha = fechaLarga(limite);
  const base = String(urlBase || 'https://weedtown.social').replace(/\/$/, '');
  const terminos = `${base}/terms`;
  const entrar = `${base}/feed`;

  const asunto = 'Actualizamos los Términos de WeedTown — tu cuenta sigue intacta';

  const texto = [
    'Hola:',
    '',
    'Actualizamos los Términos y la Política de Privacidad de WeedTown. Lo importante, en pocas líneas:',
    '',
    '• Qué cambió: para saber si la comunidad está viva, contamos cuántas personas usan WeedTown cada día. De tu cuenta guardamos solo la fecha del último día que entraste, sin hora ni páginas, y se sobrescribe. El resultado es un número por día, sin nombres.',
    `• Qué necesitamos de ti: que aceptes la versión nueva antes del ${fecha}. Entra a WeedTown y verás el aviso.`,
    '• Si no la aceptas: a partir de esa fecha no podrás usar la red, pero tu cuenta no se borra: puedes descargar tus datos, eliminarla o volver cuando aceptes.',
    '• Lo demás es opcional. Existen decisiones adicionales sobre tus datos; todas están apagadas y ninguna es necesaria para usar WeedTown. Puedes verlas en «Mis decisiones de privacidad».',
    '',
    `Leer los Términos: ${terminos}`,
    `Entrar a WeedTown: ${entrar}`,
    '',
    'Es un aviso de servicio sobre tu cuenta, no es publicidad. Si tienes dudas, responde a este correo.',
    '— El equipo de WeedTown'
  ].join('\n');

  const html = [
    '<p>Hola:</p>',
    '<p>Actualizamos los Términos y la Política de Privacidad de WeedTown. Lo importante, en pocas líneas:</p>',
    '<ul>',
    '<li><strong>Qué cambió:</strong> para saber si la comunidad está viva, contamos cuántas personas usan WeedTown cada día. De tu cuenta guardamos solo <strong>la fecha del último día que entraste</strong>, sin hora ni páginas, y se sobrescribe. El resultado es un número por día, sin nombres.</li>',
    `<li><strong>Qué necesitamos de ti:</strong> que aceptes la versión nueva <strong>antes del ${fecha}</strong>. Entra a WeedTown y verás el aviso.</li>`,
    '<li><strong>Si no la aceptas:</strong> a partir de esa fecha no podrás usar la red, pero <strong>tu cuenta no se borra</strong>: puedes descargar tus datos, eliminarla o volver cuando aceptes.</li>',
    '<li><strong>Lo demás es opcional.</strong> Existen decisiones adicionales sobre tus datos; todas están apagadas y ninguna es necesaria para usar WeedTown. Puedes verlas en «Mis decisiones de privacidad».</li>',
    '</ul>',
    `<p><a href="${terminos}">Leer los Términos</a> &nbsp;·&nbsp; <a href="${entrar}">Entrar a WeedTown</a></p>`,
    '<p>Es un aviso de servicio sobre tu cuenta, no es publicidad. Si tienes dudas, responde a este correo.<br>— El equipo de WeedTown</p>'
  ].join('\n');

  return { asunto, texto, html };
}

/** Decide qué se manda ahora, sin mandar nada. */
function planificar({ lista, registro, maximo = MAXIMO_POR_DEFECTO }) {
  const yaAvisadas = new Set(Object.keys(registro?.enviados || {}));
  const pendientes = lista.filter(c => !yaAvisadas.has(huella(c)));
  return {
    total: lista.length,
    yaAvisadas: lista.length - pendientes.length,
    pendientes: pendientes.length,
    ahora: pendientes.slice(0, Math.max(0, maximo))
  };
}

/**
 * Manda (o simula) el lote. Con `enviar: false` NO llama al mailer.
 * Un fallo no se marca como enviado y no detiene al resto.
 * @param {{ahora: string[], mailer: {enviarAviso: Function}, registro: {enviados: Object}, mensaje: Object, enviar: boolean, pausaMs?: number, dormir?: Function}} o
 */
async function enviarLote({ ahora, mailer, registro, mensaje, enviar, pausaMs = 600, dormir = (ms) => new Promise(r => setTimeout(r, ms)) }) {
  const resultado = { enviados: 0, fallidos: [], simulados: 0 };
  for (const correo of ahora) {
    if (!enviar) { resultado.simulados++; continue; }
    try {
      await mailer.enviarAviso({ email: correo, ...mensaje });
      registro.enviados[huella(correo)] = new Date().toISOString();
      resultado.enviados++;
    } catch (e) {
      resultado.fallidos.push({ correo: enmascarar(correo), error: e.message });
    }
    if (pausaMs) await dormir(pausaMs);
  }
  return resultado;
}

module.exports = {
  MAXIMO_POR_DEFECTO, destinatarios, armarMensaje, planificar, enviarLote,
  huella, enmascarar, fechaLarga, normalizar, diaMexicoISO
};
