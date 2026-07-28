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

// Exige sesión válida
function requireAuth(req, res, next) {
  const payload = getTokenPayload(req);
  if (!payload) return res.status(401).json({ error: 'No autenticado' });
  req.user = { id: payload.userId };
  next();
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

module.exports = { requireAuth, optionalAuth, requireRole, requireNotSuspended };
