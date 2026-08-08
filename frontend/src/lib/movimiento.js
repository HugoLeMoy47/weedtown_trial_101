// Capa base de animación (ciclo 9E).
//
// `prefers-reduced-motion` NO ES UNA PREFERENCIA ESTÉTICA. Para quien tiene
// vértigo, migraña vestibular o trastornos del oído interno, una animación
// puede provocar un síntoma físico real. Por eso el respeto a esa preferencia
// no vive en cada componente que se acuerde de consultarla, sino en DOS capas
// que se cubren una a la otra:
//
//   1. Este hook, para lo que se decide en JavaScript (si se anima o si se
//      pinta el estado final de una vez).
//   2. Un interruptor global en `theme.js` que neutraliza CUALQUIER
//      transición o animación CSS de toda la app — incluidas las que trae MUI
//      por su cuenta y las que alguien agregue mañana sin leer esto.
//
// La capa 2 es la que de verdad protege: la 1 se puede olvidar, la 2 no.

import { useMediaQuery } from '@mui/material';

/**
 * ¿La persona pidió menos movimiento en su sistema operativo?
 *
 * `noSsr: true` porque el valor tiene que ser correcto EN EL PRIMER RENDER: si
 * arrancara en `false` y se corrigiera después, el primer fotograma ya habría
 * mostrado el movimiento que justamente se pidió no ver.
 */
export function usePrefiereMenosMovimiento() {
  return useMediaQuery('(prefers-reduced-motion: reduce)', { noSsr: true });
}

// Duraciones, en un solo lugar. Cortas a propósito: son micro-respuestas, no
// escenas. Arriba de ~300 ms una animación de interfaz deja de leerse como
// respuesta a lo que hiciste y empieza a leerse como espera.
export const DURACION = {
  pulso: 220,   // el "sí, te oí" de una reacción
  entrada: 260  // algo nuevo que aparece en una lista
};
