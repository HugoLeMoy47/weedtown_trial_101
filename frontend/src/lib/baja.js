// Baja en un clic (ciclo 22, B25): lo que la página `/baja` saca de la URL.
//
// Función pura y aparte para poder probarla sin la página. El token es el del enlace
// firmado del correo; aquí solo se LEE, no se interpreta: quien lo verifica es el
// servidor. Un token ausente o desmesurado se trata como «sin token» y la página dice
// que el enlace no es válido, sin hacer ninguna petición.
const MAX_TOKEN = 256;

/** @param {string} search p. ej. `window.location.search` → `?token=abc.def` */
export function leerTokenDeBaja(search) {
  const token = new URLSearchParams(search || '').get('token');
  if (!token || token.length > MAX_TOKEN) return null;
  return token;
}
