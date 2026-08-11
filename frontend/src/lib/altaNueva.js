// La marca de "esta sesión acaba de crear su cuenta" (ciclo 13B).
//
// POR QUÉ EXISTE: 1 de 56 cuentas tiene biografía. La Ola 2 construyó
// visibilidad por dato y la Ola 3 la ficha del perfil y el enlace de
// invitación; las dos operan sobre un perfil vacío, así que ninguna tiene con
// qué funcionar. No falta una función: falta que alguien llene el perfil, y
// nadie entra a un formulario de nueve campos por voluntad propia.
//
// HAY EXACTAMENTE DOS LUGARES que saben que hubo un alta, y los dos tienen
// que marcarla:
//   · `AuthCallback.jsx` — Mastodon y enlace mágico (llegan con ?isNew=1).
//   · `Login.jsx` — llave de acceso (el backend responde `isNew` en el JSON).
// Si algún día aparece un tercer proveedor, este comentario es el lugar donde
// alguien va a descubrir que también le toca.
//
// Se guarda en localStorage y no en el estado de React porque entre el alta y
// la pantalla donde se pregunta hay una navegación completa —y con Mastodon,
// una vuelta por otro sitio. Es el mismo motivo que documenta attribution.js.
const CLAVE = 'weedtown_pedir_bio';

export function marcarAltaNueva(esNueva) {
  if (!esNueva) return;
  try { localStorage.setItem(CLAVE, '1'); } catch { /* modo privado sin storage */ }
}

/**
 * Consume la marca: devuelve true UNA sola vez por alta.
 *
 * Consumir al leer es deliberado. Si la pregunta se pudiera volver a disparar,
 * reaparecería en cada recarga hasta que la persona la contestara — que es
 * exactamente el aviso insistente que este ciclo NO quiere. Se pregunta una
 * vez; quien omita queda como está hoy, y el perfil sigue ahí para cuando
 * quiera.
 */
export function tomarPreguntaPendiente() {
  try {
    const v = localStorage.getItem(CLAVE);
    localStorage.removeItem(CLAVE);
    return v === '1';
  } catch { return false; }
}
