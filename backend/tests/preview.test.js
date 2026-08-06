// HU-SHR-001/003 (ciclo 7B): GET /api/posts/:id/preview, la ficha Open Graph
// que consume el Worker de Cloudflare en nombre de un rastreador anónimo.
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Preview', 'wtprev');

  await cleanup();
  try {
    const ana = await mkUser('ana', { email: 'wtprev-ana@ejemplo.test' });
    const tAna = token(ana.id);

    console.log('\n  — Posteo público: 200 con los campos esperados —');
    const contenidoLargo = 'Este es un posteo bastante largo que definitivamente supera los setenta caracteres del extracto del título';
    const rPost = await prisma.post.create({
      data: { content: contenidoLargo, visibility: 'PUBLIC', authorId: ana.id }
    });
    let r = await call('GET', `/api/posts/${rPost.id}/preview`);
    check('PUBLIC sin imagen propia → 200', r.status === 200, `(fue ${r.status})`);
    check('trae Cache-Control explícito', /max-age/.test(r.headers.get('cache-control') || ''), r.headers.get('cache-control'));
    check('titulo se corta a ~70 caracteres (con margen por la elipsis)', r.data.titulo.length <= 72, `titulo="${r.data.titulo}" (${r.data.titulo.length})`);
    check('titulo termina en elipsis (se cortó)', r.data.titulo.endsWith('…'), r.data.titulo);
    check('titulo se cortó en palabra completa, no a la mitad', contenidoLargo.startsWith(r.data.titulo.slice(0, -1)), r.data.titulo);
    check('descripcion es la invitación fija, no contenido del posteo', r.data.descripcion.includes('WeedTown') && !r.data.descripcion.includes(contenidoLargo));
    check('handleAutor es el handle', r.data.handleAutor === ana.handle);
    check(
      'la respuesta solo trae los campos de la ficha — nunca id/email/instance del autor',
      Object.keys(r.data).sort().join(',') === ['descripcion', 'handleAutor', 'imagen', 'imagenAlt', 'tieneImagen', 'titulo'].join(','),
      Object.keys(r.data).join(',')
    );
    check('tieneImagen es false (no subió imagen)', r.data.tieneImagen === false);
    check('imagen es una URL absoluta (imagen de campaña, determinista)', /^https?:\/\//.test(r.data.imagen));
    check('imagenAlt viene poblado cuando la imagen es de campaña', typeof r.data.imagenAlt === 'string' && r.data.imagenAlt.length > 0);

    console.log('\n  — Selección de imagen de campaña es determinista por id —');
    let r2 = await call('GET', `/api/posts/${rPost.id}/preview`);
    check('la misma id siempre devuelve la misma imagen', r2.data.imagen === r.data.imagen);

    console.log('\n  — Posteo con imagen propia: esa manda, sin alt de campaña —');
    const rPostImg = await prisma.post.create({
      data: { content: 'posteo con imagen propia', visibility: 'PUBLIC', authorId: ana.id, image: 'https://ejemplo.test/mi-imagen.jpg' }
    });
    r = await call('GET', `/api/posts/${rPostImg.id}/preview`);
    check('tieneImagen true y usa la propia', r.status === 200 && r.data.tieneImagen === true && r.data.imagen === 'https://ejemplo.test/mi-imagen.jpg');
    check('imagenAlt es null con imagen propia', r.data.imagenAlt === null);

    console.log('\n  — Título corto: no se trunca ni se le pega una elipsis —');
    const rPostCorto = await prisma.post.create({
      data: { content: 'posteo corto', visibility: 'PUBLIC', authorId: ana.id }
    });
    r = await call('GET', `/api/posts/${rPostCorto.id}/preview`);
    check('titulo corto sale igual, sin elipsis', r.data.titulo === 'posteo corto');

    console.log('\n  — Inyección de HTML: el contenido sale escapado (Trampa 1) —');
    const rPostInyeccion = await prisma.post.create({
      data: { content: '"><script>alert(1)</script>', visibility: 'PUBLIC', authorId: ana.id }
    });
    r = await call('GET', `/api/posts/${rPostInyeccion.id}/preview`);
    check(
      'el título no contiene la etiqueta <script> cruda',
      r.status === 200 && !r.data.titulo.includes('<script>') && !r.data.titulo.includes('"><'),
      r.data.titulo
    );
    check(
      'el título trae las entidades escapadas',
      r.data.titulo.includes('&quot;&gt;&lt;script&gt;') || r.data.titulo.includes('&lt;script&gt;'),
      r.data.titulo
    );

    console.log('\n  — Fuga de contenido privado (Trampa 1 del plan): siempre 404, nunca 403 —');
    const rFriends = await prisma.post.create({
      data: { content: 'post solo amigos', visibility: 'FRIENDS', authorId: ana.id }
    });
    r = await call('GET', `/api/posts/${rFriends.id}/preview`);
    check('FRIENDS → 404', r.status === 404, `(fue ${r.status})`);

    const rOculto = await prisma.post.create({
      data: { content: 'post que se oculta', visibility: 'PUBLIC', authorId: ana.id, hiddenAt: new Date() }
    });
    r = await call('GET', `/api/posts/${rOculto.id}/preview`);
    check('oculto por moderación (hiddenAt) → 404', r.status === 404, `(fue ${r.status})`);

    const beto = await mkUser('beto', { suspendedUntil: new Date(Date.now() + 3600_000) });
    const rSuspendido = await prisma.post.create({
      data: { content: 'post de alguien suspendido', visibility: 'PUBLIC', authorId: beto.id }
    });
    r = await call('GET', `/api/posts/${rSuspendido.id}/preview`);
    check('autor suspendido → 404', r.status === 404, `(fue ${r.status})`);

    r = await call('GET', '/api/posts/999999999/preview');
    check('id inexistente → 404', r.status === 404, `(fue ${r.status})`);

    r = await call('GET', '/api/posts/abc/preview');
    check('id no numérico → 404 (nunca 500)', r.status === 404, `(fue ${r.status})`);

    console.log('\n  — Sin sesión y con sesión responden igual: la ruta no usa optionalAuth —');
    r = await call('GET', `/api/posts/${rPost.id}/preview`, { tok: tAna });
    check('con sesión también 200, mismo contenido', r.status === 200 && r.data.handleAutor === ana.handle);
  } finally {
    await cleanup();
  }

  return results;
};
