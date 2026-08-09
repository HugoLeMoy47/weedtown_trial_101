// Compartir un enlace, con los tres respaldos que hacen falta de verdad.
//
// Se extrajo de PostCard.jsx en el ciclo 11A al aparecer el segundo llamador
// (el enlace de invitación del perfil). No es una generalización especulativa:
// son los mismos tres pasos, y tenerlos dos veces garantiza que se separen.
//
// Por qué tres y no uno:
//   1. `navigator.share` — el menú nativo del sistema. Es lo que se quiere en
//      móvil, donde compartir significa "mándalo por WhatsApp".
//   2. El portapapeles — en escritorio no hay menú nativo. Exige contexto
//      seguro (https o localhost); en una IP de LAN no existe.
//   3. `window.prompt` — feo, pero funciona en todos lados. Sin él, en LAN o
//      en un navegador viejo el botón no haría absolutamente nada, que es la
//      peor de las opciones.

/**
 * @returns {string} mensaje para mostrarle a la persona, o '' si no hay nada
 *                   que decir (el menú nativo ya dio su propia señal).
 */
export async function compartirEnlace({ titulo, texto, url }) {
  try {
    if (navigator.share) {
      await navigator.share({ title: titulo, text: texto, url });
      return 'Compartido.';
    }
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
      return 'Enlace copiado al portapapeles.';
    }
  } catch {
    // Cancelar el menú nativo también cae aquí, y no es un error: se sigue al
    // respaldo, que en el peor caso muestra el enlace para copiarlo a mano.
  }
  window.prompt('Copia este enlace para compartirlo:', url);
  return '';
}
