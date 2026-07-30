// Geometría compartida de la barra de navegación móvil, variante C (ciclo 3):
// barra flotante y FAB como dos piezas separadas en la misma fila. Viven acá
// y no repetidas en cada archivo para que Navbar.jsx (la barra) y
// Feed.jsx/Subforum.jsx (el FAB, que es un componente aparte y no un hijo de
// Navbar) queden pixel-alineados sin coordinarse en cada cambio.
export const BAR_HEIGHT_PX = 56;
export const DOCK_SIDE_MARGIN_PX = 10;
export const DOCK_GAP_PX = 9;
export const DOCK_BOTTOM_GAP_PX = 10; // separación entre la barra y el borde inferior, antes del área segura

// Offset desde el borde inferior real del viewport hasta donde arranca la
// barra — el mismo valor sirve para el `bottom` de la barra y el del FAB.
export const DOCK_BOTTOM_OFFSET = `calc(${DOCK_BOTTOM_GAP_PX}px + env(safe-area-inset-bottom, 0px))`;

// Alto total que la barra le quita al contenido (con un pequeño respiro extra
// de 8px): lo usa el padding-bottom global en Navbar.jsx para que ninguna
// página deje su último elemento tapado — resuelto una sola vez ahí, no
// página por página.
export const BOTTOM_DOCK_RESERVED_HEIGHT =
  `calc(${BAR_HEIGHT_PX}px + ${DOCK_BOTTOM_GAP_PX}px + env(safe-area-inset-bottom, 0px) + 8px)`;

// Puente mínimo entre Chat.jsx y Navbar.jsx (no son padre-hijo) — mismo
// patrón que ya usa refresh.js: un evento del DOM en vez de un gestor de
// estado global, para un caso puntual. En móvil, con una conversación
// abierta, la barra tiene que replegarse (Tarea 3): fijarla encima del
// compositor con el teclado abierto es exactamente el bug de iOS que el plan
// pide esquivar. La decisión Q4 mantiene "elegir conversación" como estado
// interno de Chat.jsx, no una ruta — por eso esto tampoco es una ruta.
export const CHAT_ABIERTO_EVENT = 'weedtown:chat-abierto';

export function avisarChatAbierto(abierto) {
  window.dispatchEvent(new CustomEvent(CHAT_ABIERTO_EVENT, { detail: { abierto: Boolean(abierto) } }));
}
