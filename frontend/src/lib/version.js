// Versión visible (ciclo 19B): qué está publicado, a simple vista.
//
// Las tres constantes las fija Vite al compilar (ver `define` en
// vite.config.mjs). Se leen con `typeof` para que un entorno que no pase por
// Vite —una prueba, una herramienta— no truene con un ReferenceError: ahí
// simplemente dice «dev».
/* global __WT_CICLO__, __WT_COMMIT__, __WT_CONSTRUIDO_EN__ */
export const VERSION = Object.freeze({
  ciclo: typeof __WT_CICLO__ !== 'undefined' ? __WT_CICLO__ : 'dev',
  commit: typeof __WT_COMMIT__ !== 'undefined' ? __WT_COMMIT__ : 'dev',
  construidoEn: typeof __WT_CONSTRUIDO_EN__ !== 'undefined' ? __WT_CONSTRUIDO_EN__ : null
});

const ESPERADO_COMMIT = /^[0-9a-f]{7}$/;

/** Fecha corta 'YYYY-MM-DD' de un ISO, o null si no es una fecha. */
export function fechaCorta(iso) {
  const m = /^(\d{4}-\d{2}-\d{2})T/.exec(iso || '');
  return m ? m[1] : null;
}

/** Un commit se muestra tal cual solo si tiene la forma de uno; si no, 'dev'. */
function commitMostrable(commit) {
  return ESPERADO_COMMIT.test(commit || '') ? commit : null;
}

/**
 * La línea del pie: «ciclo 18 · 5b7c9be · 2026-10-20».
 * Lo que falta se omite en vez de mostrar «undefined» o «null».
 */
export function etiquetaDeVersion(v = VERSION) {
  const partes = [];
  if (v.ciclo && v.ciclo !== 'desconocido') partes.push(v.ciclo === 'dev' ? 'dev' : `ciclo ${v.ciclo}`);
  const commit = commitMostrable(v.commit);
  if (commit) partes.push(commit);
  const fecha = fechaCorta(v.construidoEn);
  if (fecha) partes.push(fecha);
  return partes.length ? partes.join(' · ') : 'versión desconocida';
}

/**
 * Lo que dice /health del backend, en una línea. `null` si no hay commit
 * (fuera de Render no se inventa uno).
 */
export function etiquetaDeApi(health) {
  const commit = commitMostrable(health?.commit);
  const fecha = fechaCorta(health?.iniciadoEn);
  if (!commit && !fecha) return null;
  return ['api', commit, fecha && `activa desde ${fecha}`].filter(Boolean).join(' · ');
}
