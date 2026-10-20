// Pruebas de cambio de handle y política de congelamiento (cooldown de 6 meses / máx 2 veces al año).
const { suite } = require('./lib');
const handleLib = require('../src/lib/handle');

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

    console.log('\n  — Validación en vivo (GET /api/profile/check-handle) —');
    let c = await call('GET', '/api/profile/check-handle', { tok: tBeto });
    check('sin parámetro handle da 400', c.status === 400);

    c = await call('GET', '/api/profile/check-handle?handle=ab', { tok: tBeto });
    check('handle demasiado corto da no disponible', c.status === 200 && c.data.disponible === false);

    c = await call('GET', '/api/profile/check-handle?handle=soporte', { tok: tBeto });
    check('handle reservado da no disponible', c.status === 200 && c.data.disponible === false);

    c = await call('GET', `/api/profile/check-handle?handle=${beto.handle}`, { tok: tBeto });
    check('handle propio da disponible y esActual = true', c.status === 200 && c.data.disponible === true && c.data.esActual === true);

    c = await call('GET', '/api/profile/check-handle?handle=wtchgh_libre', { tok: tBeto });
    check('handle ocupado por otra persona da no disponible', c.status === 200 && c.data.disponible === false && c.data.motivo.includes('ya está en uso'));

    c = await call('GET', '/api/profile/check-handle?handle=wtchgh_totalmente_libre', { tok: tBeto });
    check('handle libre da disponible = true', c.status === 200 && c.data.disponible === true && !c.data.esActual);

    console.log('\n  — Ciclo 16C · A-3: el handle viejo queda reservado 90 días —');
    const dora = await mkUser('dora');
    const efra = await mkUser('efra');
    const tDora = token(dora.id), tEfra = token(efra.id);
    const viejo = dora.handle;
    r = await call('PUT', '/api/profile/me', { tok: tDora, body: { handle: 'wtchgh_dora2' } });
    check('dora cambia su handle → 200', r.status === 200, `(fue ${r.status})`);

    const reserva = await prisma.handleReservado.findUnique({ where: { handle: viejo } });
    const diasReserva = reserva ? (reserva.hastaAt.getTime() - Date.now()) / 86400000 : 0;
    check('el handle viejo quedó reservado a nombre de dora', reserva?.userId === dora.id);
    check('...por ~90 días', diasReserva > 89 && diasReserva <= 90, `(${diasReserva.toFixed(2)} días)`);

    c = await call('GET', `/api/profile/check-handle?handle=${viejo}`, { tok: tEfra });
    check('otra persona lo ve NO disponible', c.status === 200 && c.data.disponible === false);
    const cTomado = await call('GET', '/api/profile/check-handle?handle=wtchgh_dora2', { tok: tEfra });
    check('el mensaje de "reservado" es IDÉNTICO al de "en uso" (no delata quién cambió de handle)',
      c.data.motivo === cTomado.data.motivo);
    r = await call('PUT', '/api/profile/me', { tok: tEfra, body: { handle: viejo } });
    check('reclamarlo a mano da 409', r.status === 409, `(fue ${r.status})`);
    check('el alta automática tampoco lo entrega (generarUnico lo salta)', (await handleLib.generarUnico(viejo)) !== viejo);
    r = await call('GET', `/api/profile/handle/${viejo}`, { tok: tEfra });
    check('/@viejo NO se resuelve a su antigua dueña (sin redirección)', r.status === 404, `(fue ${r.status})`);

    await prisma.handleReservado.update({ where: { handle: viejo }, data: { hastaAt: new Date(Date.now() - 1000) } });
    c = await call('GET', `/api/profile/check-handle?handle=${viejo}`, { tok: tEfra });
    check('vencida la reserva, el handle vuelve a estar disponible', c.data.disponible === true);
    r = await call('PUT', '/api/profile/me', { tok: tEfra, body: { handle: viejo } });
    check('...y se puede reclamar → 200', r.status === 200 && r.data.user.handle === viejo, `(fue ${r.status})`);

    console.log('\n  — Ciclo 16C · A-2: cambios simultáneos no saltan el cooldown —');
    const erin = await mkUser('erin');
    const tErin = token(erin.id);
    const intentos = Array.from({ length: 8 }, (_, i) => `wtchgh_e${i}`);
    const respuestas = await Promise.all(intentos.map(h => call('PUT', '/api/profile/me', { tok: tErin, body: { handle: h } })));
    const exitos = respuestas.filter(x => x.status === 200);
    const codigos = respuestas.map(x => x.status).join(',');
    check('de 8 cambios simultáneos exactamente UNO prospera', exitos.length === 1, `(prosperaron ${exitos.length}: ${codigos})`);
    check('el resto se rechaza con conflicto/cooldown (400/409), nunca 500', respuestas.every(x => [200, 400, 409].includes(x.status)), `(${codigos})`);
    const erinFinal = await prisma.user.findUnique({ where: { id: erin.id }, select: { handle: true } });
    check('el handle final es el del único que prosperó', exitos[0]?.data?.user?.handle === erinFinal.handle);
    const reservasErin = await prisma.handleReservado.count({ where: { userId: erin.id } });
    check('y se reservó UN solo handle viejo, no varios', reservasErin === 1, `(${reservasErin})`);

  } finally {
    await cleanup();
  }
  return results;
};
