// Pruebas de cambio de handle y política de congelamiento (cooldown de 6 meses / máx 2 veces al año).
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('CambioHandle', 'wtchgh');

  await cleanup();
  try {
    const ana = await mkUser('ana');
    const beto = await mkUser('beto');
    const tAna = token(ana.id);
    const tBeto = token(beto.id);

    console.log('\n  — Primer cambio de handle (libre al inicio) —');
    let r = await call('PUT', '/api/profile/me', {
      tok: tAna,
      body: { handle: 'wtchgh_nuevo' }
    });
    check('el primer cambio es exitoso → 200', r.status === 200, `(fue ${r.status})`);
    check('el nuevo handle se guardó', r.data.user.handle === 'wtchgh_nuevo');
    check('handleUpdatedAt se inicializó con la fecha actual', Boolean(r.data.user.handleUpdatedAt));

    console.log('\n  — Cooldown: segundo cambio bloqueado dentro de los 180 días —');
    r = await call('PUT', '/api/profile/me', {
      tok: tAna,
      body: { handle: 'wtchgh_otro' }
    });
    check('intentar cambiarlo de inmediato da 400 por cooldown', r.status === 400, `(fue ${r.status})`);
    check('el error menciona la política de dos veces al año / cada 6 meses',
      r.data?.errors?.[0]?.includes('dos veces al año'),
      `mensaje: ${r.data?.errors?.[0]}`);

    console.log('\n  — Guardar otros datos del perfil no se bloquea por el cooldown —');
    r = await call('PUT', '/api/profile/me', {
      tok: tAna,
      body: { bio: 'Bio actualizada durante el cooldown', handle: 'wtchgh_nuevo' }
    });
    check('enviar el mismo handle junto a otros datos responde 200', r.status === 200, `(fue ${r.status})`);
    check('la bio se guardó correctamente', r.data.user.bio === 'Bio actualizada durante el cooldown');
    check('el handle sigue siendo el mismo', r.data.user.handle === 'wtchgh_nuevo');

    r = await call('PUT', '/api/profile/me', {
      tok: tAna,
      body: { aboutMe: 'Sobre mí actualizado sin mandar handle' }
    });
    check('actualizar sin mandar handle responde 200', r.status === 200, `(fue ${r.status})`);

    console.log('\n  — Tras expirar el periodo de 180 días, se permite un nuevo cambio —');
    // Simulamos que el cambio ocurrió hace 181 días
    const hace181Dias = new Date(Date.now() - (181 * 24 * 60 * 60 * 1000));
    await prisma.user.update({
      where: { id: ana.id },
      data: { handleUpdatedAt: hace181Dias }
    });

    r = await call('PUT', '/api/profile/me', {
      tok: tAna,
      body: { handle: 'wtchgh_libre' }
    });
    check('tras 180 días el cambio vuelve a permitirse → 200', r.status === 200, `(fue ${r.status})`);
    check('el handle se actualizó', r.data.user.handle === 'wtchgh_libre');

    console.log('\n  — Validaciones de nombres reservados y colisiones —');
    r = await call('PUT', '/api/profile/me', {
      tok: tBeto,
      body: { handle: 'soporte' }
    });
    check('un handle reservado da 400', r.status === 400, `(fue ${r.status})`);

    r = await call('PUT', '/api/profile/me', {
      tok: tBeto,
      body: { handle: 'wtchgh_libre' } // ya en uso por ana
    });
    check('un handle ya en uso por otra persona da 409', r.status === 409, `(fue ${r.status})`);

  } finally {
    await cleanup();
  }
  return results;
};
