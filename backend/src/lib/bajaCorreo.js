// Baja en un clic: enlaces firmados (ciclo 22, B25).
//
// QUÉ RESUELVE. Todo correo que no sea de servicio (campañas, avisos) tiene que
// llevar una forma de darse de baja que funcione SIN iniciar sesión y en UN clic.
// Es lo que promete el texto de cada finalidad («un enlace para apagarlo») y lo
// que los clientes de correo esperan (cabeceras `List-Unsubscribe`, RFC 8058).
//
// EL ENLACE LLEVA SU AUTORIZACIÓN. Un token firmado dice «esta persona, esta
// finalidad». No hay sesión que consultar: quien tiene el enlace —que solo llega a
// la bandeja de esa persona— puede apagar ESA finalidad, y nada más. No sirve para
// activar nada, ni para otra finalidad, ni para otra cuenta.
//
// POR QUÉ NO CADUCA. Un enlace de baja que deja de funcionar es peor que no tenerlo:
// la gente lo guarda en correos viejos y lo usa meses después. La firma lo hace
// infalsificable; no necesita fecha de vencimiento. Si algún día hubiera que
// invalidarlos todos, se cambia `BAJA_SECRET` (y se acepta que los viejos mueran).
//
// POR QUÉ UNA CLAVE PROPIA. Se deriva de `BAJA_SECRET` (o, en su defecto, de
// `JWT_SECRET`) con separación de dominio, para que un token de baja nunca sea
// válido como sesión ni al revés. Ojo: si se usa `JWT_SECRET` y esa clave se rota,
// los enlaces ya enviados dejan de funcionar; en producción conviene fijar
// `BAJA_SECRET` y no tocarla.
//
// QUÉ NO REVELA. Verificar o usar un token no dice si la cuenta existe: la baja es
// idempotente y responde igual para una cuenta que ya no está.
const crypto = require('crypto');
const { FINALIDADES } = require('./consentimientos');

const MAX_TOKEN = 256;

function clave() {
  const base = process.env.BAJA_SECRET || process.env.JWT_SECRET;
  if (!base) throw new Error('Falta BAJA_SECRET (o JWT_SECRET) para firmar los enlaces de baja');
  return crypto.createHmac('sha256', base).update('weedtown:baja:v1').digest();
}

const codificar = (valor) => Buffer.from(valor).toString('base64url');
const firmar = (carga) => crypto.createHmac('sha256', clave()).update(carga).digest();

/**
 * El token de baja de esta persona para esta finalidad.
 * @param {number} userId
 * @param {string} finalidad una de las finalidades del catálogo
 */
function firmarBaja(userId, finalidad) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('userId inválido para firmar una baja');
  if (!Object.prototype.hasOwnProperty.call(FINALIDADES, finalidad)) throw new Error('finalidad inválida para firmar una baja');
  const carga = `${id}.${finalidad}`;
  return `${codificar(carga)}.${codificar(firmar(carga))}`;
}

/**
 * @param {unknown} token
 * @returns {{userId: number, finalidad: string} | null} null si no es un token nuestro, íntegro y de una finalidad que existe
 */
function verificarBaja(token) {
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN) return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  let carga;
  let firma;
  try {
    carga = Buffer.from(partes[0], 'base64url').toString('utf8');
    firma = Buffer.from(partes[1], 'base64url');
  } catch {
    return null;
  }
  const esperada = firmar(carga);
  // Comparación de tiempo constante: no se filtra cuánto de la firma acertó.
  if (firma.length !== esperada.length || !crypto.timingSafeEqual(firma, esperada)) return null;
  const [idTexto, finalidad, ...resto] = carga.split('.');
  const userId = Number(idTexto);
  if (resto.length || !/^\d+$/.test(idTexto) || !Number.isSafeInteger(userId) || userId <= 0) return null;
  if (!Object.prototype.hasOwnProperty.call(FINALIDADES, finalidad)) return null;
  return { userId, finalidad };
}

/** Las dos direcciones de un mismo token: la página que ve la persona y el POST de un clic. */
function urlsDeBaja(userId, finalidad, { frontendUrl, backendUrl } = {}) {
  const token = firmarBaja(userId, finalidad);
  const front = String(frontendUrl || process.env.FRONTEND_URL || 'https://weedtown.social').replace(/\/$/, '');
  const back = String(backendUrl || process.env.BACKEND_URL || '').replace(/\/$/, '');
  return {
    token,
    pagina: `${front}/baja?token=${token}`,
    // El POST de un clic que hace el propio cliente de correo (RFC 8058).
    // Vacío si no se sabe la URL pública de la API: sin ella no se pone la cabecera.
    api: back ? `${back}/api/baja?token=${token}` : ''
  };
}

module.exports = { firmarBaja, verificarBaja, urlsDeBaja, MAX_TOKEN };
