// HU-FOR-012: el foro se cierra a lectura anónima, con un matiz — el
// directorio (nombres y descripciones institucionales) queda abierto, el
// contenido (posts y comentarios de la comunidad) no. Cubre también el
// hallazgo del barrido de HU-MOD-001: GET /forum/posts/:id/comments ahora
// verifica que el post padre sea accesible antes de listar sus comentarios.
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('ForumPrivacidad', 'wtfpriv');

  await cleanup();
  try {
    const ana = await mkUser('ana');
    const beto = await mkUser('beto');
    const tAna = token(ana.id), tBeto = token(beto.id);

    const sub = await prisma.subForum.create({
      data: { name: 'wtfpriv zona', slug: 'wtfpriv-zona', creatorId: ana.id }
    });
    const post = await prisma.forumPost.create({
      data: { title: 'wtfpriv post', content: 'contenido', authorId: ana.id, subforumId: sub.id }
    });
    const comentario = await prisma.forumComment.create({
      data: { content: 'wtfpriv comentario', authorId: ana.id, postId: post.id }
    });

    console.log('\n  — El directorio queda abierto sin sesión —');
    let r = await call('GET', '/api/forum/subforums');
    check('GET /forum/subforums sin sesión → 200', r.status === 200, `(fue ${r.status})`);
    check('trae el subforo sembrado', r.data.subforums.some(s => s.id === sub.id));
    const enLista = r.data.subforums.find(s => s.id === sub.id);
    check('sin sesión, el subforo NO trae creator (ni siquiera el nombre)', enLista.creator === undefined, JSON.stringify(enLista.creator));

    r = await call('GET', `/api/forum/subforums/${sub.slug}`);
    check('GET /forum/subforums/:slug sin sesión → 200', r.status === 200, `(fue ${r.status})`);
    check('sin sesión, el detalle tampoco trae creator', r.data.creator === undefined, JSON.stringify(r.data.creator));

    console.log('\n  — Con sesión, el directorio sí trae quién lo creó —');
    r = await call('GET', '/api/forum/subforums', { tok: tAna });
    const enListaConSesion = r.data.subforums.find(s => s.id === sub.id);
    check('con sesión, el subforo trae creator.name', enListaConSesion.creator?.name != null, JSON.stringify(enListaConSesion.creator));

    console.log('\n  — El contenido exige sesión —');
    r = await call('GET', `/api/forum/subforums/${sub.slug}/posts`);
    check('GET /subforums/:slug/posts sin sesión → 401', r.status === 401, `(fue ${r.status})`);

    r = await call('GET', `/api/forum/posts/${post.id}`);
    check('GET /forum/posts/:id sin sesión → 401', r.status === 401, `(fue ${r.status})`);

    r = await call('GET', `/api/forum/posts/${post.id}/comments`);
    check('GET /forum/posts/:id/comments sin sesión → 401', r.status === 401, `(fue ${r.status})`);

    console.log('\n  — Con sesión, el contenido sí se puede leer —');
    r = await call('GET', `/api/forum/subforums/${sub.slug}/posts`, { tok: tAna });
    check('con sesión, listar posts del subforo → 200', r.status === 200, `(fue ${r.status})`);
    r = await call('GET', `/api/forum/posts/${post.id}`, { tok: tAna });
    check('con sesión, detalle del post → 200', r.status === 200, `(fue ${r.status})`);
    r = await call('GET', `/api/forum/posts/${post.id}/comments`, { tok: tAna });
    check('con sesión, comentarios del post → 200', r.status === 200 && r.data.comments.some(c => c.id === comentario.id), `(fue ${r.status})`);

    console.log('\n  — Hallazgo del barrido: comentarios de un post inaccesible —');
    const postOculto = await prisma.forumPost.create({
      data: { title: 'wtfpriv oculto', content: 'x', authorId: ana.id, subforumId: sub.id, hiddenAt: new Date() }
    });
    r = await call('GET', `/api/forum/posts/${postOculto.id}/comments`, { tok: tBeto });
    check('comentarios de un post oculto por moderación → 404 (antes se listaban igual)', r.status === 404, `(fue ${r.status})`);

    await call('POST', '/api/blocks', { tok: tAna, body: { userId: beto.id } });
    r = await call('GET', `/api/forum/posts/${post.id}/comments`, { tok: tBeto });
    check('comentarios de un post de alguien que te bloqueó → 404', r.status === 404, `(fue ${r.status})`);
  } finally {
    await cleanup();
  }

  return results;
};
