// Orígenes permitidos para CORS (API y Socket.IO).
// FRONTEND_URL + ALLOWED_ORIGINS (lista separada por comas) — así el dev
// server puede atenderse desde localhost y desde la IP LAN a la vez sin
// abrir el CORS a cualquiera.
const origins = new Set(
  [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000',
    ...(process.env.ALLOWED_ORIGINS || '').split(',')
  ]
    .map(o => o.trim().replace(/\/$/, ''))
    .filter(Boolean)
);

module.exports = { allowedOrigins: [...origins] };
