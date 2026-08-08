// Ciclo 10A: el perfil ajeno exige sesión, se resuelve por handle, y trae
// debajo los posteos de esa persona respetando su visibilidad.
//
// Las tres cosas que de verdad hay que sostener aquí:
//   1. Sin sesión NO se resuelve, y un handle que existe se ve IGUAL que uno
//      inventado — si no, se puede mapear quién está en la red probando
//      handles.
//   2. El feed del perfil usa la MISMA regla de visibilidad que el feed
//      principal. Es la regla que ya se fugó una vez (H1, ciclo 7A) por tener
//      dos implementaciones.
//   3. Un bloqueo hace desaparecer perfil y posteos, sin distinguirse de "no
//      existe".
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('PerfilPorHandle', 'wtperfil');

  await cleanup();
  try {
    const ana = await mkUser('ana');       // la dueña del perfil
    const beto = await mkUser('beto');     // su amistad
    const caro = await mkUser('caro');     // con sesión, pero sin amistad
    const dani = await mkUser('dani');     // bloqueada por ana
    const tAna = token(ana.id), tBeto = token(beto.id), tCaro = token(caro.id), tDani = token(dani.id);

    await prisma.friendRequest.create({
      data: { requesterId: ana.id, addresseeId: beto.id, status: 'ACCEPTED', respondedAt: new Date() }
    });
    await prisma.block.create({ data: { blockerId: ana.id, blockedId: dani.id } });

    const publico = await prisma.post.create({
      data: { content: 'wtperfil publico', authorId: ana.id, visibility: 'PUBLIC' }
    });
    const soloAmigos = await prisma.post.create({
      data: { content: 'wtperfil solo amigos', authorId: ana.id, visibility: 'FRIENDS' }
    });
    const oculto = await prisma.post.create({
      data: { content: 'wtperfil oculto', authorId: ana.id, visibility: 'PUBLIC', hiddenAt: new Date() }
    });

    console.log('\n  — Sin sesión no hay perfil, y no se puede enumerar quién existe —');
    let r = await call('GET', `/api/profile/handle/${ana.handle}`);
    check('un handle que EXISTE, sin sesión → 401', r.status === 401, `(fue ${r.status})`);
    const rInventado = await call('GET', '/api/profile/handle/nadieconestehandle');
    check('un handle INVENTADO, sin sesión → 401', rInventado.status === 401, `(fue ${rInventado.status})`);
    check('y las dos respuestas son IDÉNTICAS (no se puede enumerar)',
      r.status === rInventado.status && JSON.stringify(r.data) === JSON.stringify(rInventado.data),
      `(${JSON.stringify(r.data)} vs ${JSON.stringify(rInventado.data)})`);
    r = await call('GET', `/api/profile/${ana.id}`);
    check('tampoco por id → 401', r.status === 401, `(fue ${r.status})`);
    r = await call('GET', `/api/posts/de/${ana.handle}`);
    check('los posteos del perfil tampoco se resuelven sin sesión → 401', r.status === 401, `(fue ${r.status})`);

    console.log('\n  — Con sesión, el handle resuelve al mismo perfil que el id —');
    const porHandle = await call('GET', `/api/profile/handle/${ana.handle}`, { tok: tCaro });
    const porId = await call('GET', `/api/profile/${ana.id}`, { tok: tCaro });
    check('por handle responde 200', porHandle.status === 200, `(fue ${porHandle.status})`);
    check('y es la misma persona que por id', porHandle.data.id === porId.data.id);
    const mayus = await call('GET', `/api/profile/handle/${ana.handle.toUpperCase()}`, { tok: tCaro });
    check('el handle no distingue mayúsculas', mayus.status === 200 && mayus.data.id === ana.id, `(fue ${mayus.status})`);
    r = await call('GET', '/api/profile/handle/nadieconestehandle', { tok: tCaro });
    check('con sesión, un handle inexistente → 404', r.status === 404, `(fue ${r.status})`);

    console.log('\n  — El feed del perfil respeta la visibilidad de cada posteo —');
    const ids = async (tok) => (await call('GET', `/api/posts/de/${ana.handle}`, { tok })).data.posts.map(p => p.id);
    const deAmiga = await ids(tBeto);
    check('una AMISTAD sí ve el posteo de solo-amigos', deAmiga.includes(soloAmigos.id));
    check('y también el público', deAmiga.includes(publico.id));
    const deExtrana = await ids(tCaro);
    check('quien NO es amistad no ve el de solo-amigos', !deExtrana.includes(soloAmigos.id));
    check('pero sí ve el público', deExtrana.includes(publico.id));
    const propios = await ids(tAna);
    check('la propia autora ve su posteo de solo-amigos', propios.includes(soloAmigos.id));

    console.log('\n  — Lo oculto por moderación no aparece para NADIE, ni para su autora —');
    check('no lo ve una extraña', !deExtrana.includes(oculto.id));
    check('no lo ve su amistad', !deAmiga.includes(oculto.id));
    check('no lo ve la propia autora', !propios.includes(oculto.id));

    console.log('\n  — Con bloqueo de por medio, no hay perfil ni posteos —');
    r = await call('GET', `/api/profile/handle/${ana.handle}`, { tok: tDani });
    check('la bloqueada recibe 404 en el perfil', r.status === 404, `(fue ${r.status})`);
    r = await call('GET', `/api/posts/de/${ana.handle}`, { tok: tDani });
    check('y 404 en sus posteos', r.status === 404, `(fue ${r.status})`);
    const rNoExiste = await call('GET', '/api/posts/de/nadieconestehandle', { tok: tDani });
    check('el 404 del bloqueo es idéntico al de "no existe"',
      r.status === rNoExiste.status && JSON.stringify(r.data) === JSON.stringify(rNoExiste.data));
    r = await call('GET', `/api/profile/handle/${dani.handle}`, { tok: tAna });
    check('y el bloqueo corre para los dos lados', r.status === 404, `(fue ${r.status})`);

    console.log('\n  — La paginación devuelve la forma de siempre —');
    r = await call('GET', `/api/posts/de/${ana.handle}`, { tok: tCaro });
    check('trae page, totalPages y total',
      r.data.page === 1 && typeof r.data.totalPages === 'number' && typeof r.data.total === 'number');
  } finally {
    await cleanup();
  }
  return results;
};
