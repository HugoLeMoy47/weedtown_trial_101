// HU-CTA-002 — atribución de altas sin migración, y validación de `next`
// (T5: redirección abierta) compartida con HU-CTA-003.
//
// El CTA agrega `?ref=post(&pid=<id>)` y a veces `&next=<ruta>` a la URL de
// /login. Ese estado tiene que sobrevivir tres flujos de autenticación muy
// distintos:
//   - Mastodon: navegación completa fuera del sitio y de vuelta (el `state`
//     firmado del OAuth vive en authRoutes.js y no se toca aquí).
//   - Enlace mágico por correo: el clic puede pasar en otra pestaña o
//     dispositivo.
//   - Llave de acceso: todo ocurre en la misma carga de /login.
// Guardarlo en localStorage del lado del cliente cubre los tres casos con una
// sola implementación, sin tocar el `state` de Mastodon ni el token del
// enlace mágico — ambos ya en producción y fuera de este ciclo.
import api from '../services/api';
import { esRutaInterna } from './rutaInterna';

const REF_WHITELIST = ['post', 'perfil', 'directo'];
const REF_KEY = 'weedtown_pending_ref';
const NEXT_KEY = 'weedtown_pending_next';

function refValido(ref) {
  return REF_WHITELIST.includes(ref) ? ref : null;
}

function pidValido(pidRaw) {
  if (typeof pidRaw !== 'string' || !/^\d+$/.test(pidRaw)) return null;
  const pid = Number(pidRaw);
  return pid > 0 ? pid : null;
}

// Se llama al aterrizar en /login. Un `ref` no reconocido se descarta en
// silencio (criterio de aceptación 1): no se guarda nada.
export function capturarAtribucion(searchParams) {
  const ref = refValido(searchParams.get('ref'));
  const next = esRutaInterna(searchParams.get('next'));
  if (ref) {
    const pid = pidValido(searchParams.get('pid'));
    try { localStorage.setItem(REF_KEY, JSON.stringify({ ref, pid })); } catch { /* modo privado sin storage */ }
  }
  if (next) {
    try { localStorage.setItem(NEXT_KEY, next); } catch { /* modo privado sin storage */ }
  }
}

// Se llama una sola vez, justo después de un login/alta exitoso, para saber
// a dónde volver. Consume el valor (no se reutiliza en el siguiente login).
export function tomarNextPendiente() {
  let next = null;
  try {
    next = localStorage.getItem(NEXT_KEY);
    localStorage.removeItem(NEXT_KEY);
  } catch { /* modo privado sin storage */ }
  return esRutaInterna(next);
}

// Se llama tras un login/alta exitoso, ya con el token guardado (para que el
// interceptor de axios mande la sesión). Solo manda algo al backend si de
// verdad hubo una atribución pendiente Y el backend indicó que esta sesión
// viene de una cuenta recién creada (`esNueva`) — un login normal no
// registra nada, aunque venga con `?ref=`.
export async function registrarAltaSiCorresponde(esNueva) {
  let raw = null;
  try {
    raw = localStorage.getItem(REF_KEY);
    localStorage.removeItem(REF_KEY);
  } catch { /* modo privado sin storage */ }
  if (!esNueva || !raw) return;
  try {
    const { ref, pid } = JSON.parse(raw);
    await api.post('/auth/attribution', { ref, pid });
  } catch {
    // Puramente observacional: un fallo aquí no debe interrumpir el alta.
  }
}
