// B42: lógica pura para reprocesar las imágenes YA guardadas con depurarMetadatos.
//
// El ciclo 23B hizo que el servidor quite los metadatos de toda subida nueva; lo que
// entró antes por la API directa pudo quedarse con coordenadas. Aquí se decide, imagen
// por imagen, qué hacer. El script que habla con el almacenamiento está en
// scripts/depurar-imagenes-guardadas.js; esta parte no toca la red ni el disco y tiene
// su prueba en tests/depurarGuardadas.test.js.
const { depurarMetadatos } = require('../../src/lib/metadatosImagen');

const MIME_POR_EXTENSION = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** Tipo de imagen según la extensión de la clave; null si no es una imagen que sepamos depurar. */
function mimeDeClave(clave) {
  const m = /\.[A-Za-z0-9]+$/.exec(clave || '');
  return m ? MIME_POR_EXTENSION[m[0].toLowerCase()] || null : null;
}

/**
 * Orientación EXIF (etiqueta 0x0112) del primer encabezado TIFF que aparezca en el archivo,
 * o null si no hay. Sirve para JPEG, PNG (eXIf) y WebP (EXIF): en los tres el EXIF es un
 * bloque TIFF. Lee con límites estrictos; ante cualquier cosa rara devuelve null.
 */
function orientacionExif(buffer) {
  const firmas = [Buffer.from('MM\0*', 'latin1'), Buffer.from('II*\0', 'latin1')];
  for (const firma of firmas) {
    let desde = 0;
    for (;;) {
      const i = buffer.indexOf(firma, desde);
      if (i < 0) break;
      const o = leerOrientacionEn(buffer, i);
      if (o !== null) return o;
      desde = i + 1;
    }
  }
  return null;
}

function leerOrientacionEn(buffer, inicio) {
  const be = buffer[inicio] === 0x4d; // 'M'
  const u16 = (p) => (p + 2 <= buffer.length ? (be ? buffer.readUInt16BE(p) : buffer.readUInt16LE(p)) : null);
  const u32 = (p) => (p + 4 <= buffer.length ? (be ? buffer.readUInt32BE(p) : buffer.readUInt32LE(p)) : null);
  const ifd = u32(inicio + 4);
  if (ifd === null || ifd < 8) return null;
  const n = u16(inicio + ifd);
  if (n === null || n === 0 || n > 512) return null;
  for (let k = 0; k < n; k++) {
    const e = inicio + ifd + 2 + k * 12;
    if (e + 12 > buffer.length) return null;
    if (u16(e) === 0x0112) {
      const valor = u16(e + 8);
      return valor >= 1 && valor <= 8 ? valor : null;
    }
  }
  return null;
}

/**
 * Qué hacer con una imagen guardada.
 *   limpia         ya no trae metadatos: no se toca.
 *   con_metadatos  trae metadatos y se pueden quitar sin cambiar cómo se ve: se reemplaza.
 *   orientacion    trae una orientación distinta de 1: al quitar el EXIF la foto se vería
 *                  girada, así que NO se toca y se reporta para que alguien decida.
 *   no_analizable  el archivo no se pudo recorrer, o depurarlo dos veces no da lo mismo: no se toca.
 * @returns {{estado: string, limpia?: Buffer, bytes_quitados?: number, orientacion?: number|null, motivo?: string}}
 */
function clasificar(buffer, mimetype) {
  let limpia;
  try {
    limpia = depurarMetadatos(buffer, mimetype);
  } catch (e) {
    return { estado: 'no_analizable', motivo: e.message };
  }
  if (Buffer.compare(limpia, buffer) === 0) return { estado: 'limpia' };

  // Defensa extra antes de reemplazar algo en producción: el resultado tiene que ser estable.
  let otraVez;
  try {
    otraVez = depurarMetadatos(limpia, mimetype);
  } catch (e) {
    return { estado: 'no_analizable', motivo: `la versión depurada no se pudo volver a leer: ${e.message}` };
  }
  if (Buffer.compare(otraVez, limpia) !== 0) {
    return { estado: 'no_analizable', motivo: 'depurar dos veces no da el mismo resultado' };
  }

  const orientacion = orientacionExif(buffer);
  if (orientacion !== null && orientacion !== 1) return { estado: 'orientacion', orientacion };
  return { estado: 'con_metadatos', limpia, bytes_quitados: buffer.length - limpia.length, orientacion };
}

module.exports = { clasificar, mimeDeClave, orientacionExif };
