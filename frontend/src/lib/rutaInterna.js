// Validación de `next` como ruta interna (Trampa 5: redirección abierta).
//
// Vive separada de attribution.js a propósito: es lógica pura, sin ninguna
// dependencia de red, así que Login.jsx, AuthCallback.jsx y las pruebas la
// importan sin arrastrar a api.js (y por tanto a axios) con ella.
//
// `next` es el destino después del login. Si aceptara una URL completa,
// `/login?next=https://sitio-malo` convertiría a WeedTown en trampolín de
// phishing, y el enlace se vería legítimo porque lo es. Válida como ruta
// interna: empieza con "/", no empieza con "//", sin backslash y sin esquema
// antes de la primera barra (cubre "https://…", "javascript:…", etc.).
export function esRutaInterna(next) {
  if (typeof next !== 'string' || !next) return null;
  if (!next.startsWith('/')) return null;
  if (next.startsWith('//')) return null;
  if (next.includes('\\')) return null;
  const antesDeLaPrimeraBarra = next.slice(1).split('/')[0];
  if (antesDeLaPrimeraBarra.includes(':')) return null;
  return next;
}
