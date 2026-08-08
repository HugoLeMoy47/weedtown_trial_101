// Armado de la ficha de previsualización (Open Graph) de un posteo público
// (HU-SHR-001/003, ciclo 7B). Vive aparte de postRoutes.js por el mismo
// criterio que moderation.js, indicadores.js, friends.js y blocks.js: la
// ruta valida sesión/existencia/caché y responde, esto arma el contenido.
//
// Regla que gobierna todo este archivo: la ficha es contenido público
// servido a un cliente ANÓNIMO que no obedece a nadie (el rastreador de
// WhatsApp/Telegram/X). Todo lo que entra aquí entra al mundo y no se puede
// recoger — por eso `handleAutor` es siempre `User.handle` y nunca `name`,
// `id`, correo ni instancia de Mastodon.
const { ENTRADAS, IMAGEN_POR_DEFECTO } = require('./campaignManifest');

const TITULO_MAX = 70;

// Ciclo 9A: la descripción de un subforo SÍ es texto propio (a diferencia de
// la de un posteo, ver D8 abajo) — es institucional y ya es pública en el
// directorio abierto. 160 caracteres porque es donde las redes cortan la
// descripción de la tarjeta; el campo admite hasta 300 (MAX_DESCRIPTION_LENGTH
// en forumRoutes.js), así que el corte es real y no teórico.
const DESCRIPCION_SUBFORO_MAX = 160;

// D8 (plan del ciclo): la descripción es una invitación a la red, no más
// contenido del posteo — el título ya adelantó de qué se trata. Es fija a
// propósito: no se arma con datos del posteo, así que no hay nada nuevo que
// fugue.
const DESCRIPCION_INVITACION = 'Se comparte en WeedTown, la red social de la comunidad cannábica de México. Únete para ver la conversación completa.';

// La misma idea para un subforo SIN descripción (el campo es opcional): sin
// esto la tarjeta saldría con `og:description` vacío, que varias redes
// muestran como un hueco en vez de omitirlo.
const DESCRIPCION_SUBFORO_SIN_TEXTO = 'Un subforo de WeedTown, la red social de la comunidad cannábica de México. Únete a la conversación.';

const SITE_NAME = 'WeedTown';

// Colapsa saltos de línea y espacios repetidos: el contenido de un posteo
// puede traer varios "\n" seguidos, y en una sola línea de ficha se leerían
// como huecos.
function colapsarEspacios(texto) {
  return texto.replace(/\s+/g, ' ').trim();
}

// HU-SEC-001 (ciclo 7D): este endpoint devuelve JSON — el carácter `"` es
// `"`, no `&quot;`. NO escapa HTML. El escapado se hace una sola vez, en
// `frontend/src/worker.js`, que es quien de verdad emite HTML — es el único
// punto de salida y el único lugar donde tiene sentido decidir cómo se
// neutraliza cada valor. Escapar aquí TAMBIÉN fue el diseño original del
// ciclo 7B, y mordió en la práctica: un backend en Render y un Worker en
// Cloudflare se despliegan por separado, unidos por un contrato ("preview.js
// ya escapa, worker.js no debe volver a hacerlo") que solo vivía en un
// comentario. El día que alguien limpie el escapado de un lado sin saber del
// otro, o lo agregue de los dos, el resultado es HTML crudo inyectado o un
// doble escapado visible — ninguno de los dos con una prueba que lo agarre
// en ESTE archivo, porque ESTE archivo no es quien emite HTML.
//
// Corte en palabra completa. Extraído de `truncarTitulo` en el ciclo 9A
// porque la descripción de un subforo necesita EXACTAMENTE la misma regla con
// otro tope — no es una generalización especulativa, es el segundo llamador
// real llegando.
function truncar(texto, max) {
  const limpio = colapsarEspacios(texto || '');
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max);
  const ultimoEspacio = corte.lastIndexOf(' ');
  const cortado = ultimoEspacio > 0 ? corte.slice(0, ultimoEspacio) : corte;
  return `${cortado}…`;
}

// Extracto a ~70 caracteres cortado en palabra completa (D8): es la línea en
// negritas que decide si alguien toca el enlace.
function truncarTitulo(contenido) {
  return truncar(contenido, TITULO_MAX);
}

function urlBaseFrontend() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

// Selección DETERMINISTA por id (T6 del plan): nunca aleatoria. Las redes
// cachean la ficha por URL durante días o semanas — sortear en cada petición
// no rota nada, solo hace que el mismo enlace se vea distinto según quién lo
// expandió primero y vuelve irreproducible cualquier reporte de "se ve mal".
// La rotación real se hace editando el manifiesto.
//
// `semilla` es el id del posteo o el del subforo (ciclo 9A): son secuencias
// distintas, y eso está bien — lo único que importa es que el MISMO recurso
// caiga siempre en la misma pieza, no que dos recursos distintos no coincidan.
function imagenDeCampania(semilla) {
  const activos = ENTRADAS.filter(e => e.activo);
  const elegido = activos.length ? activos[semilla % activos.length] : IMAGEN_POR_DEFECTO;
  return { url: `${urlBaseFrontend()}/${elegido.archivo}`, alt: elegido.alt };
}

/**
 * Arma la ficha a partir de un post ya validado (PUBLIC, sin hiddenAt, autor
 * no suspendido — esos filtros viven en la ruta, no aquí).
 * @param {{id:number, content:string, image:string|null, author:{handle:string}}} post
 */
function armarFicha(post) {
  const tieneImagen = Boolean(post.image);
  const campania = tieneImagen ? null : imagenDeCampania(post.id);
  return {
    titulo: truncarTitulo(post.content),
    descripcion: DESCRIPCION_INVITACION,
    // Imagen propia del posteo: `postRoutes.js` ya valida al crear/editar que
    // `image` sea una URL http(s) absoluta (IMAGE_URL_RE), así que no hace
    // falta reconstruirla aquí — solo pasa de largo.
    imagen: tieneImagen ? post.image : campania.url,
    // No forma parte de los 4 campos originales de HU-SHR-001, pero
    // HU-SHR-003 exige que el `alt` del manifiesto llegue hasta
    // `og:image:alt` (criterio 3) — y sin este campo el Worker no tiene de
    // dónde tomarlo. Para imagen propia no hay alt de manifiesto: se deja
    // sin imagenAlt (el Worker cae a un alt genérico).
    imagenAlt: tieneImagen ? null : campania.alt,
    handleAutor: post.author.handle,
    tieneImagen
  };
}

/**
 * Arma la ficha de un SUBFORO ya validado (no archivado — ese filtro vive en
 * la ruta, no aquí), ciclo 9A.
 *
 * Dos funciones claras en vez de una `armarFicha(tipo, entidad)` con ramas
 * adentro: comparten el corte de texto y la imagen de campaña (arriba), pero
 * NO comparten qué campos existen ni cuáles pueden salir, que es justamente
 * lo que hay que poder leer de un vistazo en un archivo cuya regla es "todo lo
 * que entra aquí entra al mundo".
 *
 * Lo que NO lleva, y es la mitad del punto de esta función:
 *  - `creator` en ninguna forma (HU-FOR-012, ciclo 7C). Este endpoint es
 *    abierto; el nombre de quien creó el subforo no sale sin sesión, y aquí no
 *    hay `req` que consultar, así que ni siquiera existe la tentación.
 *  - `_count` de posts/seguidores: el directorio los expone, pero una ficha se
 *    cachea 24h en el Worker y días en las redes — un número congelado ahí es
 *    peor que no ponerlo.
 *
 * @param {{id:number, name:string, description:string|null}} subforum
 */
function armarFichaSubforo(subforum) {
  const campania = imagenDeCampania(subforum.id);
  return {
    titulo: truncarTitulo(subforum.name),
    // A diferencia del posteo, aquí la descripción SÍ es del recurso: es texto
    // institucional que el directorio abierto ya muestra a cualquiera.
    descripcion: truncar(subforum.description, DESCRIPCION_SUBFORO_MAX) || DESCRIPCION_SUBFORO_SIN_TEXTO,
    // Siempre imagen de campaña: no hay imagen propia por subforo (fuera de
    // alcance del 9A). `tieneImagen: false` no es relleno — es lo que le dice
    // al Worker que puede declarar og:image:width/height 1200×630 con
    // confianza (ver construirMetaTags en frontend/src/worker.js).
    imagen: campania.url,
    imagenAlt: campania.alt,
    tieneImagen: false
  };
}

module.exports = {
  armarFicha,
  armarFichaSubforo,
  truncarTitulo,
  DESCRIPCION_INVITACION,
  DESCRIPCION_SUBFORO_SIN_TEXTO,
  SITE_NAME
};
