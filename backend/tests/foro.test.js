// Bloqueo aplicado a los foros.
// Importa cubrir los tres órdenes por separado: "Relevante" (hot) no usa el
// `where` de Prisma sino una consulta SQL cruda con el decaimiento temporal, así
// que su filtro de bloqueados es código distinto al de "Nuevo" y "Top".
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Foros', 'wtforo');

  await cleanup();
  try {
    const ana = await mkUser('ana');
    const beto = await mkUser('beto');
    const tAna = token(ana.id), tBeto = token(beto.id);

    const sub = await prisma.subForum.create({
      data: { name: 'wtforo zona', slug: 'wtforo-zona', creatorId: ana.id }
    });
    const postBeto = await prisma.forumPost.create({
      data: { title: 'wtforo post de beto', content: 'contenido', authorId: beto.id, subforumId: sub.id, score: 5 }
    });
    const postAna = await prisma.forumPost.create({
      data: { title: 'wtforo post de ana', content: 'contenido', authorId: ana.id, subforumId: sub.id, score: 3 }
    });
    const comBeto = await prisma.forumComment.create({
      data: { content: 'comentario de beto', authorId: beto.id, postId: postAna.id }
    });

    const listar = async (sort, tok) =>
      (await call('GET', `/api/forum/subforums/${sub.slug}/posts?sort=${sort}`, { tok })).data.posts.map(p => p.id);

    console.log('\n  — Antes de bloquear —');
    for (const sort of ['hot', 'new', 'top']) {
      check(`orden "${sort}" muestra el post de Beto`, (await listar(sort, tAna)).includes(postBeto.id));
    }
    let r = await call('GET', `/api/forum/posts/${postAna.id}/comments`, { tok: tAna });
    check('el comentario de Beto se ve en el hilo', r.data.comments.some(c => c.id === comBeto.id));

    console.log('\n  — Después de bloquear —');
    await call('POST', '/api/blocks', { tok: tAna, body: { userId: beto.id } });

    for (const sort of ['hot', 'new', 'top']) {
      const ids = await listar(sort, tAna);
      check(`orden "${sort}" oculta el post de Beto`, !ids.includes(postBeto.id));
      check(`orden "${sort}" conserva el post propio`, ids.includes(postAna.id));
    }
    // HU-FOR-012: el contenido del foro (a diferencia del directorio) exige
    // sesión — antes de este ciclo, este mismo GET sin token respondía 200.
    r = await call('GET', `/api/forum/subforums/${sub.slug}/posts?sort=hot`);
    check('sin sesión, listar posts del subforo → 401', r.status === 401, `(fue ${r.status})`);

    r = await call('GET', `/api/forum/posts/${postBeto.id}`, { tok: tAna });
    check('el detalle del post de Beto es 404 para Ana', r.status === 404, `(fue ${r.status})`);

    r = await call('GET', `/api/forum/posts/${postAna.id}/comments`, { tok: tAna });
    check('el comentario de Beto desaparece del hilo', !r.data.comments.some(c => c.id === comBeto.id));

    r = await call('POST', `/api/forum/posts/${postBeto.id}/comments`, { tok: tAna, body: { content: 'hola' } });
    check('Ana no puede comentar el post de Beto → 404', r.status === 404, `(fue ${r.status})`);
    r = await call('POST', `/api/forum/posts/${postAna.id}/comments`, { tok: tBeto, body: { content: 'respondo' } });
    check('Beto no puede comentar el post de Ana → 404', r.status === 404, `(fue ${r.status})`);
    r = await call('POST', `/api/forum/posts/${postAna.id}/comments`, {
      tok: tBeto, body: { content: 'respondo', parentId: comBeto.id }
    });
    check('Beto tampoco puede responder dentro del hilo → 404', r.status === 404, `(fue ${r.status})`);

    // En el foro la reacción es el voto (±1): bloquear también quita el voto.
    r = await call('POST', `/api/forum/posts/${postBeto.id}/reaction`, { tok: tAna, body: { type: 'MOLESTA' } });
    check('Ana no puede votar el post de Beto → 404', r.status === 404, `(fue ${r.status})`);
    const fresh = await prisma.forumPost.findUnique({ where: { id: postBeto.id }, select: { score: true } });
    check('el puntaje de Beto quedó intacto', fresh.score === 5, `(es ${fresh.score})`);
    r = await call('POST', `/api/forum/comments/${comBeto.id}/reaction`, { tok: tAna, body: { type: 'MOLESTA' } });
    check('Ana no puede votar el comentario de Beto → 404', r.status === 404, `(fue ${r.status})`);
  } finally {
    await cleanup();
  }

  return results;
};
