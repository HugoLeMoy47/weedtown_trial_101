// Middlewares de autenticación por JWT (Authorization: Bearer <token>)
// y de autorización por rol (USER / MOD / ADMIN).
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

function getTokenPayload(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

// Exige sesión válida y que la cuenta exista activamente en la base de datos (SEC-02)
async function requireAuth(req, res, next) {
  const payload = getTokenPayload(req);
  if (!payload || !payload.userId) return res.status(401).json({ error: 'No autenticado' });
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, deletedAt: true }
    });
    // Una cuenta eliminada (HU-PRIV-001) borra todas sus identidades, así que
    // en la práctica ya no se puede volver a entrar — pero un JWT emitido
    // ANTES de eliminarla sigue siendo válido hasta sus 7 días de vigencia. Sin
    // este chequeo, esa sesión vieja podría seguir usando la API de por vida.
    if (!user || user.deletedAt) return res.status(401).json({ error: 'Sesión no válida o usuario inexistente' });
    req.user = { id: user.id };
    next();
  } catch (e) {
    console.error('Error al verificar la sesión:', e);
    res.status(500).json({ error: 'Error al verificar la sesión' });
  }
}

// Adjunta req.user si hay token válido, pero no bloquea (rutas públicas personalizables)
function optionalAuth(req, res, next) {
  const payload = getTokenPayload(req);
  if (payload) req.user = { id: payload.userId };
  next();
}

// Exige un rol mínimo además de la sesión (HU-SEG-003).
// El rol vive en la base, no en el JWT: así revocarlo surte efecto de inmediato
// y no hay que esperar a que caduque el token (7 días).
function requireRole(...roles) {
  return async (req, res, next) => {
    if (!req.user?.id) return res.status(401).json({ error: 'No autenticado' });
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { role: true }
      });
      if (!user || !roles.includes(user.role)) {
        return res.status(403).json({ error: 'No tienes permiso para esta acción' });
      }
      req.user.role = user.role;
      next();
    } catch (e) {
      console.error('Error al verificar el rol:', e);
      res.status(500).json({ error: 'Error al verificar permisos' });
    }
  };
}

// Bloquea la ESCRITURA a las cuentas suspendidas (HU-SEG-005).
// Leer sigue permitido a propósito: una suspensión es una pausa para participar,
// no una expulsión — la persona puede seguir viendo la comunidad y volver.
// La suspensión caduca sola, así que no hace falta un proceso que la levante.
async function requireNotSuspended(req, res, next) {
  if (!req.user?.id) return res.status(401).json({ error: 'No autenticado' });
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { suspendedUntil: true, suspendedReason: true }
    });
    if (user?.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
      const { MOTIVO_TEXTO } = require('../lib/moderation');
      return res.status(403).json({
        error: 'Tu cuenta está suspendida temporalmente y no puede publicar.',
        suspendedUntil: user.suspendedUntil,
        reason: user.suspendedReason,
        reasonText: MOTIVO_TEXTO[user.suspendedReason] || null
      });
    }
    next();
  } catch (e) {
    console.error('Error al verificar la suspensión:', e);
    res.status(500).json({ error: 'Error al verificar el estado de tu cuenta' });
  }
}

// Cuarentena de cuentas recién creadas para las acciones de CONTACTO DIRECTO
// (toque de Cerca, abrir un chat nuevo) — HU-SEG-006.
//
// Por qué: con Mastodon, volver después de una suspensión cuesta conseguir
// otra cuenta en una instancia. Con llave de acceso o correo, cuesta un
// registro instantáneo y gratuito. Esto no evita la evasión —nada lo hace del
// todo— pero encarece el paso más dañino: volver a alcanzar a la MISMA
// persona de inmediato con una cuenta nueva.
//
// Por qué solo esas dos acciones y no todo (posts, comentarios, foro): esas
// siguen abiertas desde el minuto uno a propósito — la moderación reactiva
// (reportes + ocultar + suspender) ya las cubre igual que a cualquier otra
// cuenta, y gatear la escritura entera penalizaría a cualquier persona nueva
// legítima, no solo a quien evade.
//
// Por qué no aplica igual a cada proveedor: la cuarentena se gradúa según el
// costo REAL de conseguir cada identidad (HU-SEG-007, decisión D1) — antes
// era binaria ("¿tiene Mastodon?"), y eso castigaba con las mismas 24h a
// cualquier alta legítima por correo o llave, sin distinguir entre las dos.
//   · Mastodon: cuenta en una instancia del fediverso — costo de origen real.
//     Cuarentena 0.
//   · Correo verificado: un buzón bajo control, comprobado por el enlace
//     mágico — señal intermedia, hoy sin aprovechar.
//   · Solo llave de acceso: registro instantáneo y gratuito, sin ninguna
//     señal. La ventana más larga.
// Costo aceptado, no un bug: una cuenta con llave + correo de respaldo toma
// la ventana CORTA (la más permisiva de sus identidades) — es la conducta que
// el README quiere fomentar para recuperación de cuenta, aunque signifique
// que alguien puede quemar un correo desechable para bajar de 24h a unas pocas.
const QUARANTINE_HOURS_EMAIL = Number(process.env.SIGNUP_QUARANTINE_HOURS_EMAIL) || 3;
const QUARANTINE_HOURS_PASSKEY = Number(process.env.SIGNUP_QUARANTINE_HOURS_PASSKEY) || 24;
const VENTANA_POR_PROVEEDOR = { MASTODON: 0, EMAIL: QUARANTINE_HOURS_EMAIL, PASSKEY: QUARANTINE_HOURS_PASSKEY };

// Función pura (sin req/res) para que rutas que solo cuarentenan una RAMA de
// su lógica —como abrir chat, que ya sabe distinguir "conversación nueva" de
// "recuperar una existente"— puedan preguntar sin pasar por el middleware.
// Un usuario que ya no existe se trata como establecido (fail-open): mismo
// criterio que requireNotSuspended, que en ese caso deja pasar en vez de fallar.
async function estaEstablecida(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, identities: { select: { provider: true } } }
  });
  if (!user || !user.identities.length) return { ok: true };

  // La ventana aplicable es la MÁS CORTA entre las identidades de la cuenta.
  const horas = Math.min(...user.identities.map(i => VENTANA_POR_PROVEEDOR[i.provider]));
  if (horas <= 0) return { ok: true };

  const antiguedadHoras = (Date.now() - new Date(user.createdAt).getTime()) / 3_600_000;
  if (antiguedadHoras >= horas) return { ok: true };

  const disponibleEn = new Date(new Date(user.createdAt).getTime() + horas * 3_600_000);
  return { ok: false, disponibleEn, horas };
}

async function requireEstablished(req, res, next) {
  if (!req.user?.id) return res.status(401).json({ error: 'No autenticado' });
  try {
    const estado = await estaEstablecida(req.user.id);
    if (!estado.ok) {
      return res.status(403).json({
        error: 'Tu cuenta es muy nueva para esta acción. Es una protección de la comunidad, no un castigo.',
        disponibleEn: estado.disponibleEn
      });
    }
    next();
  } catch (e) {
    console.error('Error al verificar la antigüedad de la cuenta:', e);
    res.status(500).json({ error: 'Error al verificar tu cuenta' });
  }
}

module.exports = {
  requireAuth, optionalAuth, requireRole, requireNotSuspended, requireEstablished, estaEstablecida
};
