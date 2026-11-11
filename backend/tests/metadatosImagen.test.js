// Ciclo 23B (B37): el servidor vuelve a quitar los metadatos de toda imagen.
//
// Antes solo los quitaba el navegador: una llamada directa a la API guardaba
// la foto con sus coordenadas. Aquí se prueba la librería con archivos reales
// (generados con GPS, fabricante, comentario y XMP incrustados) y la ruta de
// subida de punta a punta, leyendo lo que de verdad quedó en disco.
const fs = require('fs');
const path = require('path');
const { suite } = require('./lib');
const { depurarMetadatos } = require('../src/lib/metadatosImagen');

const UPLOADS = path.join(__dirname, '..', 'uploads');

// Imágenes de 8×8 con EXIF (GPS 19°25'57"N 99°07'59"W, fabricante «CamaraDePrueba»,
// orientación 6). El JPEG lleva además un comentario; el PNG, bloques tEXt e
// iTXt; el WebP, un bloque XMP.
const JPG_GPS = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/4QCwRXhpZgAATU0AKgAAAAgAAwEPAAIAAAAPAAAAMgESAAMAAAABAAYAAIglAAQAAAABAAAAQgAAAABDYW1hcmFEZVBydWViYQAAAAQAAQACAAAAAk4AAAAAAgAFAAAAAwAAAHgAAwACAAAAAlcAAAAABAAFAAAAAwAAAJAAAAAAAAAAEwAAAAEAAAAZAAAAAQAAADkAAAABAAAAYwAAAAEAAAAHAAAAAQAAADsAAAAB//4AFGNvbWVudGFyaW8gc2VjcmV0b//bAEMABgQFBgUEBgYFBgcHBggKEAoKCQkKFA4PDBAXFBgYFxQWFhodJR8aGyMcFhYgLCAjJicpKikZHy0wLSgwJSgpKP/bAEMBBwcHCggKEwoKEygaFhooKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKP/AABEIAAgACAMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AMuiiivnT4Q//9k=', 'base64');
const PNG_GPS = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAE3RFWHRBdXRob3IAUGVyc29uYSBSZWFs+CSy4wAAAB1pVFh0TG9jYXRpb24AAAAAADE5LjQzMjYsLTk5LjEzMzIPvPYpAAAAqGVYSWZNTQAqAAAACAADAQ8AAgAAAA8AAAAyARIAAwAAAAEABgAAiCUABAAAAAEAAABCAAAAAENhbWFyYURlUHJ1ZWJhAAAABAABAAIAAAACTgAAAAACAAUAAAADAAAAeAADAAIAAAACVwAAAAAEAAUAAAADAAAAkAAAAAAAAAATAAAAAQAAABkAAAABAAAAOQAAAAEAAABjAAAAAQAAAAcAAAABAAAAOwAAAAFyDlrzAAAAFElEQVR4nGPUWGDDgA0wYRUdtBIA0AwBFM5z16gAAAAASUVORK5CYII=', 'base64');
const WEBP_GPS = Buffer.from('UklGRgoBAABXRUJQVlA4WAoAAAAMAAAABwAABwAAVlA4TBEAAAAvB8ABAAdQ0KKUp/+BiOh/AABFWElGqAAAAE1NACoAAAAIAAMBDwACAAAADwAAADIBEgADAAAAAQAGAACIJQAEAAAAAQAAAEIAAAAAQ2FtYXJhRGVQcnVlYmEAAAAEAAEAAgAAAAJOAAAAAAIABQAAAAMAAAB4AAMAAgAAAAJXAAAAAAQABQAAAAMAAACQAAAAAAAAABMAAAABAAAAGQAAAAEAAAA5AAAAAQAAAGMAAAABAAAABwAAAAEAAAA7AAAAAVhNUCAiAAAAPHg6eG1wbWV0YT5HUFMgMTkuNDMyNjwveDp4bXBtZXRhPg==', 'base64');

const RASTROS = ['Exif', 'EXIF', 'CamaraDePrueba', 'comentario secreto', 'Persona Real', '19.4326', 'xmpmeta', 'XMP '];
const rastrosEn = (buffer) => RASTROS.filter(r => buffer.includes(Buffer.from(r, 'latin1')));

function rechaza(buffer, mimetype) {
  try {
    depurarMetadatos(buffer, mimetype);
    return false;
  } catch (e) {
    return e.code === 'IMAGEN_NO_ANALIZABLE';
  }
}

// Segmento APP2 con un perfil ICC de mentira: lo que importa es que sobreviva.
function conPerfilIcc(jpeg) {
  const datos = Buffer.concat([Buffer.from('ICC_PROFILE\0', 'latin1'), Buffer.from([1, 1]), Buffer.from('perfil-de-color')]);
  const cabecera = Buffer.from([0xFF, 0xE2, 0, 0]);
  cabecera.writeUInt16BE(datos.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), cabecera, datos, jpeg.subarray(2)]);
}

module.exports = async function run() {
  const { results, check, token, mkUser, cleanup, prisma } = suite('Metadatos de imagen', 'wtmeta');
  const storage = require('../src/lib/storage');

  await cleanup();
  const subidos = [];
  try {
    console.log('\n  — Los archivos de prueba sí traen metadatos —');
    check('el JPEG de prueba trae EXIF y comentario', rastrosEn(JPG_GPS).length >= 3);
    check('el PNG de prueba trae EXIF y textos', rastrosEn(PNG_GPS).length >= 3);
    check('el WebP de prueba trae EXIF y XMP', rastrosEn(WEBP_GPS).length >= 3);

    console.log('\n  — JPEG —');
    const jpg = depurarMetadatos(JPG_GPS, 'image/jpeg');
    check('sale sin EXIF, GPS ni comentario', rastrosEn(jpg).length === 0, `(${rastrosEn(jpg)})`);
    check('sigue siendo un JPEG completo (SOI … EOI)',
      jpg[0] === 0xFF && jpg[1] === 0xD8 && jpg[jpg.length - 2] === 0xFF && jpg[jpg.length - 1] === 0xD9);
    check('conserva la cabecera JFIF', jpg.includes(Buffer.from('JFIF\0', 'latin1')));
    check('es más chico que el original', jpg.length < JPG_GPS.length);
    check('un archivo ya limpio pasa sin cambios (mismo buffer)', depurarMetadatos(jpg, 'image/jpeg') === jpg);
    const conIcc = depurarMetadatos(conPerfilIcc(JPG_GPS), 'image/jpeg');
    check('conserva el perfil de color ICC', conIcc.includes(Buffer.from('perfil-de-color')) && rastrosEn(conIcc).length === 0);
    const conCola = depurarMetadatos(Buffer.concat([jpg, Buffer.from('Exif oculto tras el final')]), 'image/jpeg');
    check('descarta lo que venga después del fin de la imagen', conCola.equals(jpg));

    console.log('\n  — PNG —');
    const png = depurarMetadatos(PNG_GPS, 'image/png');
    check('sale sin eXIf, tEXt ni iTXt', rastrosEn(png).length === 0, `(${rastrosEn(png)})`);
    check('ya no trae el bloque eXIf', !png.includes(Buffer.from('eXIf')));
    check('conserva IHDR, IDAT e IEND', ['IHDR', 'IDAT', 'IEND'].every(t => png.includes(Buffer.from(t))));
    check('termina en IEND', png.toString('latin1', png.length - 8, png.length - 4) === 'IEND');
    check('un archivo ya limpio pasa sin cambios (mismo buffer)', depurarMetadatos(png, 'image/png') === png);

    console.log('\n  — WebP —');
    const webp = depurarMetadatos(WEBP_GPS, 'image/webp');
    check('sale sin EXIF ni XMP', rastrosEn(webp).length === 0, `(${rastrosEn(webp)})`);
    check('el tamaño del contenedor RIFF quedó corregido', webp.readUInt32LE(4) === webp.length - 8,
      `(dice ${webp.readUInt32LE(4)}, mide ${webp.length - 8})`);
    const vp8x = webp.indexOf(Buffer.from('VP8X'));
    check('las banderas de EXIF y XMP quedaron apagadas en VP8X', vp8x > 0 && (webp[vp8x + 8] & 0x0C) === 0);
    check('el original sí las anunciaba', (WEBP_GPS[WEBP_GPS.indexOf(Buffer.from('VP8X')) + 8] & 0x0C) === 0x0C);
    check('conserva los datos de imagen', webp.includes(Buffer.from('VP8L')));
    check('no modifica el buffer original', rastrosEn(WEBP_GPS).length >= 3);
    check('un archivo ya limpio pasa sin cambios (mismo buffer)', depurarMetadatos(webp, 'image/webp') === webp);

    console.log('\n  — Falla cerrado —');
    for (const [nombre, buffer, tipo] of [['JPEG', JPG_GPS, 'image/jpeg'], ['PNG', PNG_GPS, 'image/png'], ['WebP', WEBP_GPS, 'image/webp']]) {
      check(`${nombre} sin el último byte → se rechaza`, rechaza(buffer.subarray(0, buffer.length - 1), tipo));
      check(`${nombre} cortado a la mitad → se rechaza`, rechaza(buffer.subarray(0, buffer.length >> 1), tipo));
    }
    check('un PNG declarado como JPEG → se rechaza', rechaza(PNG_GPS, 'image/jpeg'));
    check('un tipo no soportado → se rechaza', rechaza(JPG_GPS, 'image/gif'));
    check('un JPEG sin datos de imagen → se rechaza', rechaza(Buffer.from([0xFF, 0xD8, 0xFF, 0xD9]), 'image/jpeg'));

    console.log('\n  — Subida por la API —');
    const ana = await mkUser('ana');
    const tAna = token(ana.id);
    async function subir(buffer, tipo, nombre) {
      const form = new FormData();
      form.append('image', new Blob([buffer], { type: tipo }), nombre);
      const res = await fetch(`http://localhost:${process.env.PORT || 4010}/api/media/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tAna}` },
        body: form
      });
      const data = await res.json().catch(() => null);
      if (data?.url) subidos.push(data.url);
      return { status: res.status, data };
    }
    const enDisco = (url) => fs.readFileSync(path.join(UPLOADS, url.split('/').pop()));

    for (const [nombre, buffer, tipo, archivo] of [
      ['JPEG', JPG_GPS, 'image/jpeg', 'foto.jpg'],
      ['PNG', PNG_GPS, 'image/png', 'foto.png'],
      ['WebP', WEBP_GPS, 'image/webp', 'foto.webp']
    ]) {
      const r = await subir(buffer, tipo, archivo);
      check(`${nombre} con GPS → 200`, r.status === 200, `(fue ${r.status})`);
      const guardado = r.data?.url ? enDisco(r.data.url) : Buffer.from('Exif');
      check(`${nombre}: lo guardado no conserva metadatos`, rastrosEn(guardado).length === 0, `(${rastrosEn(guardado)})`);
    }

    const truncado = await subir(JPG_GPS.subarray(0, JPG_GPS.length >> 1), 'image/jpeg', 'rota.jpg');
    check('una imagen truncada → 400', truncado.status === 400, `(fue ${truncado.status})`);
    check('y no se guarda nada', !truncado.data?.url);
    const disfrazada = await subir(PNG_GPS, 'image/jpeg', 'disfrazada.jpg');
    check('un PNG declarado como JPEG → 400', disfrazada.status === 400, `(fue ${disfrazada.status})`);
  } finally {
    await prisma.media.deleteMany({ where: { url: { in: subidos } } });
    for (const url of subidos) await storage.removeByUrl(url);
    await cleanup();
  }

  return results;
};
