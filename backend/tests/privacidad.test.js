// Exportación y eliminación (anonimización) de la cuenta propia — HU-PRIV-001.
//
// Distinto de moderación (que nunca borra, para preservar evidencia): acá es
// el dueño de sus datos ejerciendo su derecho a que se le anonimicen. Cubre
// que el contenido se quede pero deje de identificar a nadie, que no se pueda
// volver a entrar ni con una sesión ya abierta, y que la bitácora registre
// ambas acciones.
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Privacidad', 'wtpriv');

  let carlaId; // se limpia aparte: al anonimizarse cambia de handle y el
               // cleanup() genérico (que busca por prefijo) ya no la encuentra

  await cleanup();
  try {
    console.log('\n  — Exportar mis datos —');
    const ana = await mkUser('ana');
    const tAna = token(ana.id);
    let r = await call('POST', '/api/posts', { tok: tAna, body: { content: 'un post de ana' } });
    const postId = r.data.id;

    r = await call('GET', '/api/profile/me/export', { tok: tAna });
    check('exportar responde 200', r.status === 200, `(fue ${r.status})`);
    check('trae el perfil propio', r.data.perfil?.handle === ana.handle);
    check('trae los posts propios', r.data.posts?.some(p => p.id === postId));
    check('trae los métodos de acceso (sin datos internos de la llave)', Array.isArray(r.data.metodosDeAcceso));

    const accionExport = await prisma.privacyAction.findFirst({ where: { userId: ana.id, type: 'EXPORTAR_DATOS' } });
    check('queda registrado en la bitácora de privacidad', Boolean(accionExport));

    console.log('\n  — Eliminar cuenta: confirmación obligatoria —');
    const beto = await mkUser('beto');
    const tBeto = token(beto.id);
    r = await call('DELETE', '/api/profile/me', { tok: tBeto, body: { confirm: 'no-es-mi-handle' } });
    check('sin el handle exacto → 400, no borra nada', r.status === 400, `(fue ${r.status})`);

    let sigueVivo = await prisma.user.findUnique({ where: { id: beto.id }, select: { deletedAt: true } });
    check('la cuenta sigue intacta tras el intento fallido', sigueVivo.deletedAt === null);

    console.log('\n  — Eliminar cuenta: anonimización real —');
    const carla = await mkUser('carla');
    carlaId = carla.id;
    const tCarla = token(carla.id);
    const handleOriginal = carla.handle;

    // Un post y un bloqueo de Carla, para comprobar qué pasa con cada uno.
    r = await call('POST', '/api/posts', { tok: tCarla, body: { content: 'contenido de carla' } });
    const postCarla = r.data.id;
    const dana = await mkUser('dana');
    await call('POST', '/api/blocks', { tok: tCarla, body: { userId: dana.id } });

    r = await call('DELETE', '/api/profile/me', { tok: tCarla, body: { confirm: handleOriginal } });
    check('con el handle correcto → 200', r.status === 200, `(fue ${r.status})`);

    const anonimizada = await prisma.user.findUnique({ where: { id: carla.id } });
    check('quedó marcada con deletedAt', Boolean(anonimizada.deletedAt));
    check('el handle cambió (ya no es el original)', anonimizada.handle !== handleOriginal);
    check('el nombre pasó a "Cuenta eliminada"', anonimizada.name === 'Cuenta eliminada');
    check('el email quedó nulo', anonimizada.email === null);
    check('el teléfono/bio/edad quedaron nulos', !anonimizada.phone && !anonimizada.bio && !anonimizada.age);
    check('el rol volvió a USER', anonimizada.role === 'USER');

    const identidades = await prisma.identity.count({ where: { userId: carla.id } });
    check('perdió todas sus identidades — no puede volver a entrar', identidades === 0);

    const bloqueos = await prisma.block.count({ where: { OR: [{ blockerId: carla.id }, { blockedId: carla.id }] } });
    check('sus bloqueos se limpiaron', bloqueos === 0);

    const accionDelete = await prisma.privacyAction.findFirst({ where: { userId: carla.id, type: 'ELIMINAR_CUENTA' } });
    check('la eliminación quedó en la bitácora', Boolean(accionDelete));

    console.log('\n  — El contenido se queda, pero anonimizado —');
    r = await call('GET', `/api/posts/search?q=${encodeURIComponent('contenido de carla')}`);
    const postEncontrado = r.data.results?.find(p => p.id === postCarla);
    check('el post de Carla sigue siendo visible', Boolean(postEncontrado));
    check('pero su autor ya se muestra como "Cuenta eliminada"', postEncontrado?.author?.name === 'Cuenta eliminada');

    console.log('\n  — Una sesión ya abierta deja de servir —');
    r = await call('GET', '/api/auth/me', { tok: tCarla });
    check('el token emitido ANTES de eliminar la cuenta ya no autentica → 401', r.status === 401, `(fue ${r.status})`);

    console.log('\n  — No se puede eliminar dos veces —');
    r = await call('DELETE', '/api/profile/me', { tok: tCarla, body: { confirm: handleOriginal } });
    check('una sesión ya inválida no puede reintentar → 401', r.status === 401, `(fue ${r.status})`);
  } finally {
    if (carlaId) {
      await prisma.privacyAction.deleteMany({ where: { userId: carlaId } });
      await prisma.post.deleteMany({ where: { authorId: carlaId } });
      await prisma.user.delete({ where: { id: carlaId } }).catch(() => {});
    }
    await cleanup();
  }

  return results;
};
