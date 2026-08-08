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
// HARDCODEADO A PROPÓSITO en este ciclo. La gestión desde /admin es Ola 2
// (ciclo 7b); montarla aquí sería construir dos veces la misma pantalla. Lo
// que sí queda listo es la FORMA: una lista y una función, para que ese ciclo
// solo cambie de dónde sale la lista y no tenga que tocar `postRoutes.js`.
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

const DESCARTADAS = new Set(
  [...PREPOSICIONES, ...ARTICULOS_Y_CONJUNCIONES, ...AGREGADOS_PARA_REVISION].map(normalizar)
);

/**
 * ¿Este hashtag se descarta del índice?
 * @param {string} tag La llave del hashtag (ya en minúsculas), sin el "#".
 * @returns {boolean} true si NO debe indexarse.
 */
function seDescarta(tag) {
  return DESCARTADAS.has(normalizar(tag));
}

module.exports = {
  seDescarta,
  PREPOSICIONES,
  ARTICULOS_Y_CONJUNCIONES,
  AGREGADOS_PARA_REVISION
};
