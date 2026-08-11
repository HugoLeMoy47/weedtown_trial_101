// El mapa de tablas del respaldo: orden, dependencias y grupos.
//
// Vive aparte porque lo usan DOS consumidores —`respaldo.js` y la GUI de
// `respaldo-gui.js`— y una segunda copia sería una copia que envejece sola. La
// GUI valida la selección mientras la armas para dar respuesta inmediata; el
// script la vuelve a validar antes de conectar. Que las dos validaciones digan
// lo mismo depende de que lean esta lista, no una cada una la suya.
//
// La GUI no reimplementa el respaldo: lanza `respaldo.js` como proceso hijo,
// así que todas las guardias (base equivocada, parcial de producción, destino
// dentro del repo) se aplican igual desde la terminal y desde el navegador.

// Cada modelo con las tablas de las que DEPENDE por llave foránea obligatoria.
// Sacado del esquema, no de memoria: `grep '@relation.*fields:'` sobre
// schema.prisma, separando los campos opcionales (`Post?`) de los obligatorios.
//
// Las opcionales no se listan a propósito. Una `Reaction` apunta a Post O a
// Comment O a ForumPost, nunca a todos, así que tratarlas como dependencias
// duras obligaría a incluir el esquema entero en cualquier selección — y el
// respaldo selectivo dejaría de existir. El precio es que un subconjunto puede
// traer filas con una FK opcional colgando; `restaurar.js` las tolera porque
// la columna acepta null.
const DEPENDE_DE = {
  User: [], MagicLink: [], MastodonApp: [], Hashtag: [], Chat: [],
  Identity: ['User'],
  Passkey: ['Identity'],
  Block: ['User'],
  FriendRequest: ['User'],
  Post: ['User'],
  PalabraDescartada: [],
  HashtagOnPost: ['Post', 'Hashtag'],
  Comment: ['Post', 'User'],
  Reaction: ['User'],
  Message: ['Chat', 'User'],
  SubForum: ['User'],
  SubForumFollow: ['User', 'SubForum'],
  ForumPost: ['User', 'SubForum'],
  ForumComment: ['User', 'ForumPost'],
  Report: ['User'],
  ModerationAction: ['User'],
  Notification: ['User'],
  MarketItem: ['User'],
  PrivacyAction: ['User'],
  Media: [],
  // Sin dependencias: no apunta a nadie, y ésa es exactamente la propiedad que
  // la hace admisible (ciclo 13A). Un conteo diario de intentos de atribución,
  // sin identidades.
  ConteoAtribucion: []
};

// Orden de exportación = orden de restauración. Las tablas sin llaves foráneas
// primero, y cada una después de aquellas a las que apunta. Restaurar en otro
// orden falla por violación de FK, así que el orden vive aquí y no en la
// cabeza de quien restaure a las 3 de la mañana.
//
// EL ORDEN RESPETA TODAS LAS LLAVES FORÁNEAS, no solo las obligatorias de
// DEPENDE_DE. Es una distinción que costó una restauración fallida el
// 2026-08-11, la primera vez que se probó con un archivo real de producción:
// `Reaction` estaba antes que `ForumPost` porque su FK hacia el foro es
// OPCIONAL y por lo tanto no aparece en DEPENDE_DE. Pero opcional significa
// "puede ser null", no "no hay filas que la usen" — y había 80 reacciones,
// algunas de posts del foro. Postgres rechazó la inserción entera.
//
// Las dos listas responden preguntas distintas y por eso no se pueden fundir:
// DEPENDE_DE dice qué hace falta para que un RECORTE tenga sentido; este orden
// dice en qué secuencia se puede insertar TODO. `respaldoTablas.test.js` valida
// esta segunda propiedad contra el esquema, que es la única fuente que conoce
// también las relaciones opcionales.
const MODELOS = [
  'User', 'Identity', 'Passkey', 'MagicLink', 'MastodonApp',
  'Block', 'FriendRequest',
  'SubForum', 'SubForumFollow',
  'Post', 'Hashtag', 'HashtagOnPost', 'PalabraDescartada',
  'Comment',
  'ForumPost', 'ForumComment',
  // Después del foro: una reacción puede apuntar a un post del feed, a un
  // comentario, a un post del foro o a un comentario del foro.
  'Reaction',
  'Chat', 'Message',
  'Report', 'ModerationAction', 'Notification',
  'MarketItem', 'PrivacyAction', 'Media',
  'ConteoAtribucion'
];

// Grupos con nombre, para no tener que acordarse de qué tablas componen una
// idea. Son los recortes que de verdad se piden, no una taxonomía completa.
const GRUPOS = {
  cuentas: ['User', 'Identity', 'Passkey', 'MagicLink'],
  feed: ['Post', 'Hashtag', 'HashtagOnPost', 'Comment', 'Reaction', 'Media'],
  foros: ['SubForum', 'SubForumFollow', 'ForumPost', 'ForumComment'],
  social: ['Block', 'FriendRequest', 'Notification'],
  chats: ['Chat', 'Message'],
  moderacion: ['Report', 'ModerationAction', 'PalabraDescartada', 'PrivacyAction'],
  // Métricas de la red que no cuelgan de ninguna cuenta. Grupo propio para que
  // un recorte de "cuentas" o "feed" no las arrastre sin querer, y para poder
  // pedirlas solas.
  metricas: ['ConteoAtribucion']
};

/** Resuelve una lista de nombres (tablas y/o grupos) a un Set de tablas reales. */
function expandir(nombres) {
  const out = new Set();
  for (const n of nombres) {
    const g = GRUPOS[String(n).toLowerCase()];
    if (g) { g.forEach(m => out.add(m)); continue; }
    const real = MODELOS.find(m => m.toLowerCase() === String(n).toLowerCase());
    if (!real) return { error: `"${n}" no es una tabla ni un grupo.` };
    out.add(real);
  }
  return { tablas: out };
}

/**
 * ¿Esta selección se puede restaurar? Devuelve las dependencias obligatorias
 * que faltan y una selección corregida.
 *
 * Es lo que evita generar un archivo que revienta por violación de FK justo
 * durante una recuperación.
 */
function validarDependencias(seleccion) {
  const faltantes = [];
  for (const m of seleccion) {
    for (const dep of DEPENDE_DE[m] || []) {
      if (!seleccion.includes(dep) && !faltantes.some(f => f.tabla === m && f.falta === dep)) {
        faltantes.push({ tabla: m, falta: dep });
      }
    }
  }
  const sugerida = MODELOS.filter(m =>
    seleccion.includes(m) || faltantes.some(f => f.falta === m)
  );
  return { ok: faltantes.length === 0, faltantes, sugerida };
}

module.exports = { MODELOS, GRUPOS, DEPENDE_DE, expandir, validarDependencias };
