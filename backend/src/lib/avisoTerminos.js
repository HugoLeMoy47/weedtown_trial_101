// Aviso único de la actualización de los Términos (ciclos 21 y 22.1).
//
// QUÉ ES. Un correo de SERVICIO, una sola vez, a las cuentas con una dirección de
// contacto que aún no aceptan la versión vigente: avisa que los Términos cambiaron,
// cuál es la fecha límite y qué pasa si no se aceptan. NO es comunicación comercial.
//
// LA LÍNEA QUE NO SE CRUZA. Este mensaje informa; no promueve y no pide activar nada.
// Menciona que existen decisiones opcionales (porque la gente tiene derecho a saberlo)
// pero sin llamada a la acción sobre ellas: si las promoviera («activa esto para…»)
// pasaría a ser comunicación comercial, y esa exige consentimiento previo (ciclo 20).
// Por eso tampoco lleva enlace de baja: un aviso de servicio de una sola vez no es una
// lista a la que te suscribes. Cualquier correo que SÍ promueva algo sale por
// `correos.enviarCorreo`, que exige consentimiento y lleva su baja en un clic.
//
// QUÉ NO LLEVA. Ningún dato de la persona más allá de su dirección: ni handle, ni nombre,
// ni actividad, ni contenido ajeno. El saludo es «Hola».
//
// DESDE EL BACKEND, NO DESDE UNA COMPUTADORA. Hasta el ciclo 22 esto se mandaba con un
// script local y un archivo de registro. Pero el correo y la base de producción viven en
// Render: una computadora no tiene la clave de Resend, y un archivo local no sobrevive
// en un servidor sin disco persistente. Ahora lo manda el propio backend
// (`POST /api/interno/aviso-terminos`) y deja constancia en la base
// (`User.avisoTerminosVersion`: la versión de los Términos de la que ya se le avisó).
// Es también una prueba de que se avisó, que es lo que importa si alguien pregunta.
//
// CÓMO SE EVITAN LOS ACCIDENTES:
//   · Por defecto es una SIMULACIÓN: cuenta a quién le escribiría y no manda nada.
//   · Enviar de verdad exige `enviar: true` Y que el PO haya ARMADO el envío en el
//     entorno (`AVISO_TERMINOS_ACTIVO` igual a la versión vigente de los Términos): si el
//     texto cambia y la versión sube, el armado deja de valer y hay que volver a armar.
//   · Un modo de PRUEBA manda UN correo a una dirección dada, marcado `[PRUEBA]`, sin tocar
//     la constancia: es la forma de ver llegar el correo de verdad antes de armar nada.
//   · No repite: quien ya tiene constancia de esta versión no se vuelve a incluir.
//   · Tope por llamada (80; el tier gratuito de Resend admite ~100 al día). Un fallo no
//     deja constancia y se reintenta en la siguiente llamada.
const { SELECT_CONTACTO, DONDE_HAY_CORREO, correoDeContacto, enmascarar, FORMATO_CORREO, normalizar } = require('./contacto');
const { diaMexicoISO } = require('./diaMexico');

/** Cuántos correos como máximo por llamada: por debajo del tope diario de Resend. */
const MAXIMO_POR_DEFECTO = 80;

class ErrorDeAviso extends Error {
  constructor(estado, codigo, mensaje) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
  }
}

/** 'AAAA-MM-DD' → «20 de noviembre de 2026». Mediodía UTC: sin desfase de zona. */
function fechaLarga(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso;
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * A quién se le avisa: cuentas vivas con dirección de contacto que no han aceptado la
 * versión vigente y de las que aún no hay constancia de aviso. Las cuentas que comparten
 * dirección se agrupan: se escribe una vez y la constancia se deja en todas.
 * @returns {Promise<{correo: string, ids: number[]}[]>} ordenado por dirección
 */
async function pendientes(prisma, versionVigente) {
  const filas = await prisma.user.findMany({
    where: {
      deletedAt: null,
      AND: [
        DONDE_HAY_CORREO,
        { OR: [{ terminosVersion: null }, { terminosVersion: { not: versionVigente } }] },
        { OR: [{ avisoTerminosVersion: null }, { avisoTerminosVersion: { not: versionVigente } }] }
      ]
    },
    select: { id: true, ...SELECT_CONTACTO },
    orderBy: { id: 'asc' }
  });
  const porCorreo = new Map();
  for (const f of filas) {
    const correo = correoDeContacto(f);
    if (!correo) continue;
    if (!porCorreo.has(correo)) porCorreo.set(correo, []);
    porCorreo.get(correo).push(f.id);
  }
  return [...porCorreo.entries()].map(([correo, ids]) => ({ correo, ids })).sort((a, b) => a.correo.localeCompare(b.correo));
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

/**
 * Simula, prueba o envía el aviso.
 *
 *  · `solo`   → PRUEBA: un correo a esa dirección, con `[PRUEBA]` en el asunto. No toca la constancia.
 *  · `enviar` → ENVÍO real (el llamador ya comprobó que está armado). Sin esto, SIMULACIÓN.
 *
 * @returns {Promise<Object>} solo CUENTAS (y, en la simulación, una muestra enmascarada): nunca a quién se le escribió
 */
async function enviarAvisoTerminos({
  prisma, mailer, versionVigente, limite, urlBase, enviar = false, maximo = MAXIMO_POR_DEFECTO, solo = null,
  pausaMs = 600, dormir = (ms) => new Promise(r => setTimeout(r, ms))
}) {
  const mensaje = armarMensaje({ limite, urlBase });

  if (solo !== null && solo !== undefined) {
    const correo = normalizar(solo);
    if (!FORMATO_CORREO.test(correo)) throw new ErrorDeAviso(400, 'correo_invalido', 'La dirección de prueba no tiene forma de correo');
    await mailer.enviarAviso({ email: correo, ...mensaje, asunto: `[PRUEBA] ${mensaje.asunto}` });
    return { modo: 'prueba', enviados: 1 };
  }

  const lista = await pendientes(prisma, versionVigente);
  const ahora = lista.slice(0, Math.max(0, maximo));
  if (!enviar) {
    return { modo: 'simulacion', pendientes: lista.length, seEnviarianAhora: ahora.length, muestra: ahora.slice(0, 5).map(p => enmascarar(p.correo)) };
  }

  const salida = { modo: 'envio', pendientes: lista.length, enviados: 0, fallidos: 0, restantes: 0, errores: [] };
  for (const p of ahora) {
    try {
      await mailer.enviarAviso({ email: p.correo, ...mensaje });
      await prisma.user.updateMany({ where: { id: { in: p.ids } }, data: { avisoTerminosVersion: versionVigente } });
      salida.enviados++;
    } catch (e) {
      salida.fallidos++;
      if (salida.errores.length < 3 && !salida.errores.includes(e.message)) salida.errores.push(e.message);
    }
    if (pausaMs) await dormir(pausaMs);
  }
  salida.restantes = lista.length - salida.enviados;
  return salida;
}

module.exports = {
  MAXIMO_POR_DEFECTO, ErrorDeAviso, pendientes, armarMensaje, enviarAvisoTerminos, fechaLarga, enmascarar, diaMexicoISO
};
