import React, { useEffect, useState } from 'react';
import { visuallyHidden } from '@mui/utils';
import { fechaRelativa, fechaCompleta, etiquetaAccesible, aFecha } from '../lib/fechas';

// La etiqueta de fecha de las superficies sociales (ciclo 13E).
//
// UN SOLO TEMPORIZADOR PARA TODA LA PÁGINA, no uno por componente. Con treinta
// posteos en el feed, treinta intervalos son treinta despertares por minuto y
// treinta repintados sueltos — se paga en batería y no se nota hasta que se
// nota. Los componentes se suscriben a este reloj compartido y el intervalo
// solo existe mientras haya alguien escuchando.
const suscriptores = new Set();
let intervalo = null;

function avisar() {
  const ahora = new Date();
  for (const fn of suscriptores) fn(ahora);
}

// Pausa cuando la pestaña no está visible. Un feed abierto en una pestaña de
// fondo no tiene por qué despertar al dispositivo cada minuto; al volver se
// recalcula de inmediato, así que no se ve ni un "hace 2 minutos" viejo.
function alCambiarVisibilidad() {
  if (document.visibilityState === 'visible') {
    avisar();
    arrancar();
  } else {
    detenerIntervalo();
  }
}

function arrancar() {
  if (intervalo || document.visibilityState !== 'visible') return;
  intervalo = setInterval(avisar, 60 * 1000);
}

function detenerIntervalo() {
  if (!intervalo) return;
  clearInterval(intervalo);
  intervalo = null;
}

function suscribir(fn) {
  const primero = suscriptores.size === 0;
  suscriptores.add(fn);
  if (primero) {
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    arrancar();
  }
  return () => {
    suscriptores.delete(fn);
    if (suscriptores.size === 0) {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      detenerIntervalo();
    }
  };
}

// Exportado para la prueba manual del ciclo: `window.__relojFechas()` dice
// cuántos suscriptores hay y si el intervalo está vivo. Sin esto, "hay un solo
// temporizador" es una afirmación que nadie puede comprobar.
if (typeof window !== 'undefined') {
  window.__relojFechas = () => ({ suscriptores: suscriptores.size, intervaloVivo: Boolean(intervalo) });
}

export function useAhora() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => suscribir(setAhora), []);
  return ahora;
}

// El texto visible es relativo; la fecha exacta no se pierde:
//   - `dateTime` en ISO, que es lo que leen las máquinas (ForumPostCard ya lo
//     hacía bien antes de este ciclo; se copió de ahí en vez de inventar otra
//     forma).
//   - `title` para quien pase el cursor.
//   - Y un texto oculto para lectores de pantalla con AMBAS cosas. No se usa
//     `aria-label` sobre el `<time>`: es un elemento sin rol propio, y ahí la
//     etiqueta no se anuncia de forma confiable en todos los lectores. El
//     bloque oculto sí, siempre.
export default function FechaRelativa({ fecha, ahora: ahoraFija, ...props }) {
  const ahoraDelReloj = useAhora();
  const ahora = ahoraFija || ahoraDelReloj;
  // Con `aFecha`, no con `new Date()` directo: ver el comentario de esa
  // función. Un `null` aquí pintaría 1969 en lugar de no pintar nada.
  const d = aFecha(fecha);
  if (!d) return null;

  return (
    <time dateTime={d.toISOString()} title={fechaCompleta(d)} {...props}>
      <span aria-hidden="true">{fechaRelativa(d, ahora)}</span>
      <span style={visuallyHidden}>{etiquetaAccesible(d, ahora)}</span>
    </time>
  );
}
