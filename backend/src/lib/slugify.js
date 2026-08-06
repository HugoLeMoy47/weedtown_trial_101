// slug legible y estable a partir de un nombre (subforos).
//
// Vivía duplicada en forumRoutes.js; se extrae aquí porque scripts/subforos.js
// (HU-FOR-010) necesita exactamente la misma función — dos slugify divergentes
// es un bug con fecha puesta: el mismo nombre produciría slugs distintos según
// quién lo creó.
function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar acentos
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .slice(0, 48);
}

module.exports = { slugify };
