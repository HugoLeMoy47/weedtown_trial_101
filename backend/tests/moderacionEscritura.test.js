// HU-MOD-001: moderación también frena la escritura, no solo la lectura.
// Reaccionar, comentar y responder sobre contenido con hiddenAt != null
// responde 404 (misma indistinción que el resto: no confirma que existe),
// en las cuatro superficies. Editar/eliminar contenido PROPIO no se toca:
// quitarle a alguien la capacidad de borrar lo suyo porque moderación lo
// ocultó sería castigo, no moderación.
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('ModeracionEscritura', 'wtmodw');

  await cleanup();
  try {
    const ana = await mkUser('ana');
    const beto = await mkUser('beto');
    const tAna = token(ana.id), tBeto = token(beto.id);

    console.log('\n  — Superficie 1: post del feed —');
    const rPost = await call('POST', '/api/posts', { tok: tAna, body: { content: 'wtmodw post oculto', visibility: 'PUBLIC' } });
    await prisma.post.update({ where: { id: rPost.data.id }, data: { hiddenAt: new Date() } });

    let r = await call('POST', `/api/posts/${rPost.data.id}/reaction`, { tok: tBeto, body: { type: 'LIKE' } });
    check('reaccionar a un post oculto → 404', r.status === 404, `(fue ${r.status})`);
    r = await call('POST', `/api/posts/${rPost.data.id}/comment`, { tok: tBeto, body: { content: 'hola' } });
    check('comentar un post oculto → 404', r.status === 404, `(fue ${r.status})`);
    r = await call('PUT', `/api/posts/${rPost.data.id}`, { tok: tAna, body: { content: 'editado igual' } });
    check('la propia autora SÍ puede editar su post oculto (no es castigo)', r.status === 200, `(fue ${r.status})`);

    console.log('\n  — Superficie 2: comentario del feed —');
    const rPost2 = await call('POST', '/api/posts', { tok: tAna, body: { content: 'wtmodw post para comentario', visibility: 'PUBLIC' } });
    const rComentario = await call('POST', `/api/posts/${rPost2.data.id}/comment`, { tok: tAna, body: { content: 'wtmodw comentario oculto' } });
    await prisma.comment.update({ where: { id: rComentario.data.id }, data: { hiddenAt: new Date() } });

    r = await call('POST', `/api/comments/${rComentario.data.id}/reaction`, { tok: tBeto, body: { type: 'LIKE' } });
    check('reaccionar a un comentario oculto del feed → 404', r.status === 404, `(fue ${r.status})`);
    r = await call('PUT', `/api/comments/${rComentario.data.id}`, { tok: tAna, body: { content: 'editado igual' } });
    check('la propia autora SÍ puede editar su comentario oculto', r.status === 200, `(fue ${r.status})`);

    console.log('\n  — Superficies 3 y 4: post y comentario del foro —');
    const sub = await prisma.subForum.create({ data: { name: 'wtmodw zona', slug: 'wtmodw-zona', creatorId: ana.id } });
    const forumPost = await prisma.forumPost.create({
      data: { title: 'wtmodw post foro', content: 'x', authorId: ana.id, subforumId: sub.id }
    });
    const forumComentario = await prisma.forumComment.create({
      data: { content: 'wtmodw comentario foro', authorId: ana.id, postId: forumPost.id }
    });

    // Post del foro oculto: reaccionar y comentar (raíz) se bloquean.
    await prisma.forumPost.update({ where: { id: forumPost.id }, data: { hiddenAt: new Date() } });
    r = await call('POST', `/api/forum/posts/${forumPost.id}/reaction`, { tok: tBeto, body: { type: 'LIKE' } });
    check('reaccionar a un post del foro oculto → 404', r.status === 404, `(fue ${r.status})`);
    r = await call('POST', `/api/forum/posts/${forumPost.id}/comments`, { tok: tBeto, body: { content: 'hola' } });
    check('comentar un post del foro oculto → 404', r.status === 404, `(fue ${r.status})`);
    r = await call('POST', `/api/forum/posts/${forumPost.id}/comments`, {
      tok: tBeto, body: { content: 'respondo', parentId: forumComentario.id }
    });
    check(
      'responder dentro de un post del foro oculto también se bloquea (no solo si el comentario mismo lo está)',
      r.status === 404,
      `(fue ${r.status})`
    );
    r = await call('PUT', `/api/forum/posts/${forumPost.id}`, { tok: tAna, body: { content: 'editado igual' } });
    check('la propia autora SÍ puede editar su post del foro oculto', r.status === 200, `(fue ${r.status})`);

    // Reset: comentario oculto, post visible — cubre el caso "solo el comentario está oculto".
    await prisma.forumPost.update({ where: { id: forumPost.id }, data: { hiddenAt: null } });
    await prisma.forumComment.update({ where: { id: forumComentario.id }, data: { hiddenAt: new Date() } });

    r = await call('POST', `/api/forum/comments/${forumComentario.id}/reaction`, { tok: tBeto, body: { type: 'LIKE' } });
    check('reaccionar a un comentario del foro oculto → 404', r.status === 404, `(fue ${r.status})`);
    r = await call('POST', `/api/forum/posts/${forumPost.id}/comments`, {
      tok: tBeto, body: { content: 'respondo', parentId: forumComentario.id }
    });
    check('responder a un comentario del foro oculto (post visible) también se bloquea', r.status === 400, `(fue ${r.status})`);
    r = await call('PUT', `/api/forum/comments/${forumComentario.id}`, { tok: tAna, body: { content: 'editado igual' } });
    check('la propia autora SÍ puede editar su comentario del foro oculto', r.status === 200, `(fue ${r.status})`);
  } finally {
    await cleanup();
  }

  return results;
};
