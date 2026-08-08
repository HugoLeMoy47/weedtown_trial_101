// Identidad desacoplada del proveedor y handle propio de WeedTown.
//
// Etapa 1 del plan de autenticación. No agrega proveedores: prepara el terreno
// para que agregarlos sea escribir un archivo, no rehacer el modelo.
//
// Cubre las tres propiedades que hacen que la etapa 2 sea barata:
//   1. Una cuenta puede tener varias identidades, y cualquiera lleva a ella.
//   2. El identificador público es de la plataforma, no del proveedor.
//   3. Nadie puede tomar un handle reservado ni el de otra persona.
const { suite } = require('./lib');
const handleLib = require('../src/lib/handle');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Identidad', 'wtid');

  await cleanup();
  try {
    console.log('\n  — Reglas del handle —');
    check('acepta uno normal', handleLib.esValido('hugolemoy'));
    check('acepta números y guion bajo', handleLib.esValido('hugo_99'));
    check('rechaza mayúsculas', !handleLib.esValido('HugoLeMoy'));
    check('rechaza espacios y acentos', !handleLib.esValido('hugo lemoy') && !handleLib.esValido('josé'));
    check('rechaza empezar con guion bajo', !handleLib.esValido('_hugo'));
    check('rechaza menos de 3 caracteres', !handleLib.esValido('ab'));
    check('rechaza más de 20', !handleLib.esValido('a'.repeat(21)));
    check('rechaza reservados', !handleLib.esValido('moderacion') && !handleLib.esValido('weedtown'));

    check('normaliza acentos y mayúsculas', handleLib.normalizar('Hügo LeMoy!') === 'hugolemoy');
    check('normalizar no inventa longitud', handleLib.normalizar('!!!') === '');

    console.log('\n  — Generar handle único al dar de alta —');
    const h1 = await handleLib.generarUnico('wtid_dup');
    const creado = await prisma.user.create({ data: { handle: h1, name: 'wtid dup' } });
    const h2 = await handleLib.generarUnico('wtid_dup');
    check('el primero toma el handle limpio', h1 === 'wtid_dup', `(${h1})`);
    check('el segundo no colisiona', h2 !== h1 && handleLib.esValido(h2), `(${h2})`);
    const h3 = await handleLib.generarUnico('!!!');
    check('una sugerencia impresentable produce algo válido', handleLib.esValido(h3), `(${h3})`);
    const h4 = await handleLib.generarUnico('admin');
    check('una sugerencia reservada no se entrega tal cual', h4 !== 'admin' && handleLib.esValido(h4), `(${h4})`);
    await prisma.user.delete({ where: { id: creado.id } });

    console.log('\n  — Una cuenta, varias identidades —');
    const ana = await mkUser('ana');
    const tAna = token(ana.id);

    const propias = await prisma.identity.findMany({ where: { userId: ana.id } });
    check('el alta creó su identidad de Mastodon', propias.length === 1 && propias[0].provider === 'MASTODON');
    check('el externalId guarda instancia e id juntos', propias[0].externalId.includes(':'));

    // Lo que hará la etapa 2: un segundo método hacia la MISMA cuenta.
    // El enum aún no tiene PASSKEY, así que se simula con otra fila de Mastodon.
    await prisma.identity.create({
      data: { userId: ana.id, provider: 'MASTODON', externalId: 'otra.instancia:12345', instance: 'otra.instancia' }
    });
    const ahora = await prisma.identity.findMany({ where: { userId: ana.id } });
    check('se le puede colgar un segundo método a la misma cuenta', ahora.length === 2);

    const porSegunda = await prisma.identity.findUnique({
      where: { provider_externalId: { provider: 'MASTODON', externalId: 'otra.instancia:12345' } },
      select: { userId: true }
    });
    check('entrar por el segundo método lleva a la misma cuenta', porSegunda.userId === ana.id);

    let choque = null;
    try {
      await prisma.identity.create({
        data: { userId: ana.id, provider: 'MASTODON', externalId: 'otra.instancia:12345' }
      });
    } catch (e) { choque = e.code; }
    check('la misma identidad no se puede registrar dos veces', choque === 'P2002', `(fue ${choque})`);

    console.log('\n  — El handle es el identificador público —');
    let r = await call('GET', '/api/auth/me', { tok: tAna });
    check('la sesión trae el handle', r.data.handle === ana.handle, `(${r.data.handle})`);
    check('la sesión ya no trae acct ni instancia',
      r.data.acct === undefined && r.data.mastodonInstance === undefined);

    r = await call('GET', '/api/profile/me', { tok: tAna });
    check('el perfil propio lista sus métodos de acceso', Array.isArray(r.data.identities) && r.data.identities.length === 2);

    r = await call('GET', `/api/profile/${ana.id}`, { tok: tAna });
    check('el perfil público trae handle', r.data.handle === ana.handle);
    check('el perfil público NO revela los métodos de acceso', r.data.identities === undefined);
    check('el perfil público YA NO revela la instancia de Mastodon', r.data.mastodonInstance === undefined);

    // Donde el handle sí viaja: búsqueda de personas, bloqueos y cola de moderación
    const beto0 = await mkUser('beto0');
    r = await call('GET', `/api/chat/users?q=${beto0.handle}`, { tok: tAna });
    check('se puede buscar personas por handle', r.data.users.some(u => u.id === beto0.id));
    check('y el resultado trae el handle, no acct',
      r.data.users[0]?.handle !== undefined && r.data.users[0]?.acct === undefined);

    await call('POST', '/api/blocks', { tok: tAna, body: { userId: beto0.id } });
    r = await call('GET', '/api/blocks', { tok: tAna });
    check('la lista de bloqueados identifica por handle', r.data.blocks[0]?.handle === beto0.handle);
    await call('DELETE', `/api/blocks/${beto0.id}`, { tok: tAna });

    console.log('\n  — Cambiar el handle —');
    r = await call('PUT', '/api/profile/me', { tok: tAna, body: { handle: 'wtid_nuevo' } });
    check('se puede cambiar → 200', r.status === 200, `(fue ${r.status})`);
    check('quedó guardado', r.data.user.handle === 'wtid_nuevo');

    r = await call('PUT', '/api/profile/me', { tok: tAna, body: { handle: 'WTID_Nuevo' } });
    check('se normaliza antes de guardar', r.status === 200 && r.data.user.handle === 'wtid_nuevo');

    r = await call('PUT', '/api/profile/me', { tok: tAna, body: { handle: 'moderacion' } });
    check('un handle reservado se rechaza → 400', r.status === 400, `(fue ${r.status})`);
    r = await call('PUT', '/api/profile/me', { tok: tAna, body: { handle: 'ab' } });
    check('uno demasiado corto se rechaza → 400', r.status === 400, `(fue ${r.status})`);

    const beto = await mkUser('beto');
    r = await call('PUT', '/api/profile/me', { tok: tAna, body: { handle: beto.handle } });
    check('tomar el handle de otra persona → 409', r.status === 409, `(fue ${r.status})`);

    r = await call('PUT', '/api/profile/me', { tok: tAna, body: { bio: 'sin tocar el handle' } });
    check('editar el perfil sin mandar handle no lo cambia', r.data.user.handle === 'wtid_nuevo');
    r = await call('PUT', '/api/profile/me', { tok: tAna, body: { handle: 'wtid_nuevo' } });
    check('reguardar el propio handle no choca consigo mismo', r.status === 200, `(fue ${r.status})`);

    console.log('\n  — Nada quedó atado a Mastodon —');
    // Filtrado por current_schema(): la base de pruebas es un esquema aparte
    // dentro de la misma instancia, así que sin esto se ven también las columnas
    // del esquema de desarrollo y el conteo sale doble.
    const columnas = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'User'
        AND column_name IN ('acct','mastodonInstance','mastodonId')`;
    check('las columnas de Mastodon salieron de User', columnas.length === 0,
      `(quedan ${columnas.map(c => c.column_name).join(', ')})`);
    const cols2 = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'User' AND column_name = 'handle'`;
    check('y User tiene handle', cols2.length === 1, `(encontradas ${cols2.length})`);
  } finally {
    await cleanup();
  }

  return results;
};
