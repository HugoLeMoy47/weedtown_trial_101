// Almacenamiento de imágenes y borrado de archivos.
//
// Cubre el driver local de punta a punta (guardar, resolver URL, borrar) y la
// integración real: subir una imagen por la API, colgarla de un post, borrar el
// post y comprobar que el archivo ya no está en disco. Antes esto no pasaba —
// la línea que parecía limpiarlo borraba filas de Media por `postId`, un campo
// que la subida nunca llenaba.
const fs = require('fs');
const path = require('path');
const { suite } = require('./lib');

const storage = require('../src/lib/storage');

const UPLOADS = path.join(__dirname, '..', 'uploads');
const existe = (key) => fs.existsSync(path.join(UPLOADS, key));

// PNG de 1×1 píxel, suficiente para que multer lo acepte como image/png
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Almacenamiento', 'wtfile');

  await cleanup();
  try {
    console.log('\n  — Driver local —');
    check(`el driver activo es "local" (es el default)`, storage.driver === 'local', `(es ${storage.driver})`);

    const guardada = await storage.save({ buffer: PNG_1PX, mimetype: 'image/png', ext: '.png' });
    check('save() escribe el archivo en disco', existe(guardada.key));
    check('save() devuelve una URL que apunta a /uploads', /\/uploads\/[a-f0-9]{32}\.png$/.test(guardada.url), `(${guardada.url})`);
    check('el nombre es aleatorio, no el original', /^[a-f0-9]{32}\.png$/.test(guardada.key), `(${guardada.key})`);

    const borrada = await storage.removeByUrl(guardada.url);
    check('removeByUrl() borra el archivo', borrada && !existe(guardada.key));
    check('borrar dos veces no revienta', (await storage.removeByUrl(guardada.url)) === false);

    console.log('\n  — No toca lo que no es suyo —');
    const ajena = await storage.save({ buffer: PNG_1PX, mimetype: 'image/png', ext: '.png' });
    check('una URL de otro dominio se ignora', (await storage.removeByUrl('https://otro-sitio.mx/foto.png')) === false);
    check('una URL vacía se ignora', (await storage.removeByUrl(null)) === false);
    check('un intento de path traversal se ignora',
      (await storage.removeByUrl('http://localhost:4000/uploads/../../app.js')) === false);
    check('el archivo legítimo sigue intacto tras esos intentos', existe(ajena.key));
    await storage.removeByUrl(ajena.url);

    console.log('\n  — Subida por la API —');
    const ana = await mkUser('ana');
    const tAna = token(ana.id);

    async function subir(tok) {
      const form = new FormData();
      form.append('image', new Blob([PNG_1PX], { type: 'image/png' }), 'foto.png');
      const res = await fetch(`http://localhost:${process.env.PORT || 4010}/api/media/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}` },
        body: form
      });
      return { status: res.status, data: await res.json().catch(() => null) };
    }

    let r = await subir(tAna);
    check('POST /api/media/upload → 200', r.status === 200, `(fue ${r.status})`);
    const url = r.data?.url;
    const key = url ? url.split('/').pop() : null;
    check('el archivo subido existe en disco', Boolean(key) && existe(key));
    const enMedia = await prisma.media.count({ where: { url } });
    check('quedó registrado en la tabla Media', enMedia === 1, `(hay ${enMedia})`);

    const sinSesion = await fetch(`http://localhost:${process.env.PORT || 4010}/api/media/upload`, { method: 'POST' });
    check('subir sin sesión → 401', sinSesion.status === 401, `(fue ${sinSesion.status})`);

    console.log('\n  — Borrar contenido borra su archivo —');
    const post = await prisma.post.create({ data: { content: 'wtfile con imagen', image: url, authorId: ana.id } });

    // Una segunda imagen colgada de un comentario del mismo post
    r = await subir(tAna);
    const urlComentario = r.data.url;
    const keyComentario = urlComentario.split('/').pop();
    await prisma.comment.create({ data: { content: 'wtfile comentario', image: urlComentario, postId: post.id, authorId: ana.id } });

    check('ambos archivos están antes de borrar', existe(key) && existe(keyComentario));

    const del = await call('DELETE', `/api/posts/${post.id}`, { tok: tAna });
    check('DELETE /api/posts/:id → 200', del.status === 200, `(fue ${del.status})`);
    check('el archivo del post desapareció del disco', !existe(key));
    check('el archivo del comentario también', !existe(keyComentario));
    const mediaHuerfana = await prisma.media.count({ where: { url: { in: [url, urlComentario] } } });
    check('no quedaron filas huérfanas en Media', mediaHuerfana === 0, `(quedan ${mediaHuerfana})`);

    console.log('\n  — Borrado suave en el foro —');
    const sub = await prisma.subForum.create({ data: { name: 'wtfile zona', slug: 'wtfile-zona', creatorId: ana.id } });
    const fp = await prisma.forumPost.create({ data: { title: 'wtfile hilo', content: 'x', authorId: ana.id, subforumId: sub.id } });
    r = await subir(tAna);
    const urlForo = r.data.url;
    const keyForo = urlForo.split('/').pop();
    const padre = await prisma.forumComment.create({ data: { content: 'padre', image: urlForo, postId: fp.id, authorId: ana.id } });
    await prisma.forumComment.create({ data: { content: 'respuesta', postId: fp.id, authorId: ana.id, parentId: padre.id, depth: 1 } });

    const softDel = await call('DELETE', `/api/forum/comments/${padre.id}`, { tok: tAna });
    check('el comentario con respuestas se borra en suave', softDel.data?.soft === true);
    check('aun así su archivo se elimina', !existe(keyForo));
  } finally {
    await cleanup();
  }

  return results;
};
