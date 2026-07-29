// Defensas contra los dos patrones de spam más comunes en contenido de texto
// libre: pegar el mismo mensaje en ráfaga, y saturar un posteo de enlaces.
// Complementa los rate limits por IP/ruta (app.js) y la cuarentena de altas
// nuevas (requireAuth.js) — esos frenan CUÁNTO se puede publicar; esto frena
// QUÉ tan repetitivo o cargado de enlaces es cada publicación individual.
const prisma = require('./prisma');

const MAX_LINKS_PER_CONTENT = 5;
const REPEAT_WINDOW_MIN = 10;

const URL_RE = /https?:\/\/\S+/gi;

function contarEnlaces(texto) {
  return (String(texto || '').match(URL_RE) || []).length;
}

function demasiadosEnlaces(texto) {
  return contarEnlaces(texto) > MAX_LINKS_PER_CONTENT;
}

/**
 * ¿La misma persona publicó este mismo texto, en este mismo modelo, hace
 * menos de REPEAT_WINDOW_MIN minutos? No distingue "de buena fe" de spam —
 * simplemente encarece copiar-pegar el mismo mensaje una y otra vez.
 * @param {import('@prisma/client').Prisma.ModelName} modelo 'post' | 'comment' | 'forumPost' | 'forumComment'
 */
async function esContenidoRepetido(modelo, authorId, content) {
  const desde = new Date(Date.now() - REPEAT_WINDOW_MIN * 60 * 1000);
  const previo = await prisma[modelo].findFirst({
    where: { authorId, content, createdAt: { gte: desde } },
    select: { id: true }
  });
  return Boolean(previo);
}

module.exports = { MAX_LINKS_PER_CONTENT, REPEAT_WINDOW_MIN, contarEnlaces, demasiadosEnlaces, esContenidoRepetido };
