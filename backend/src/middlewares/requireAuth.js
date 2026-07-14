// Middlewares de autenticación por JWT (Authorization: Bearer <token>)
const jwt = require('jsonwebtoken');

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

module.exports = { requireAuth, optionalAuth };
