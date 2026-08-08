// Plantillas de 32×32 para redibujar el catálogo (brief wt2).
//
// Para qué: redibujar desde un lienzo en blanco pierde la alineación con el
// resto de las piezas — los ojos tienen que caer donde la cara los espera. Esto
// exporta el avatar compuesto actual escalado 2× a 32×32, para abrirlo como
// capa de referencia y dibujar encima con detalle.
//
// Cómo se usa (flujo de capas, que es como se trabaja pixel art de verdad):
//   1. Abre la plantilla en Aseprite / Piskel como capa de fondo.
//   2. Dibuja ENCIMA, una capa por pieza (base, pelo, ojos, boca, accesorio).
//   3. Exporta cada capa como PNG con transparencia, por separado.
//   4. Pasa cada PNG por scripts/avatar-convertidor.html.
//
// No toca código de producto: usa solo `render()` de src/lib/avatar.js y le
// parsea los rectángulos al SVG que devuelve.
//
//   node scripts/avatar-plantillas.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const avatar = require('../src/lib/avatar');

const ORIGEN = 16;   // lienzo del catálogo wt1
const DESTINO = 32;  // rejilla acordada para wt2
const ESCALA = DESTINO / ORIGEN;

// ---------- PNG mínimo (RGBA, 8 bits, sin entrelazado). Sin dependencias. ----------
const TABLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}
function png(ancho, alto, rgba) {
  const filas = [];
  for (let y = 0; y < alto; y++) {
    filas.push(Buffer.from([0])); // filtro 0 = sin filtro
    filas.push(Buffer.from(rgba.subarray(y * ancho * 4, (y + 1) * ancho * 4)));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;  // bits por canal
  ihdr[9] = 6;  // color RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(Buffer.concat(filas), { level: 9 })),
    trozo('IEND', Buffer.alloc(0))
  ]);
}

// ---------- Del SVG que devuelve render() a una lista de rectángulos ----------
// Se descarta el rectángulo de fondo (lleva fill-opacity y no lleva x/y): es un
// tinte de ambiente del render, no parte del dibujo de ninguna pieza.
function rectsDeSvg(svg) {
  const out = [];
  const re = /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="([^"]+)"\/>/g;
  let m;
  while ((m = re.exec(svg))) {
    out.push({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], fill: m[5] });
  }
  return out;
}
const hex = (s) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));

function lienzoDe(semilla) {
  const svg = avatar.render(semilla);
  if (!svg) throw new Error(`Semilla inválida: ${semilla}`);
  const rgba = new Uint8Array(DESTINO * DESTINO * 4); // transparente
  for (const r of rectsDeSvg(svg)) {
    const [cr, cg, cb] = hex(r.fill);
    for (let y = r.y * ESCALA; y < (r.y + r.h) * ESCALA; y++) {
      for (let x = r.x * ESCALA; x < (r.x + r.w) * ESCALA; x++) {
        const i = (y * DESTINO + x) * 4;
        rgba[i] = cr; rgba[i + 1] = cg; rgba[i + 2] = cb; rgba[i + 3] = 255;
      }
    }
  }
  return rgba;
}

// ---------- Guía de geometría: dónde caen cabeza, ojos, boca y hombros ----------
// Un color que no está en ninguna paleta, para que en el convertidor se marque
// como "ignorar" de un vistazo y no se cuele en ninguna pieza.
function guia() {
  const rgba = new Uint8Array(DESTINO * DESTINO * 4);
  const punto = (x, y, [r, g, b, a]) => {
    if (x < 0 || y < 0 || x >= DESTINO || y >= DESTINO) return;
    const i = (y * DESTINO + x) * 4;
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a;
  };
  const MAGENTA = [255, 0, 255, 170];
  const TENUE = [255, 0, 255, 70];
  // Contorno de la cabeza: x 6..25, y 6..25 (el 3..12 de wt1, ×2)
  for (let x = 6; x <= 25; x++) { punto(x, 6, MAGENTA); punto(x, 25, MAGENTA); }
  for (let y = 6; y <= 25; y++) { punto(6, y, MAGENTA); punto(25, y, MAGENTA); }
  // Línea de los ojos (y 12..15 en wt2) y de la boca (y 18..19)
  for (let x = 7; x <= 24; x++) { punto(x, 12, TENUE); punto(x, 15, TENUE); punto(x, 18, TENUE); }
  // Arranque de hombros (y 26)
  for (let x = 4; x <= 27; x++) punto(x, 26, TENUE);
  // Eje central, para simetría
  for (let y = 4; y <= 28; y += 2) { punto(15, y, TENUE); punto(16, y, TENUE); }
  return rgba;
}

// ---------- Qué se exporta ----------
const cat = avatar.catalogo();
const nombresBase = cat.ranuras.find(r => r.clave === 'base').opciones;
const salidas = [];

// Referencia principal: la cara sobre la que se dibuja casi todo
salidas.push(['_referencia-persona.png', lienzoDe('wt1-0-0-0-0-0-0')]);
// Con lentes, que es la pieza que más pide detalle según la revisión del PO
salidas.push(['_referencia-persona-lentes.png', lienzoDe('wt1-0-0-0-0-3-0')]);
// Las 8 bases: son las piezas grandes y cada una tiene silueta propia
nombresBase.forEach((n, i) => {
  const slug = n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  salidas.push([`base-${i}-${slug}.png`, lienzoDe(`wt1-${i}-0-0-0-0-0`)]);
});
salidas.push(['_guia-geometria.png', guia()]);

const dir = path.join(__dirname, 'plantillas-wt2');
fs.mkdirSync(dir, { recursive: true });
for (const [nombre, rgba] of salidas) {
  fs.writeFileSync(path.join(dir, nombre), png(DESTINO, DESTINO, rgba));
}

console.log(`${salidas.length} plantillas de ${DESTINO}×${DESTINO} en ${dir}`);
salidas.forEach(([n]) => console.log(`  ${n}`));
console.log(`
Flujo sugerido:
  1. Abre _referencia-persona.png como capa de fondo y _guia-geometria.png encima.
  2. Dibuja en capas separadas: una por pieza (base, pelo, ojos, boca, accesorio).
  3. Exporta cada capa como PNG con transparencia.
  4. Convierte cada una en scripts/avatar-convertidor.html.

Colores de autoría (paleta Terracota + los dos roles fijos):
  b base    #c98a63     s sombra  #a86a48
  p pelo    #3b2a21     r ropa    #3f6f62
  a acento  #d9a441
  o oscuro  #1a1a1a     l luz     #f2efe6
El convertidor reconoce estos siete exactos y asigna el rol solo.`);
