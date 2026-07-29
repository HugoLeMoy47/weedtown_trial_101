// Avatares pixel art generados por piezas.
//
// Por qué existen: hasta ahora el avatar se copiaba de Mastodon al iniciar
// sesión, y para mucha gente esa foto es su cara. Aparecía junto a la zona de
// ~2 km en "Cerca", que es justo donde un retrato pesa. El producto se define
// por el seudonimato; importar una cara por defecto lo contradecía.
//
// Por qué POR PIEZAS y no un editor libre: si cada pieza la dibujó el equipo,
// todo resultado posible es aceptable por construcción. No hay nada que
// reportar ni que moderar, en el elemento más visible de toda la interfaz.
//
// El dibujo vive en el servidor y se sirve como SVG (ver routes/avatarRoutes).
// Así `User.avatar` sigue siendo una URL como siempre y ninguna pantalla que
// muestre avatares necesitó cambios — y un cliente futuro no tiene que
// reimplementar el dibujo, que es la duplicación que ya nos mordió con geogrid.
const crypto = require('crypto');

// Versión del catálogo. Va en la semilla y NUNCA se reinterpreta: si algún día
// se agregan o reordenan piezas, se publica "wt2" y los avatares "wt1" siguen
// dibujándose con este catálogo. Sin esto, ampliar el catálogo le cambiaría la
// cara a todo el mundo de golde, y la gente se identifica con la suya.
const VERSION = 'wt1';

const LIENZO = 16;

// Roles de color: b=base, s=sombra, p=pelo, r=ropa, a=acento, o=oscuro, l=luz
const PALETAS = [
  { n: 'Terracota', base: '#c98a63', som: '#a86a48', pelo: '#3b2a21', ropa: '#3f6f62', ac: '#d9a441' },
  { n: 'Cacao',     base: '#8a5a3c', som: '#6d4529', pelo: '#241a15', ropa: '#5b4a7a', ac: '#e0743a' },
  { n: 'Arena',     base: '#e3b48c', som: '#c4936c', pelo: '#6a4423', ropa: '#2f6f62', ac: '#c4444f' },
  { n: 'Jade',      base: '#7fae72', som: '#5d8a54', pelo: '#2c4a2a', ropa: '#37474f', ac: '#e8c33f' },
  { n: 'Noche',     base: '#6b5f7a', som: '#4f4459', pelo: '#1c1824', ropa: '#c4444f', ac: '#7fd1c0' },
  { n: 'Ámbar',     base: '#d69a5a', som: '#b47a3c', pelo: '#4a2c17', ropa: '#455a64', ac: '#8fbf5a' }
];

// Cabeza y hombros compartidos por las bases con forma humana
const CABEZA = [
  [4, 3, 8, 1, 'b'], [3, 4, 10, 7, 'b'], [4, 11, 8, 1, 'b'], [5, 12, 6, 1, 's'],
  [3, 13, 10, 1, 'r'], [2, 14, 12, 2, 'r'], [3, 4, 1, 7, 's'], [12, 4, 1, 7, 's']
];

// Las cuatro primeras son las originales; las cuatro últimas amplían el
// catálogo. Más de la mitad son NO humanas a propósito: para una comunidad
// estigmatizada, poder no tener cara es una función de privacidad.
const BASES = [
  { n: 'Persona', r: CABEZA },
  {
    n: 'Gato',
    r: [[3, 1, 1, 1, 'b'], [3, 2, 2, 1, 'b'], [12, 1, 1, 1, 'b'], [11, 2, 2, 1, 'b'],
        [3, 3, 10, 8, 'b'], [4, 11, 8, 1, 'b'], [5, 12, 6, 1, 's'],
        [3, 13, 10, 1, 'r'], [2, 14, 12, 2, 'r'], [3, 3, 1, 8, 's'], [12, 3, 1, 8, 's']]
  },
  {
    n: 'Planta',
    r: [[7, 0, 2, 2, 'a'], [6, 1, 1, 1, 'a'], [9, 1, 1, 1, 'a']].concat(CABEZA)
  },
  {
    n: 'Calaca',
    sinPelo: true,
    r: [[4, 2, 8, 1, 'l'], [3, 3, 10, 8, 'l'], [4, 11, 8, 1, 'l'],
        [5, 12, 2, 1, 'l'], [9, 12, 2, 1, 'l'],
        [3, 13, 10, 1, 'r'], [2, 14, 12, 2, 'r'], [3, 3, 1, 8, 's'], [12, 3, 1, 8, 's']]
  },
  {
    n: 'Ajolote',
    sinPelo: true,
    r: [[1, 4, 2, 1, 'a'], [1, 6, 2, 1, 'a'], [1, 8, 2, 1, 'a'],
        [13, 4, 2, 1, 'a'], [13, 6, 2, 1, 'a'], [13, 8, 2, 1, 'a']].concat(CABEZA)
  },
  {
    n: 'Luchador',
    sinPelo: true,
    r: CABEZA.concat([[3, 3, 10, 4, 'a'], [7, 3, 2, 8, 'l'], [3, 9, 10, 1, 'a']])
  },
  {
    n: 'Búho',
    sinPelo: true,
    r: [[2, 1, 2, 2, 'p'], [12, 1, 2, 2, 'p'],
        [3, 3, 10, 8, 'b'], [4, 11, 8, 1, 'b'], [5, 12, 6, 1, 's'],
        [3, 13, 10, 1, 'r'], [2, 14, 12, 2, 'r'], [3, 3, 1, 8, 's'], [12, 3, 1, 8, 's'],
        [7, 8, 2, 2, 'a']]
  },
  {
    n: 'Alebrije',
    sinPelo: true,
    r: [[2, 2, 1, 2, 'a'], [3, 1, 1, 2, 'a'], [13, 2, 1, 2, 'a'], [12, 1, 1, 2, 'a']]
        .concat(CABEZA).concat([[3, 4, 10, 1, 'a'], [3, 10, 10, 1, 'a']])
  }
];

const PELOS = [
  { n: 'Corto',  r: [[4, 2, 8, 1, 'p'], [3, 3, 10, 2, 'p']] },
  { n: 'Largo',  r: [[4, 2, 8, 1, 'p'], [3, 3, 10, 2, 'p'], [2, 5, 2, 6, 'p'], [12, 5, 2, 6, 'p']] },
  { n: 'Chino',  r: [[4, 1, 8, 2, 'p'], [3, 2, 10, 3, 'p'], [2, 3, 1, 2, 'p'], [13, 3, 1, 2, 'p']] },
  { n: 'Rapado', r: [[4, 3, 8, 1, 'p']] }
];

const OJOS = [
  { n: 'Abiertos',      r: [[5, 6, 2, 2, 'o'], [9, 6, 2, 2, 'o']] },
  { n: 'Grandes',       r: [[5, 6, 2, 2, 'l'], [9, 6, 2, 2, 'l'], [6, 7, 1, 1, 'o'], [10, 7, 1, 1, 'o']] },
  { n: 'Entrecerrados', r: [[5, 6, 3, 1, 'a'], [8, 6, 3, 1, 'a'], [5, 7, 3, 1, 'o'], [8, 7, 3, 1, 'o']] },
  { n: 'Guiño',         r: [[5, 6, 2, 2, 'o'], [9, 7, 2, 1, 'o']] }
];

const BOCAS = [
  { n: 'Sonrisa', r: [[6, 9, 4, 1, 'o'], [5, 8, 1, 1, 'o'], [10, 8, 1, 1, 'o']] },
  { n: 'Neutra',  r: [[6, 9, 4, 1, 'o']] },
  { n: 'Risa',    r: [[6, 9, 4, 2, 'o'], [7, 10, 2, 1, 'a']] },
  { n: 'Pícara',  r: [[6, 9, 3, 1, 'o'], [9, 8, 1, 1, 'o']] }
];

const ACCESORIOS = [
  { n: 'Ninguno',   r: [] },
  { n: 'Gorra',     r: [[3, 2, 10, 2, 'a'], [2, 3, 12, 1, 'a'], [2, 4, 4, 1, 'a']] },
  { n: 'Paliacate', r: [[3, 3, 10, 2, 'a'], [2, 4, 1, 3, 'a'], [1, 5, 1, 2, 'a']] },
  { n: 'Lentes',    r: [[4, 6, 4, 2, 'a'], [8, 6, 4, 2, 'a'], [7, 7, 2, 1, 'a'],
                        [5, 6, 2, 2, 'l'], [9, 6, 2, 2, 'l']] },
  { n: 'Hojita',    r: [[12, 2, 2, 1, 'a'], [13, 1, 1, 2, 'a'], [11, 3, 1, 1, 'a']] },
  { n: 'Sombrero',  r: [[1, 3, 14, 1, 'a'], [5, 0, 6, 3, 'a'], [4, 2, 8, 1, 'a']] },
  { n: 'Audífonos', r: [[4, 1, 8, 1, 'a'], [2, 2, 2, 1, 'a'], [12, 2, 2, 1, 'a'],
                        [2, 4, 2, 3, 'a'], [12, 4, 2, 3, 'a']] },
  { n: 'Arete',     r: [[2, 8, 1, 1, 'a'], [13, 8, 1, 1, 'a']] },
  { n: 'Flor',      r: [[13, 1, 1, 1, 'a'], [12, 2, 1, 1, 'a'], [14, 2, 1, 1, 'a'],
                        [13, 3, 1, 1, 'a'], [13, 2, 1, 1, 'l']] },
  { n: 'Humito',    r: [[14, 4, 1, 1, 'l'], [13, 3, 1, 1, 'l'], [14, 2, 1, 1, 'l'], [13, 1, 1, 1, 'l']] }
];

const RANURAS = [
  { clave: 'base', etiqueta: 'Base', lista: BASES },
  { clave: 'pelo', etiqueta: 'Peinado', lista: PELOS },
  { clave: 'ojos', etiqueta: 'Mirada', lista: OJOS },
  { clave: 'boca', etiqueta: 'Boca', lista: BOCAS },
  { clave: 'acc', etiqueta: 'Accesorio', lista: ACCESORIOS },
  { clave: 'pal', etiqueta: 'Paleta', lista: PALETAS }
];

// Formato de semilla: wt1-<base>-<pelo>-<ojos>-<boca>-<acc>-<pal>
// Con guiones y sin caracteres que haya que escapar: la semilla ES la URL.
const SEMILLA_RE = new RegExp(`^${VERSION}-\\d{1,2}(?:-\\d{1,2}){5}$`);

/** ¿Es una semilla con formato válido y todos los índices dentro del catálogo? */
function esSemillaValida(semilla) {
  if (typeof semilla !== 'string' || !SEMILLA_RE.test(semilla)) return false;
  const idx = semilla.split('-').slice(1).map(Number);
  return RANURAS.every((ranura, i) => idx[i] < ranura.lista.length);
}

/** Semilla → índices por ranura. Devuelve null si no es válida. */
function parse(semilla) {
  if (!esSemillaValida(semilla)) return null;
  const idx = semilla.split('-').slice(1).map(Number);
  const out = {};
  RANURAS.forEach((ranura, i) => { out[ranura.clave] = idx[i]; });
  return out;
}

/** Índices → semilla. */
function serializar(piezas) {
  return [VERSION].concat(RANURAS.map(r => piezas[r.clave] || 0)).join('-');
}

function color(rol, pal) {
  switch (rol) {
    case 'b': return pal.base;
    case 's': return pal.som;
    case 'p': return pal.pelo;
    case 'r': return pal.ropa;
    case 'a': return pal.ac;
    case 'o': return '#1a1a1a';
    case 'l': return '#f2efe6';
    default: return pal.base;
  }
}

/**
 * Dibuja el avatar. El orden de las capas importa: lo último tapa lo anterior.
 * @param {string} semilla
 * @returns {string|null} SVG completo, o null si la semilla no es válida
 */
function render(semilla) {
  const p = parse(semilla);
  if (!p) return null;

  const base = BASES[p.base];
  const pal = PALETAS[p.pal];
  // Las bases con máscara, cráneo o plumas no llevan peinado encima
  const pelo = base.sinPelo ? { r: [] } : PELOS[p.pelo];

  const capas = [].concat(base.r, pelo.r, OJOS[p.ojos].r, BOCAS[p.boca].r, ACCESORIOS[p.acc].r);

  let cuerpo = `<rect width="${LIENZO}" height="${LIENZO}" fill="${pal.ropa}" fill-opacity="0.16"/>`;
  for (const [x, y, w, h, rol] of capas) {
    cuerpo += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color(rol, pal)}"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LIENZO} ${LIENZO}" ` +
    `width="128" height="128" shape-rendering="crispEdges" role="img" ` +
    `aria-label="Avatar generado">${cuerpo}</svg>`;
}

/**
 * Semilla estable derivada de un identificador. Se usa para el avatar por
 * defecto: cada cuenta estrena uno distinto sin tener que elegir nada, y el
 * mismo id da siempre el mismo resultado.
 */
function semillaDesde(identificador) {
  const h = crypto.createHash('sha256').update(String(identificador)).digest();
  const piezas = {};
  RANURAS.forEach((ranura, i) => { piezas[ranura.clave] = h[i] % ranura.lista.length; });
  return serializar(piezas);
}

/** Ruta pública del SVG de una semilla. */
function rutaDeAvatar(semilla) {
  return `/api/avatars/${semilla}.svg`;
}

/** URL absoluta, que es lo que se guarda en User.avatar. */
function urlDeAvatar(semilla) {
  const base = (process.env.BACKEND_URL || 'http://localhost:4000').replace(/\/$/, '');
  return `${base}${rutaDeAvatar(semilla)}`;
}

/** ¿Esta URL es un avatar generado por nosotros? */
function esUrlDeAvatar(url) {
  if (typeof url !== 'string') return false;
  const m = /\/api\/avatars\/([A-Za-z0-9-]+)\.svg$/.exec(url);
  return Boolean(m) && esSemillaValida(m[1]);
}

/** Catálogo para que el frontend pinte el estudio sin duplicar los nombres. */
function catalogo() {
  return {
    version: VERSION,
    ranuras: RANURAS.map(r => ({
      clave: r.clave,
      etiqueta: r.etiqueta,
      opciones: r.lista.map(o => o.n)
    }))
  };
}

module.exports = {
  VERSION,
  esSemillaValida,
  parse,
  serializar,
  render,
  semillaDesde,
  rutaDeAvatar,
  urlDeAvatar,
  esUrlDeAvatar,
  catalogo
};
