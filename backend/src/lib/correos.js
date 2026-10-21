// Envío de correo que NO es de servicio: campañas y avisos (ciclo 22, B26).
//
// ESTE ES EL ÚNICO CAMINO. Todo correo comercial o de aviso sale por `enviarCorreo`,
// y `enviarCorreo` no tiene atajos: antes de tocar el mailer comprueba, en este
// orden y sin excepción,
//   1. que la finalidad EXISTA y sea de las que usan el correo;
//   2. que la persona tenga un consentimiento ACTIVO de la versión vigente
//      (`tieneConsentimiento`: sin fila, apagado o de un texto viejo = no);
//   3. que la cuenta esté viva y tenga correo (y no suspendida);
//   4. que no se le haya mandado ya un correo HOY (tope: uno al día por persona);
//   5. que no se haya agotado el presupuesto del día de toda la plataforma (el tier
//      gratuito de Resend admite ~100; por defecto se corta en 80).
// Y todo lo que sale lleva el pie de identificación y baja, y las cabeceras
// `List-Unsubscribe` de un clic. Un llamador no puede olvidarlos: los pone esta función.
//
// LOS DOS TOPES SE RECLAMAN ANTES DE ENVIAR, no después. Con «reclamar y luego
// enviar», dos envíos simultáneos a la misma persona no pueden colarse los dos (el
// `UPDATE` condicionado deja pasar a uno solo), y si el envío falla se DEVUELVE lo
// reclamado: un correo que no salió no gasta el día de nadie.
//
// QUÉ SE GUARDA. Por persona, una fecha que se sobrescribe (`User.ultimoCorreoDia`:
// el último día que se le escribió, para poder sostener el tope); y por día, un número
// (`ConteoCorreo`, sin identidades). No hay una lista de a quién se le escribió cuándo.
// Se declara en el texto de las finalidades que lo usan.
const prisma = require('./prisma');
const { diaMexicoISO } = require('./diaMexico');
const { FINALIDADES, tieneConsentimiento } = require('./consentimientos');
const { urlsDeBaja } = require('./bajaCorreo');
const { log } = require('./logger');

const MAX_DIA_POR_DEFECTO = 80;

/** El presupuesto del día. `CORREOS_MAX_DIA` lo cambia (1–100); un valor raro se ignora. */
function maximoPorDia(env = process.env) {
  const n = Number(env.CORREOS_MAX_DIA);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : MAX_DIA_POR_DEFECTO;
}

/**
 * Reclama el correo del día para esta persona y un lugar en el presupuesto global.
 * @returns {Promise<{ok: true, previo: Date|null} | {ok: false, motivo: 'tope_diario_persona'|'tope_global'|'cuenta_no_disponible'}>}
 */
async function reclamar(userId, ahora = new Date(), maximo = maximoPorDia()) {
  const dia = diaMexicoISO(ahora);
  const antes = await prisma.user.findUnique({ where: { id: userId }, select: { ultimoCorreoDia: true } });
  if (!antes) return { ok: false, motivo: 'cuenta_no_disponible' };

  // 1. La persona: una sola sentencia atómica, solo pasa si hoy no se le ha escrito.
  const persona = await prisma.$queryRaw`
    UPDATE "User" SET "ultimoCorreoDia" = ${dia}::date
    WHERE "id" = ${userId} AND "deletedAt" IS NULL
      AND ("ultimoCorreoDia" IS NULL OR "ultimoCorreoDia" < ${dia}::date)
    RETURNING "id"
  `;
  if (persona.length === 0) return { ok: false, motivo: 'tope_diario_persona' };

  // 2. La plataforma: el contador sube solo si todavía hay presupuesto.
  const global = await prisma.$queryRaw`
    INSERT INTO "ConteoCorreo" ("dia", "conteo") VALUES (${dia}::date, 1)
    ON CONFLICT ("dia") DO UPDATE SET "conteo" = "ConteoCorreo"."conteo" + 1
      WHERE "ConteoCorreo"."conteo" < ${maximo}
    RETURNING "conteo"
  `;
  if (global.length === 0) {
    await devolverPersona(userId, antes.ultimoCorreoDia, dia);
    return { ok: false, motivo: 'tope_global' };
  }
  return { ok: true, previo: antes.ultimoCorreoDia };
}

async function devolverPersona(userId, previo, dia) {
  await prisma.$executeRaw`
    UPDATE "User" SET "ultimoCorreoDia" = ${previo}
    WHERE "id" = ${userId} AND "ultimoCorreoDia" = ${dia}::date
  `;
}

/** Devuelve lo reclamado cuando el correo NO salió. */
async function liberar(userId, reclamo, ahora = new Date()) {
  const dia = diaMexicoISO(ahora);
  await devolverPersona(userId, reclamo.previo, dia);
  await prisma.$executeRaw`
    UPDATE "ConteoCorreo" SET "conteo" = GREATEST("conteo" - 1, 0) WHERE "dia" = ${dia}::date
  `;
}

/**
 * El pie que lleva TODO correo no de servicio: quién lo envía, por qué lo recibes y
 * cómo darte de baja en un clic. Lo agrega `enviarCorreo`; ningún llamador lo escribe.
 */
function agregarPie({ texto, html, finalidad, urls }) {
  const titulo = FINALIDADES[finalidad].titulo;
  const base = String(process.env.FRONTEND_URL || 'https://weedtown.social').replace(/\/$/, '');
  const pieTexto = [
    '',
    '—',
    `Recibes este correo porque activaste «${titulo}» en WeedTown. Enviado por WeedTown Colectivo.`,
    `Para darte de baja en un clic: ${urls.pagina}`,
    `Tus decisiones de privacidad: ${base}/privacidad`
  ].join('\n');
  const pieHtml =
    '<hr>' +
    `<p style="font-size:12px;color:#666">Recibes este correo porque activaste «${titulo}» en WeedTown. Enviado por WeedTown Colectivo.<br>` +
    `<a href="${urls.pagina}">Darme de baja en un clic</a> · <a href="${base}/privacidad">Mis decisiones de privacidad</a></p>`;
  return { texto: `${texto}${pieTexto}`, html: `${html}${pieHtml}` };
}

/** Las cabeceras que activan el botón «Cancelar suscripción» del propio cliente de correo (RFC 8058). */
function cabecerasDeBaja(urls) {
  if (!urls.api) return {};
  return { 'List-Unsubscribe': `<${urls.api}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}

/**
 * @param {{userId: number, finalidad: string, asunto: string, texto: string, html: string,
 *          mailer: {enviarAviso: Function}, ahora?: Date, maximo?: number}} o
 * @returns {Promise<{enviado: true} | {enviado: false, motivo: string, error?: string}>}
 */
async function enviarCorreo({ userId, finalidad, asunto, texto, html, mailer, ahora = new Date(), maximo }) {
  const def = FINALIDADES[finalidad];
  if (!def || !def.requiereCorreo) return { enviado: false, motivo: 'finalidad_invalida' };
  if (!asunto || !texto || !html) return { enviado: false, motivo: 'mensaje_incompleto' };

  // 2. El consentimiento, siempre, y de la versión vigente.
  if (!(await tieneConsentimiento(userId, finalidad))) return { enviado: false, motivo: 'sin_consentimiento' };

  // 3. La cuenta.
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, deletedAt: true, suspendedUntil: true } });
  if (!u || u.deletedAt) return { enviado: false, motivo: 'cuenta_no_disponible' };
  if (!u.email) return { enviado: false, motivo: 'sin_correo' };
  if (u.suspendedUntil && u.suspendedUntil > ahora) return { enviado: false, motivo: 'cuenta_suspendida' };

  // 4 y 5. Los topes, reclamados ANTES de enviar.
  const reclamo = await reclamar(userId, ahora, maximo);
  if (!reclamo.ok) return { enviado: false, motivo: reclamo.motivo };

  const urls = urlsDeBaja(userId, finalidad);
  const conPie = agregarPie({ texto, html, finalidad, urls });
  try {
    await mailer.enviarAviso({ email: u.email, asunto, texto: conPie.texto, html: conPie.html, headers: cabecerasDeBaja(urls) });
  } catch (e) {
    await liberar(userId, reclamo, ahora);
    return { enviado: false, motivo: 'fallo', error: e.message };
  }
  log('correo_enviado', { userId, finalidad });
  return { enviado: true };
}

module.exports = { enviarCorreo, reclamar, liberar, agregarPie, cabecerasDeBaja, maximoPorDia, MAX_DIA_POR_DEFECTO };
