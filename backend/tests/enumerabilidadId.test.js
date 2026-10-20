// Ciclo 17: cierra los hallazgos B-1, B-2 y B-3 del barrido 16B.
//
// La invariante (profileRoutes.js): ENUMERABILIDAD ≠ DIRECCIONABILIDAD. El
// handle exacto es la credencial; todo lo demás —búsquedas parciales, por
// nombre, por id secuencial— respeta la red de quien busca y `perfilPublico`.
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('EnumerabilidadId', 'wtenu');

  await cleanup();
  try {
    const ana = await mkUser('ana');         // quien busca
    const beto = await mkUser('beto');       // amigo de ana
    const caro = await mkUser('caro');       // amiga de beto: segundo grado de ana, perfil cerrado
    const dani = await mkUser('dani');       // desconocida, perfil cerrado, sin posteos
    const eli = await mkUser('eli');         // desconocida con posteo PÚBLICO
    const fer = await mkUser('fer', { perfilPublico: true }); // desconocida encontrable
    const gus = await mkUser('gus');         // bloqueada por ana
    const hana = await mkUser('hana');       // cuenta borrada
    const ivan = await mkUser('ivan');       // cuenta suspendida
    const jose = await mkUser('jose');       // desconocido con un posteo público OCULTO por moderación
    // El nombre de las cuentas de prueba es idéntico a su handle; para probar la
    // búsqueda por NOMBRE, dani necesita uno distinto.
    await prisma.user.update({ where: { id: dani.id }, data: { name: 'Danielita Reservadísima' } });
    const tAna = token(ana.id);
    const amistad = (a, b) => prisma.friendRequest.create({
      data: { requesterId: a.id, addresseeId: b.id, status: 'ACCEPTED', respondedAt: new Date() }
    });
    await amistad(ana, beto);
    await amistad(beto, caro);
    await prisma.post.create({ data: { content: 'wtenu publico', authorId: eli.id, visibility: 'PUBLIC' } });
    await prisma.post.create({ data: { content: 'wtenu oculto', authorId: jose.id, visibility: 'PUBLIC', hiddenAt: new Date() } });
    await prisma.block.create({ data: { blockerId: ana.id, blockedId: gus.id } });
    await prisma.user.update({ where: { id: hana.id }, data: { deletedAt: new Date() } });
    await prisma.user.update({ where: { id: ivan.id }, data: { suspendedUntil: new Date(Date.now() + 7 * 86400000) } });

    const buscar = async (q) => (await call('GET', `/api/chat/users?q=${encodeURIComponent(q)}`, { tok: tAna })).data?.users || [];

    console.log('\n  — B-1: GET /api/chat/users deja de enumerar la plataforma —');
    check('búsqueda PARCIAL: una desconocida con perfil cerrado NO aparece', !(await buscar(dani.handle.slice(0, 9))).some(u => u.id === dani.id));
    check('búsqueda por NOMBRE: tampoco', !(await buscar('Reservadísima')).some(u => u.id === dani.id));
    check('handle EXACTO: sí aparece (el handle es la credencial)', (await buscar(dani.handle)).some(u => u.id === dani.id));
    check('handle exacto con arroba y mayúsculas también', (await buscar(`@${dani.handle.toUpperCase()}`)).some(u => u.id === dani.id));
    check('un amigo directo aparece por búsqueda parcial', (await buscar(beto.handle.slice(0, 9))).some(u => u.id === beto.id));
    check('un amigo-de-amigo con perfil cerrado SÍ aparece (deliberado)', (await buscar(caro.handle.slice(0, 9))).some(u => u.id === caro.id));
    check('quien activó perfilPublico aparece por búsqueda parcial', (await buscar(fer.handle.slice(0, 9))).some(u => u.id === fer.id));
    check('una bloqueada no aparece ni por handle exacto', !(await buscar(gus.handle)).some(u => u.id === gus.id));
    check('una cuenta borrada no aparece ni por handle exacto', !(await buscar(hana.handle)).some(u => u.id === hana.id));
    check('una cuenta suspendida no aparece ni por handle exacto', !(await buscar(ivan.handle)).some(u => u.id === ivan.id));
    const hallada = (await buscar(fer.handle))[0] || {};
    check('solo identidad: ni confirmacionesLectura ni mostrarEnLinea',
      Object.keys(hallada).sort().join(',') === 'avatar,displayName,handle,id,name',
      JSON.stringify(Object.keys(hallada)));

    console.log('\n  — B-3: GET /api/profile/:id ya no recorre la plataforma por ids —');
    const porId = (u) => call('GET', `/api/profile/${u.id}`, { tok: tAna });
    const inexistente = await call('GET', '/api/profile/2147483000', { tok: tAna });
    let r = await porId(dani);
    check('desconocida con perfil cerrado y sin posteos → 404', r.status === 404, `(fue ${r.status})`);
    check('...idéntico a un id que no existe', r.status === inexistente.status && JSON.stringify(r.data) === JSON.stringify(inexistente.data));
    r = await porId(jose);
    check('un posteo público OCULTO por moderación no cuenta como visibilidad → 404', r.status === 404, `(fue ${r.status})`);
    r = await porId(eli);
    check('con un posteo PÚBLICO suyo, su identidad ya es pública → 200 (el CTA bajo el posteo)', r.status === 200 && r.data?.id === eli.id, `(fue ${r.status})`);
    r = await porId(fer);
    check('con perfilPublico → 200', r.status === 200, `(fue ${r.status})`);
    r = await porId(beto);
    check('un amigo → 200', r.status === 200, `(fue ${r.status})`);
    r = await porId(caro);
    check('un amigo-de-amigo → 200 (deliberado)', r.status === 200, `(fue ${r.status})`);
    const kira = await mkUser('kira');
    await prisma.friendRequest.create({ data: { requesterId: kira.id, addresseeId: ana.id, status: 'PENDING' } });
    r = await porId(kira);
    check('una solicitud pendiente entre ambas es una relación → 200', r.status === 200, `(fue ${r.status})`);
    r = await porId(ana);
    check('el propio perfil → 200', r.status === 200, `(fue ${r.status})`);
    r = await call('GET', `/api/profile/handle/${dani.handle}`, { tok: tAna });
    check('...y la MISMA cuenta que el id niega SÍ responde por handle (direccionable)', r.status === 200 && r.data?.id === dani.id, `(fue ${r.status})`);

    console.log('\n  — B-2: POST /api/chat/conversations —');
    r = await call('POST', '/api/chat/conversations', { tok: tAna, body: { userId: hana.id } });
    check('una cuenta borrada → 404', r.status === 404, `(fue ${r.status})`);
    r = await call('POST', '/api/chat/conversations', { tok: tAna, body: { userId: ivan.id } });
    check('una cuenta suspendida → 404', r.status === 404, `(fue ${r.status})`);
    const rInexistente = await call('POST', '/api/chat/conversations', { tok: tAna, body: { userId: 2147483000 } });
    check('...igual que un id que no existe', r.status === rInexistente.status && JSON.stringify(r.data) === JSON.stringify(rInexistente.data));
    r = await call('POST', '/api/chat/conversations', { tok: tAna, body: { userId: beto.id } });
    check('control: una cuenta normal sigue abriendo chat', r.status === 200, `(fue ${r.status})`);
  } finally {
    await cleanup();
  }
  return results;
};
