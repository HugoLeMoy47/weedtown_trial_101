// Geometría del recorte (ciclo 9D). Sin DOM, sin canvas, sin React: solo
// rectángulos.
//
// POR QUÉ VIVE APARTE. Todo lo que toca `<canvas>` es imposible de probar en
// jsdom (no hay contexto 2d ni `toBlob`), así que si esta aritmética viviera
// dentro del componente no habría forma de probarla — y es justo la parte que
// falla en silencio: un recorte que se sale del lienzo por medio píxel, un
// tirador que puede cruzar al otro lado y voltear el rectángulo, una rotación
// que pierde el encuadre que la persona ya había ajustado. El componente pone
// los píxeles; esto decide dónde van.
//
// COORDENADAS NORMALIZADAS (0..1), siempre, relativas a la imagen de trabajo.
// Es lo que hace que la misma caja sirva para el `<canvas>` en pantalla (que
// se escala con CSS a lo que quepa), para el recorte real en píxeles y para
// la rotación — sin arrastrar factores de escala ni densidad de pantalla por
// todos lados.

export const RECORTE_COMPLETO = { x: 0, y: 0, w: 1, h: 1 };

// Lado mínimo del recorte. No es capricho estético: con los tiradores hechos
// para el dedo (44 px de área táctil), un recorte más chico que esto deja las
// cuatro esquinas encimadas y ya no se puede agarrar ninguna.
export const LADO_MINIMO = 0.08;

const ESQUINAS = {
  no: { oeste: true, norte: true },
  ne: { este: true, norte: true },
  so: { oeste: true, sur: true },
  se: { este: true, sur: true }
};

export const NOMBRES_ESQUINA = Object.keys(ESQUINAS);

const entre = (v, min, max) => Math.min(Math.max(v, min), max);

/**
 * Gira el recorte 90° en el MISMO sentido en que gira la imagen (horario).
 *
 * Sin esto habría que descartar el encuadre en cada rotación, y quien recortó
 * primero y giró después perdería su trabajo. La imagen pasa de W×H a H×W, así
 * que ancho y alto del recorte se intercambian y el origen se recalcula contra
 * el borde que cambió de lado.
 *
 * Cuatro rotaciones devuelven exactamente el rectángulo original — hay una
 * prueba de eso, porque es la forma más barata de detectar un signo invertido.
 */
export function rotarRecorte90({ x, y, w, h }) {
  return { x: 1 - y - h, y: x, w: h, h: w };
}

/** Arrastrar la caja completa: cambia de posición, nunca de tamaño. */
export function moverRecorte(base, dx, dy) {
  return {
    w: base.w,
    h: base.h,
    x: entre(base.x + dx, 0, 1 - base.w),
    y: entre(base.y + dy, 0, 1 - base.h)
  };
}

/**
 * Arrastrar una esquina: mueve los dos bordes que le tocan y deja quietos los
 * otros dos.
 *
 * Se razona con BORDES (izq/der/arr/aba) y no con x/y/w/h a propósito: con
 * ancho y alto hay que tratar aparte el caso de arrastrar hacia la izquierda
 * (donde x cambia y w también), y ahí es donde se cuelan los anchos negativos.
 * Con bordes, sujetar cada uno a su rango es todo lo que hace falta.
 */
export function redimensionarRecorte(base, esquina, dx, dy) {
  const lados = ESQUINAS[esquina];
  if (!lados) return base;

  let izq = lados.oeste ? base.x + dx : base.x;
  let der = lados.este ? base.x + base.w + dx : base.x + base.w;
  let arr = lados.norte ? base.y + dy : base.y;
  let aba = lados.sur ? base.y + base.h + dy : base.y + base.h;

  // Primero dentro del lienzo, después el lado mínimo. El orden importa: al
  // revés, un tirador arrastrado más allá del borde se quedaría pegado ahí y
  // el rectángulo se encogería por debajo del mínimo.
  izq = entre(izq, 0, 1 - LADO_MINIMO);
  der = entre(der, LADO_MINIMO, 1);
  arr = entre(arr, 0, 1 - LADO_MINIMO);
  aba = entre(aba, LADO_MINIMO, 1);

  if (lados.oeste) izq = Math.min(izq, der - LADO_MINIMO); else der = Math.max(der, izq + LADO_MINIMO);
  if (lados.norte) arr = Math.min(arr, aba - LADO_MINIMO); else aba = Math.max(aba, arr + LADO_MINIMO);

  return { x: izq, y: arr, w: der - izq, h: aba - arr };
}

/** ¿Se recortó algo, o la caja sigue cubriendo la imagen entera? */
export function recorteEsCompleto({ x, y, w, h }, tolerancia = 0.001) {
  return x <= tolerancia && y <= tolerancia && w >= 1 - tolerancia && h >= 1 - tolerancia;
}
