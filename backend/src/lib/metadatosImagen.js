// Depuración de metadatos de imagen en el servidor (ciclo 23B, B37).
//
// POR QUÉ EXISTE. El navegador ya quita EXIF y GPS antes de subir
// (frontend/src/lib/imageProcessing.js), pero quien llama a la API sin pasar
// por él se lo saltaba: el servidor guardaba el archivo tal cual. Una foto de
// teléfono lleva coordenadas, modelo del equipo, fecha y a veces una miniatura
// de la imagen original sin recortar.
//
// CÓMO. Se recorre el contenedor y se copia SOLO lo que hace falta para pintar
// la imagen (lista de permitidos, no de prohibidos): un bloque desconocido se
// descarta en lugar de dejarlo pasar. No se recodifica nada, así que no hay
// pérdida de calidad ni dependencia nueva.
//
// FALLA CERRADO. Si el archivo no se puede recorrer de principio a fin
// (truncado, longitudes imposibles, sin datos de imagen), se lanza
// `ImagenNoAnalizable` y la ruta responde 400. Nunca se guarda algo que no se
// pudo revisar.
//
// LO QUE SE PIERDE A PROPÓSITO. La orientación vive en el EXIF: una foto subida
// directo a la API puede quedar girada. El navegador ya la aplica antes de
// subir. El perfil de color (ICC) sí se conserva; sin él los colores cambian.

class ImagenNoAnalizable extends Error {
  constructor(motivo) {
    super(`Imagen no analizable: ${motivo}`);
    this.name = 'ImagenNoAnalizable';
    this.code = 'IMAGEN_NO_ANALIZABLE';
  }
}

const fallo = (motivo) => { throw new ImagenNoAnalizable(motivo); };

const empiezaCon = (buffer, desde, texto) =>
  buffer.length >= desde + texto.length &&
  buffer.toString('latin1', desde, desde + texto.length) === texto;

// Si no se quitó nada se devuelve el mismo buffer: un archivo limpio pasa intacto.
function armar(original, partes) {
  const total = partes.reduce((n, p) => n + p.length, 0);
  return total === original.length ? original : Buffer.concat(partes, total);
}

// ---------- JPEG ----------
// SOI, luego segmentos `FF xx` + longitud de 2 bytes (que se incluye a sí
// misma). Tras cada SOS vienen datos comprimidos sin longitud: se avanza hasta
// el siguiente marcador real. Lo que haya después de EOI se descarta (ahí
// viajan, por ejemplo, las imágenes secundarias de las fotos «en movimiento»,
// con su propio EXIF).
function segmentoJpegPermitido(marcador, buffer, datos) {
  if (marcador === 0xFE) return false;                               // COM
  if (marcador === 0xE0) return empiezaCon(buffer, datos, 'JFIF\0');   // JFIF sí; JFXX (miniatura) no
  if (marcador === 0xE2) return empiezaCon(buffer, datos, 'ICC_PROFILE\0');
  if (marcador === 0xEE) return empiezaCon(buffer, datos, 'Adobe');   // hace falta para decodificar el color
  if (marcador >= 0xE0 && marcador <= 0xEF) return false;             // EXIF, XMP, IPTC, MPF, C2PA…
  return true;                                                        // tablas y cabeceras de imagen
}

function depurarJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) fallo('no empieza como JPEG');
  const partes = [buffer.subarray(0, 2)];
  let pos = 2;
  let huboImagen = false;

  for (;;) {
    if (pos + 1 >= buffer.length) fallo('JPEG truncado');
    if (buffer[pos] !== 0xFF) fallo('se esperaba un marcador JPEG');
    while (buffer[pos + 1] === 0xFF) {                                // bytes de relleno
      pos++;
      if (pos + 1 >= buffer.length) fallo('JPEG truncado');
    }
    const marcador = buffer[pos + 1];

    if (marcador === 0xD9) {                                          // EOI
      if (!huboImagen) fallo('JPEG sin datos de imagen');
      partes.push(buffer.subarray(pos, pos + 2));
      return armar(buffer, partes);
    }
    if (marcador === 0x00 || marcador === 0xD8) fallo('marcador JPEG fuera de lugar');
    if (marcador === 0x01 || (marcador >= 0xD0 && marcador <= 0xD7)) { // sin longitud
      partes.push(buffer.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }

    if (pos + 4 > buffer.length) fallo('JPEG truncado');
    const longitud = buffer.readUInt16BE(pos + 2);
    const fin = pos + 2 + longitud;
    if (longitud < 2 || fin > buffer.length) fallo('segmento JPEG con longitud imposible');
    if (segmentoJpegPermitido(marcador, buffer, pos + 4)) partes.push(buffer.subarray(pos, fin));
    pos = fin;

    if (marcador === 0xDA) {                                          // SOS: datos comprimidos
      huboImagen = true;
      let i = pos;
      for (;;) {
        i = buffer.indexOf(0xFF, i);
        if (i < 0 || i + 1 >= buffer.length) fallo('JPEG truncado');
        const sig = buffer[i + 1];
        if (sig === 0x00 || (sig >= 0xD0 && sig <= 0xD7)) { i += 2; continue; }
        if (sig === 0xFF) { i += 1; continue; }
        break;
      }
      partes.push(buffer.subarray(pos, i));
      pos = i;
    }
  }
}

// ---------- PNG ----------
// Firma de 8 bytes y bloques: longitud (4) + tipo (4) + datos + CRC (4).
const PNG_FIRMA = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const PNG_PERMITIDOS = new Set([
  'IHDR', 'PLTE', 'IDAT', 'IEND',                                     // imagen
  'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'bKGD', 'pHYs',     // color y presentación
  'hIST', 'sPLT', 'cICP', 'mDCV', 'cLLI',
  'acTL', 'fcTL', 'fdAT'                                              // animación (APNG)
]);
// Fuera quedan eXIf, tEXt, iTXt, zTXt, tIME y cualquier bloque que no esté arriba.

function depurarPng(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_FIRMA)) fallo('no empieza como PNG');
  const partes = [buffer.subarray(0, 8)];
  let pos = 8;
  let primero = true;
  let huboImagen = false;

  for (;;) {
    if (pos + 12 > buffer.length) fallo('PNG truncado');
    const longitud = buffer.readUInt32BE(pos);
    const tipo = buffer.toString('latin1', pos + 4, pos + 8);
    const fin = pos + 12 + longitud;
    if (fin > buffer.length) fallo('bloque PNG con longitud imposible');
    if (!/^[A-Za-z]{4}$/.test(tipo)) fallo('bloque PNG con tipo inválido');
    if (primero && (tipo !== 'IHDR' || longitud !== 13)) fallo('PNG sin cabecera');
    primero = false;
    if (tipo === 'IDAT') huboImagen = true;
    if (PNG_PERMITIDOS.has(tipo)) partes.push(buffer.subarray(pos, fin));
    pos = fin;
    if (tipo === 'IEND') {
      if (!huboImagen) fallo('PNG sin datos de imagen');
      return armar(buffer, partes);                                   // lo que siga a IEND se descarta
    }
  }
}

// ---------- WebP ----------
// Contenedor RIFF: 'RIFF' + tamaño (4, little endian) + 'WEBP' + bloques
// (código de 4 letras + tamaño + datos, rellenados a longitud par). Si hay
// bloque VP8X, sus banderas anuncian EXIF y XMP: al quitarlos hay que apagarlas
// y corregir el tamaño del contenedor, o el archivo queda inválido.
const WEBP_PERMITIDOS = new Set(['VP8X', 'VP8 ', 'VP8L', 'ALPH', 'ICCP', 'ANIM', 'ANMF']);
const WEBP_BANDERA_EXIF = 0x08;
const WEBP_BANDERA_XMP = 0x04;

function depurarWebp(buffer) {
  if (buffer.length < 12 || !empiezaCon(buffer, 0, 'RIFF') || !empiezaCon(buffer, 8, 'WEBP')) {
    fallo('no empieza como WebP');
  }
  const finRiff = 8 + buffer.readUInt32LE(4);
  if (finRiff > buffer.length) fallo('WebP truncado');
  const partes = [];
  let pos = 12;
  let huboImagen = false;
  let cambio = finRiff !== buffer.length;                             // lo que siga al contenedor se descarta

  while (pos < finRiff) {
    if (pos + 8 > finRiff) fallo('WebP truncado');
    const codigo = buffer.toString('latin1', pos, pos + 4);
    const tamano = buffer.readUInt32LE(pos + 4);
    const fin = pos + 8 + tamano + (tamano % 2);
    // El relleno del último bloque puede faltar en archivos reales: se tolera.
    const finReal = Math.min(fin, finRiff);
    if (pos + 8 + tamano > finRiff) fallo('bloque WebP con longitud imposible');
    if (codigo === 'VP8 ' || codigo === 'VP8L' || codigo === 'ANMF') huboImagen = true;
    if (WEBP_PERMITIDOS.has(codigo)) {
      let bloque = buffer.subarray(pos, finReal);
      if (codigo === 'VP8X') {
        if (tamano < 10) fallo('cabecera VP8X incompleta');
        if (bloque[8] & (WEBP_BANDERA_EXIF | WEBP_BANDERA_XMP)) {
          bloque = Buffer.from(bloque);                               // copia: no se toca el original
          bloque[8] &= ~(WEBP_BANDERA_EXIF | WEBP_BANDERA_XMP);
          cambio = true;
        }
      }
      partes.push(bloque);
      if (bloque.length % 2) {                                        // repone el relleno que faltaba
        partes.push(Buffer.alloc(1));
        cambio = true;
      }
    } else {
      cambio = true;
    }
    pos = fin;
  }
  if (!huboImagen) fallo('WebP sin datos de imagen');

  if (!cambio) return buffer;

  const cuerpo = partes.reduce((n, p) => n + p.length, 0);
  const cabecera = Buffer.from(buffer.subarray(0, 12));
  cabecera.writeUInt32LE(4 + cuerpo, 4);
  return Buffer.concat([cabecera, ...partes], 12 + cuerpo);
}

const DEPURADORES = {
  'image/jpeg': depurarJpeg,
  'image/png': depurarPng,
  'image/webp': depurarWebp
};

/**
 * Devuelve la imagen sin metadatos (EXIF, XMP, IPTC, comentarios, miniaturas).
 * El contenido debe corresponder al tipo declarado: un PNG anunciado como JPEG
 * se rechaza. Lanza `ImagenNoAnalizable` si no puede recorrer el archivo completo.
 * @param {Buffer} buffer
 * @param {string} mimetype  image/jpeg, image/png o image/webp
 * @returns {Buffer} el mismo buffer si ya venía limpio
 */
function depurarMetadatos(buffer, mimetype) {
  const depurar = DEPURADORES[mimetype];
  if (!depurar) fallo('tipo no soportado');
  if (!Buffer.isBuffer(buffer)) fallo('sin contenido');
  return depurar(buffer);
}

module.exports = { depurarMetadatos, ImagenNoAnalizable };
