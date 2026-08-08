// Diccionario de descarte de hashtags (ciclo 9C).
//
// QUÉ HACE Y QUÉ NO. Esto NO es censura y no debe confundirse con
// `moderation.js` ni con `antiSpam.js`: el texto del posteo no se toca jamás.
// Si alguien escribe "#de", su posteo sigue diciendo exactamente lo que
// escribió — lo único que pasa es que esa palabra no entra al ÍNDICE de
// hashtags. La diferencia importa porque el índice es lo que en la Ola 2 va a
// alimentar agrupación y tendencias, y una nube de tendencias encabezada por
// "de" y "para" no dice nada de la comunidad.
//
// DE DÓNDE SALE LA LISTA (ciclo 10D). En el 9C estaba cableada aquí y el
// comentario decía que el ciclo siguiente "solo cambiaría de dónde sale la
// lista, sin tocar postRoutes.js". Eso es exactamente lo que pasó: ahora vive
// en la tabla `PalabraDescartada`, gestionable desde /admin, y `seDescarta`
// sigue teniendo la misma firma síncrona.
//
// Se mantiene síncrona con una CACHÉ en memoria, no por optimizar: `seDescarta`
// se llama al publicar y al editar, y volverla asíncrona obligaría a tocar
// postRoutes en varios puntos para resolver una lista de cuarenta palabras que
// cambia una vez al mes. La caché se recarga al escribir y, si se quedó vieja,
// se refresca sola en segundo plano.
//
// LÍMITE CONOCIDO: con más de una instancia del backend, un cambio hecho en una
// tarda hasta TTL_MS en verse en las otras. Hoy Render corre una sola, y el TTL
// existe justo para que ese día no sea un bug silencioso.
//
// Las listas de abajo dejan de ser la fuente de verdad y pasan a ser la
// SEMILLA con que se pobló la tabla; se conservan para poder reconstruirla.
//
// La lista vive separada de postRoutes.js por el mismo criterio que
// moderation.js, blocks.js o campaignManifest.js: los datos y la regla en un
// lado, la orquestación de la ruta en otro.

// Preposiciones — dictadas por el PO, tal cual, sin agregar ni quitar.
const PREPOSICIONES = [
  'a', 'ante', 'bajo', 'cabe', 'con', 'contra', 'de', 'desde', 'en', 'entre',
  'hacia', 'hasta', 'para', 'por', 'según', 'sin', 'so', 'sobre', 'tras'
];

// Artículos y conjunciones — los que el prompt del ciclo listó como "obvias".
const ARTICULOS_Y_CONJUNCIONES = [
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'y', 'e', 'o', 'u', 'que'
];

// AGREGADOS POR MÍ, para que el PO los revise (van aparte a propósito, no
// mezclados con los de arriba). Cada uno cae en una categoría que las listas
// de arriba ya abrieron; ninguno amplía el criterio:
//   lo   — el artículo neutro. Están el/la/los/las y falta este; es la misma
//          categoría, no una nueva.
//   al   — contracción de "a" + "el". Las dos partes ya están en las listas.
//   del  — contracción de "de" + "el". Igual que "al".
//   ni   — la conjunción negativa que hace juego con "y"/"o", que ya están.
// Si el PO quiere cualquiera de estos de vuelta como hashtag legítimo, se
// borra la línea y ya — por eso están en su propio arreglo.
const AGREGADOS_PARA_REVISION = ['lo', 'al', 'del', 'ni'];

// La comparación ignora acentos; lo GUARDADO nunca se toca.
//
// Sin esto, "según" quedaría fuera del índice pero "#segun" —que es como la
// va a escribir la mayoría en el celular— entraría igual, y el diccionario
// tendría un agujero justo en la única palabra acentuada que dictó el PO.
// Ojo con la asimetría deliberada: esto solo normaliza el valor que se
// COMPARA contra la lista. Ni la llave del hashtag (`tag`) ni su grafía
// (`displayTag`) pasan por aquí — "#Diseño" se guarda con su ñ intacta.
function normalizar(palabra) {
  return String(palabra)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// La semilla con que se pobló la tabla en la migración del 10D.
const SEMILLA = [...PREPOSICIONES, ...ARTICULOS_Y_CONJUNCIONES, ...AGREGADOS_PARA_REVISION].map(normalizar);

const TTL_MS = 60 * 1000;
// Arranca con la semilla y no vacía: si la primera consulta a la base tardara o
// fallara, el comportamiento es el del 9C, nunca "no descartar nada". Fallar
// hacia el lado que ya existía es preferible a fallar hacia el índice sucio.
let cache = new Set(SEMILLA);
let cargadaEn = 0;
let cargando = null;

/** Relee la tabla. Se llama al arrancar y después de cada cambio en /admin. */
async function recargar() {
  const prisma = require('./prisma');
  const filas = await prisma.palabraDescartada.findMany({ select: { palabra: true } });
  cache = new Set(filas.map(f => normalizar(f.palabra)));
  cargadaEn = Date.now();
  return cache;
}

// Refresco perezoso: si la caché se pasó del TTL, se dispara una recarga en
// segundo plano y la llamada en curso responde con lo que hay. Nunca bloquea
// una publicación por leer el diccionario.
function refrescarSiHaceFalta() {
  if (Date.now() - cargadaEn < TTL_MS || cargando) return;
  cargando = recargar()
    .catch(e => console.error('No se pudo recargar el diccionario de descarte:', e.message))
    .finally(() => { cargando = null; });
}

/**
 * ¿Este hashtag se descarta del índice?
 * @param {string} tag La llave del hashtag (ya en minúsculas), sin el "#".
 * @returns {boolean} true si NO debe indexarse.
 */
function seDescarta(tag) {
  refrescarSiHaceFalta();
  return cache.has(normalizar(tag));
}

/** Solo para pruebas y para el arranque: fuerza la lectura y espera. */
const listaActual = () => [...cache];

module.exports = {
  seDescarta,
  recargar,
  listaActual,
  normalizar,
  SEMILLA,
  PREPOSICIONES,
  ARTICULOS_Y_CONJUNCIONES,
  AGREGADOS_PARA_REVISION
};
