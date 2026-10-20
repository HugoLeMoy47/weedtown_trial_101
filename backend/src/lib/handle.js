// El identificador público de WeedTown.
//
// Antes este papel lo hacía `acct`, la dirección de Mastodon. Eso ataba el
// nombre visible al proveedor con el que entraste, y hay proveedores donde
// sencillamente no existe: en Telegram el nombre de usuario es opcional, y con
// llave de acceso o correo no hay ninguno. El handle es de la plataforma, no
// del proveedor.
const prisma = require('./prisma');

const MIN = 3;
const MAX = 20;
const RE = /^[a-z0-9][a-z0-9_]{2,19}$/;

// Nadie puede llamarse como el equipo ni como una sección del producto: un
// handle "moderacion" o "soporte" es una suplantación lista para usarse, y
// acabamos de construir el sistema que tendría que perseguirla.
const RESERVADOS = new Set([
  'admin', 'administrador', 'administracion', 'moderacion', 'moderador', 'mod', 'mods',
  'weedtown', 'wt', 'soporte', 'ayuda', 'oficial', 'staff', 'equipo', 'sistema',
  'root', 'null', 'undefined', 'anonimo', 'anonima', 'yo', 'me', 'api', 'www',
  'login', 'logout', 'registro', 'perfil', 'feed', 'foro', 'foros', 'chat',
  'cerca', 'avatars', 'avatares', 'reportes', 'seguridad', 'privacidad'
]);

/** Deja solo lo que puede ir en un handle. No garantiza que sea válido. */
function normalizar(bruto) {
  return String(bruto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar acentos
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, MAX);
}

/**
 * @returns {string|null} null si es válido, o el motivo del rechazo
 */
function motivoInvalido(handle) {
  if (typeof handle !== 'string' || !handle) return 'El handle no puede estar vacío';
  if (handle.length < MIN) return `El handle debe tener al menos ${MIN} caracteres`;
  if (handle.length > MAX) return `El handle no puede superar ${MAX} caracteres`;
  if (!RE.test(handle)) {
    return 'El handle solo admite minúsculas, números y guion bajo, y debe empezar con letra o número';
  }
  if (RESERVADOS.has(handle)) return 'Ese handle está reservado';
  return null;
}

const esValido = (handle) => motivoInvalido(handle) === null;

/** Días que un handle abandonado queda reservado para nadie más (ciclo 16, A-3). */
const DIAS_RESERVA = 90;

/**
 * ¿No se puede reclamar este handle? Cuenta como tomado si lo tiene una
 * cuenta O si está en reserva vigente a nombre de otra persona. La reserva
 * vencida ya no estorba (la fila se reemplaza al reservar de nuevo).
 * @param {string} handle ya normalizado
 * @param {number} [exceptoUserId] quien pregunta: su propia cuenta y sus propias reservas no cuentan
 * @returns {Promise<boolean>}
 */
async function estaTomado(handle, exceptoUserId) {
  const cuenta = await prisma.user.findUnique({ where: { handle }, select: { id: true } });
  if (cuenta && cuenta.id !== exceptoUserId) return true;
  const reserva = await prisma.handleReservado.findUnique({ where: { handle } });
  return Boolean(reserva && reserva.hastaAt > new Date() && reserva.userId !== exceptoUserId);
}

/** Operación de Prisma que reserva `handle` para `userId` DIAS_RESERVA días (para usar dentro de $transaction). */
function reservarHandle(handle, userId, ahora = new Date()) {
  const hastaAt = new Date(ahora.getTime() + DIAS_RESERVA * 24 * 60 * 60 * 1000);
  return prisma.handleReservado.upsert({
    where: { handle },
    create: { handle, userId, hastaAt },
    update: { userId, hastaAt, creadoAt: ahora }
  });
}

/**
 * Handle libre a partir de una sugerencia. Si ya está tomado, va probando con
 * un sufijo numérico. Se usa al dar de alta: nadie debería quedarse fuera
 * porque su nombre de origen ya existía.
 * @param {string} sugerencia
 * @returns {Promise<string>}
 */
async function generarUnico(sugerencia) {
  let base = normalizar(sugerencia);
  if (base.length < MIN || !RE.test(base) || RESERVADOS.has(base)) {
    base = `wt${base}`.slice(0, MAX);
  }
  if (base.length < MIN) base = 'wtuser';

  for (let i = 0; i < 50; i++) {
    const intento = i === 0 ? base : `${base.slice(0, MAX - String(i).length)}${i}`;
    if (RESERVADOS.has(intento)) continue;
    if (!(await estaTomado(intento))) return intento;
  }
  // Salida de emergencia: prácticamente irrepetible
  return `wt${Date.now().toString(36)}`.slice(0, MAX);
}

module.exports = { MIN, MAX, DIAS_RESERVA, normalizar, motivoInvalido, esValido, generarUnico, estaTomado, reservarHandle, RESERVADOS };
