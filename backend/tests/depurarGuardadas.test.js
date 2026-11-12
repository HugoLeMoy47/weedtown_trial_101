// B42: decisión por imagen al reprocesar lo que YA está guardado (scripts/lib/depurar-guardadas.js).
//
// Lo delicado no es quitar los metadatos (eso lo prueba metadatosImagen.test.js) sino no
// estropear fotos de la comunidad en producción: una con orientación EXIF se vería girada sin
// él, y un archivo que no se puede recorrer no se toca. No usa la base ni la red.
const fs = require('fs');
const path = require('path');
const { suite } = require('./lib');
const { depurarMetadatos } = require('../src/lib/metadatosImagen');
const { clasificar, mimeDeClave, orientacionExif } = require('../scripts/lib/depurar-guardadas');

// Las imágenes de 8×8 con GPS y orientación 6 que ya usa metadatosImagen.test.js.
const fuente = fs.readFileSync(path.join(__dirname, 'metadatosImagen.test.js'), 'utf8');
const fixture = (nombre) => Buffer.from(new RegExp(`const ${nombre} = Buffer\\.from\\('([^']+)'`).exec(fuente)[1], 'base64');

/** Inserta un comentario JPEG (COM) justo después de SOI: metadato sin orientación. */
function conComentario(jpeg) {
  const texto = Buffer.from('comentario con datos', 'latin1');
  const cab = Buffer.from([0xFF, 0xFE, 0, 0]);
  cab.writeUInt16BE(texto.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), cab, texto, jpeg.subarray(2)]);
}

module.exports = async function run() {
  const { results, check } = suite('Depurar imágenes guardadas (B42)', 'wtb42');

  const JPG = fixture('JPG_GPS');
  const PNG = fixture('PNG_GPS');
  const WEBP = fixture('WEBP_GPS');
  const jpgLimpio = depurarMetadatos(JPG, 'image/jpeg');

  check('mimeDeClave reconoce jpg, jpeg, png y webp sin importar mayúsculas',
    mimeDeClave('a.JPG') === 'image/jpeg' && mimeDeClave('a.jpeg') === 'image/jpeg' &&
    mimeDeClave('x/b.png') === 'image/png' && mimeDeClave('c.webp') === 'image/webp');
  check('mimeDeClave deja fuera lo que no es imagen depurable', mimeDeClave('a.gif') === null && mimeDeClave('sin-extension') === null);

  check('lee la orientación 6 del EXIF en JPEG, PNG y WebP',
    orientacionExif(JPG) === 6 && orientacionExif(PNG) === 6 && orientacionExif(WEBP) === 6,
    `${orientacionExif(JPG)} ${orientacionExif(PNG)} ${orientacionExif(WEBP)}`);
  check('una imagen sin EXIF no tiene orientación', orientacionExif(jpgLimpio) === null);

  check('una imagen ya limpia no se toca', clasificar(jpgLimpio, 'image/jpeg').estado === 'limpia');

  for (const [nombre, buf, mime] of [['JPEG', JPG, 'image/jpeg'], ['PNG', PNG, 'image/png'], ['WebP', WEBP, 'image/webp']]) {
    const c = clasificar(buf, mime);
    check(`${nombre} con GPS y orientación 6 se reporta y NO se reemplaza (se vería girada)`,
      c.estado === 'orientacion' && c.orientacion === 6 && !c.limpia, JSON.stringify({ estado: c.estado }));
  }

  const conCom = conComentario(jpgLimpio);
  const c = clasificar(conCom, 'image/jpeg');
  check('un JPEG con metadatos y sin orientación se reemplaza por su versión depurada',
    c.estado === 'con_metadatos' && Buffer.compare(c.limpia, jpgLimpio) === 0 && c.bytes_quitados === conCom.length - jpgLimpio.length,
    JSON.stringify({ estado: c.estado, bytes: c.bytes_quitados }));
  check('la versión depurada ya no lleva el comentario', !c.limpia.includes(Buffer.from('comentario con datos', 'latin1')));

  const roto = clasificar(Buffer.from('esto no es una imagen'), 'image/jpeg');
  check('un archivo que no se puede recorrer no se toca', roto.estado === 'no_analizable' && !roto.limpia);
  check('un JPEG truncado no se toca', clasificar(JPG.subarray(0, 60), 'image/jpeg').estado === 'no_analizable');

  return results;
};
