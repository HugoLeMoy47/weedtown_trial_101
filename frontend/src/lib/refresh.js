// Puente mínimo entre componentes que no son padre-hijo (Navbar y Feed) sin
// meter un gestor de estado global: un evento del DOM que Feed escucha y el
// logo del header dispara. Clic en el logo estando ya en /feed no navega a
// ningún lado (React Router no dispara nada en una ruta que ya es la activa),
// así que sin esto no tenía forma de "hacerlo refrescar".
export const FEED_REFRESH_EVENT = 'weedtown:refresh-feed';

export function requestFeedRefresh() {
  window.dispatchEvent(new Event(FEED_REFRESH_EVENT));
}
