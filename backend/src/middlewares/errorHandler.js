// Middleware de manejo de errores.
// El detalle completo se registra en el servidor; al cliente solo llega un
// mensaje seguro: los errores internos (Prisma, stack, fetch) nunca se exponen.
function errorHandler(err, req, res, next) {
  console.error(err);

  // Payload JSON más grande que el límite configurado
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El contenido enviado es demasiado grande' });
  }
  // JSON malformado en el body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido en la petición' });
  }

  // Solo los errores con status explícito (lanzados a propósito) exponen su mensaje
  const status = err.status || err.statusCode || 500;
  const message = status < 500 && err.message ? err.message : 'Error interno del servidor';
  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
