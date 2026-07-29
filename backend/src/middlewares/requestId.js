// Id de correlación por request: une los eventos de logger.js con la línea
// de morgan de esa misma petición, y viaja de vuelta en X-Request-Id para
// poder pegarlo en un reporte de bug.
const crypto = require('crypto');

function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

module.exports = { requestId };
