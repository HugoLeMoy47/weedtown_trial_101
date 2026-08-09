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

// ---------- Ficha de PERFIL (HU-SHR-005, ciclo 11B) ----------
//
// Es la superficie MÁS EXTERNA a la red que existe. Un rastreador la pide sin
// sesión, sin cookies y sin ninguna relación con nadie: todo lo que salga aquí
// es público de verdad, para siempre, y con caché de por medio.
//
// LA FICHA GENÉRICA ES UNA CONSTANTE, y eso es el diseño, no una comodidad.
// Se sirve IDÉNTICA en los cuatro casos en que no hay ficha rica —el handle no
// existe, el perfil no es público, la cuenta está suspendida, la cuenta fue
// eliminada—. Si el genérico de "no existe" difiriera en algo del de "existe
// pero es privado", esta ruta sería un verificador de handles para cualquiera
// con un diccionario y tiempo: justo lo que 10A evita respondiendo el mismo
// 401. Aquí no se puede responder 401 —el rastreador necesita algo que
// mostrar—, así que la indistinguibilidad tiene que estar en el CONTENIDO.
//
// Y no menciona el handle. Está decidido en la Ola 3: el handle es
// información. "Un perfil de WeedTown", nunca "el perfil de @fulano" — lo
// segundo confirma que ese handle existe, a cualquiera, sin sesión.
const FICHA_PERFIL_GENERICA = Object.freeze({
  titulo: 'WeedTown',
  descripcion: 'La red social de la comunidad cannábica de México. Un espacio seguro, con respeto y sin estigma.',
  imagen: null, // la resuelve `armarFichaPerfilGenerica` con la URL del frontend
  imagenAlt: 'WeedTown — la red social de la comunidad cannábica de México',
  tieneImagen: false,
  // Lo que el Worker mira para emitir `noindex`. Ver la nota sobre por qué
  // `Disallow` y `noindex` son mutuamente excluyentes en frontend/public/robots.txt.
  indexable: false
});

const DESCRIPCION_PERFIL_SIN_BIO = 'Un perfil de WeedTown, la red social de la comunidad cannábica de México. Únete a la conversación.';
const DESCRIPCION_PERFIL_MAX = 160;

// Siempre la MISMA imagen por defecto, no una de campaña elegida por id: la
// ficha genérica no puede depender de nada del recurso, o dejaría de ser
// idéntica entre "no existe" y "existe pero es privado".
function armarFichaPerfilGenerica() {
  return {
    ...FICHA_PERFIL_GENERICA,
    imagen: `${urlBaseFrontend()}/${IMAGEN_POR_DEFECTO.archivo}`
  };
}

/**
 * Ficha rica de un perfil PÚBLICO. La ruta ya validó que `perfilPublico` esté
 * encendido, que la cuenta no esté suspendida ni eliminada, y ya recortó los
 * campos con `camposVisibles()` — aquí solo se arma el contenido.
 *
 * Lo que puede salir es lo que ya estaba en TODOS, y nada más. La regla de
 * composición del 10B no se reimplementa aquí: llega resuelta.
 *
 * @param {{id:number, handle:string, displayName:string|null, name:string}} user
 * @param {{bio:string|null}} visibles campos ya recortados por camposVisibles()
 */
function armarFichaPerfil(user, visibles) {
  const campania = imagenDeCampania(user.id);
  return {
    // El handle SÍ va aquí: este perfil es público por decisión de su dueña,
    // así que su nombre y su handle son justamente lo que quiso compartir.
    titulo: truncarTitulo(`${user.displayName || user.name} (@${user.handle})`),
    // La bio solo si su dueña la puso en TODOS. En cualquier otro caso, texto
    // fijo: NO se cae a `aboutMe` ni a nada más "para que la tarjeta se vea
    // llena" — eso sería exactamente la fuga que este ciclo tiene que evitar.
    descripcion: truncar(visibles.bio, DESCRIPCION_PERFIL_MAX) || DESCRIPCION_PERFIL_SIN_BIO,
    // Imagen de campaña, no el avatar. El avatar se sirve como SVG dibujado al
    // vuelo, y los rastreadores de WhatsApp, Telegram y X no renderizan SVG en
    // og:image: la tarjeta saldría sin imagen. Poner el avatar exigiría
    // generarlo en PNG, que es otro ciclo.
    imagen: campania.url,
    imagenAlt: campania.alt,
    tieneImagen: false,
    // Perfil público = su dueña pidió que se viera fuera de la red.
    indexable: true
  };
}

module.exports = {
  armarFicha,
  armarFichaSubforo,
  armarFichaPerfil,
  armarFichaPerfilGenerica,
  truncarTitulo,
  DESCRIPCION_INVITACION,
  DESCRIPCION_SUBFORO_SIN_TEXTO,
  DESCRIPCION_PERFIL_SIN_BIO,
  SITE_NAME
};
