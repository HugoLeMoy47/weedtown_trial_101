// Logging estructurado (una línea JSON por evento) para lo que sí conviene
// poder auditar o alertar sobre: autenticación, moderación, bloqueos,
// reportes, eliminación de cuenta, eventos de seguridad. No sustituye a
// morgan —eso sigue dando la traza legible de cada request en dev— esto es
// para poder grepear o mandar a un colector externo por máquina.
//
// Nunca se registra contenido de posts/mensajes, tokens ni PII completa: solo
// ids y lo mínimo para reconstruir qué pasó.
function log(evento, datos = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), evento, ...datos }));
}

module.exports = { log };
