// Ciclo 10D: navegar por hashtag, tendencias en moderación y diccionario
// gestionable.
//
// Dos cosas distintas que hay que sostener:
//   · La VISTA por tag respeta la visibilidad exactamente igual que el feed.
//     Es la regla que ya se fugó una vez (H1, ciclo 7A) por tener dos
//     implementaciones.
//   · Las TENDENCIAS amplifican, así que no cuentan lo oculto, ni lo de cuentas
//     suspendidas, ni lo que viene de una sola persona, ni las palabras del
//     diccionario.
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('HashtagsAgrupacion', 'wthtag');

  await cleanup();
  try {
    const ana = await mkUser('ana');
    const beto = await mkUser('beto');    // amistad de ana
    const caro = await mkUser('caro');    // con sesión, sin amistad
    const admin = await mkUser('admin');
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    const tAna = token(ana.id), tBeto = token(beto.id), tCaro = token(caro.id), tAdmin = token(admin.id);
    await prisma.friendRequest.create({
      data: { requesterId: ana.id, addresseeId: beto.id, status: 'ACCEPTED', respondedAt: new Date() }
    });

    const TAG = 'wthtagtema';
    const conTag = async (autorId, extra = {}) => prisma.post.create({
      data: {
        content: 'wthtag contenido', authorId: autorId, ...extra,
        hashtags: { create: [{ hashtag: { connectOrCreate: { where: { tag: TAG }, create: { tag: TAG, displayTag: 'WtHtagTema' } } } }] }
      }
    });

    const publico = await conTag(ana.id, { visibility: 'PUBLIC' });
    const soloAmigos = await conTag(ana.id, { visibility: 'FRIENDS' });
    const oculto = await conTag(ana.id, { visibility: 'PUBLIC', hiddenAt: new Date() });

    const idsPara = async (tok) => {
      const r = await call('GET', `/api/posts/hashtag/${TAG}`, { tok });
      return r.status === 200 ? r.data.posts.map(p => p.id) : { status: r.status };
    };

    console.log('\n  — La vista por tag respeta la visibilidad, igual que el feed —');
    let ids = await idsPara(tBeto);
    check('la amistad ve el posteo de solo-amigos', ids.includes(soloAmigos.id));
    ids = await idsPara(tCaro);
    check('quien no es amistad NO lo ve', !ids.includes(soloAmigos.id));
    check('pero sí ve el público', ids.includes(publico.id));
    check('lo oculto por moderación no aparece', !ids.includes(oculto.id));
    ids = await idsPara(tAna);
    check('ni siquiera para su propia autora', !ids.includes(oculto.id));

    console.log('\n  — Detalles de la vista —');
    let r = await call('GET', `/api/posts/hashtag/${TAG}`, { tok: tCaro });
    check('devuelve la llave y la grafía', r.data.hashtag.tag === TAG && r.data.hashtag.displayTag === 'WtHtagTema');
    r = await call('GET', `/api/posts/hashtag/${TAG.toUpperCase()}`, { tok: tCaro });
    check('no distingue mayúsculas', r.status === 200, `(fue ${r.status})`);
    r = await call('GET', `/api/posts/hashtag/${TAG}`);
    check('sin sesión no se resuelve → 401', r.status === 401, `(fue ${r.status})`);
    r = await call('GET', '/api/posts/hashtag/noexisteestetema', { tok: tCaro });
    check('un tag inexistente → 404', r.status === 404, `(fue ${r.status})`);

    console.log('\n  — El diccionario impide indexar, sin tocar el texto —');
    r = await call('POST', '/api/admin/diccionario', { tok: tAdmin, body: { palabra: 'wthtagbasura' } });
    check('un ADMIN puede agregar una palabra → 201', r.status === 201, `(fue ${r.status})`);
    r = await call('POST', '/api/posts', { tok: tAna, body: { content: 'wthtag prueba', hashtags: ['wthtagbasura', 'wthtagbueno'] } });
    check('el posteo se crea igual', r.status === 200, `(fue ${r.status})`);
    const tags = (r.data.hashtags || []).map(h => h.hashtag.tag);
    check('la palabra del diccionario NO se indexa', !tags.includes('wthtagbasura'), `(fue ${tags})`);
    check('la otra sí', tags.includes('wthtagbueno'));
    check('y el contenido del posteo queda intacto', r.data.content === 'wthtag prueba');

    console.log('\n  — Queda en la bitácora de moderación —');
    r = await call('GET', '/api/admin/log', { tok: tAdmin });
    const accion = (r.data.acciones || []).find(a => a.type === 'AGREGAR_PALABRA_DESCARTADA');
    check('la acción se registró', Boolean(accion));
    check('con la palabra en la nota y el objetivo HASHTAG',
      accion?.note === 'wthtagbasura' && accion?.targetType === 'HASHTAG',
      `(${accion?.note}/${accion?.targetType})`);

    console.log('\n  — Quitar una palabra la vuelve indexable —');
    r = await call('GET', '/api/admin/diccionario', { tok: tAdmin });
    const fila = r.data.palabras.find(p => p.palabra === 'wthtagbasura');
    check('aparece en el listado del diccionario', Boolean(fila));
    r = await call('DELETE', `/api/admin/diccionario/${fila.id}`, { tok: tAdmin });
    check('se puede quitar', r.status === 200, `(fue ${r.status})`);
    r = await call('POST', '/api/posts', { tok: tAna, body: { content: 'wthtag otra', hashtags: ['wthtagbasura'] } });
    check('ahora sí se indexa', (r.data.hashtags || []).some(h => h.hashtag.tag === 'wthtagbasura'));

    console.log('\n  — Tendencias: el umbral es de CUENTAS, no de posteos —');
    r = await call('GET', '/api/admin/tendencias?dias=7', { tok: tAdmin });
    check('un ADMIN puede consultarlas', r.status === 200, `(fue ${r.status})`);
    const umbral = r.data.umbralCuentas;
    check('declara su umbral', typeof umbral === 'number' && umbral > 1);
    const enTendencias = (data, tag) => (data.tendencias || []).some(t => t.tag === tag);
    check('un tema de UNA sola cuenta no alcanza el umbral', !enTendencias(r.data, TAG));
    check('y nunca viaja quién publicó qué',
      (r.data.tendencias || []).every(t => t.authorId === undefined && t.autor === undefined));

    // Suficientes cuentas distintas para cruzar el umbral
    const extras = [];
    for (let i = 0; i < umbral + 1; i++) extras.push(await mkUser(`t${i}`));
    for (const u of extras) await conTag(u.id, { visibility: 'PUBLIC' });
    r = await call('GET', '/api/admin/tendencias?dias=7', { tok: tAdmin });
    check(`con ${umbral + 1} cuentas distintas sí aparece`, enTendencias(r.data, TAG));

    console.log('\n  — Lo oculto y lo suspendido no alimentan una tendencia —');
    // Suspender a todas las cuentas del tema debe sacarlo de tendencias
    await prisma.user.updateMany({
      where: { id: { in: extras.map(u => u.id) } },
      data: { suspendedUntil: new Date(Date.now() + 86400000) }
    });
    r = await call('GET', '/api/admin/tendencias?dias=7', { tok: tAdmin });
    check('con sus cuentas suspendidas, el tema cae del umbral', !enTendencias(r.data, TAG));
    await prisma.user.updateMany({ where: { id: { in: extras.map(u => u.id) } }, data: { suspendedUntil: null } });

    console.log('\n  — Una palabra del diccionario no aparece en tendencias aunque tenga filas viejas —');
    await call('POST', '/api/admin/diccionario', { tok: tAdmin, body: { palabra: TAG } });
    r = await call('GET', '/api/admin/tendencias?dias=7', { tok: tAdmin });
    check('desaparece de la nube', !enTendencias(r.data, TAG));
    // ...pero NO se destruyó nada: las filas y el vínculo con los posteos siguen
    const sigue = await prisma.hashtag.findUnique({ where: { tag: TAG }, select: { id: true } });
    check('y sin embargo la fila del hashtag NO se borró (nada se destruye)', Boolean(sigue));

    console.log('\n  — El diccionario es solo para moderación —');
    r = await call('GET', '/api/admin/diccionario', { tok: tCaro });
    check('una cuenta normal no puede leerlo → 403', r.status === 403, `(fue ${r.status})`);
    r = await call('GET', '/api/admin/tendencias?dias=7', { tok: tCaro });
    check('ni consultar tendencias → 403', r.status === 403, `(fue ${r.status})`);
  } finally {
    await prisma.palabraDescartada.deleteMany({ where: { palabra: { startsWith: 'wthtag' } } });
    await cleanup();
  }
  return results;
};
