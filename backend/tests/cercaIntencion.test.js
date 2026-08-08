// Ciclo 10C: la intención en Cerca — para qué anda alguien, no solo dónde.
//
// Lo que hay que sostener:
//   1. La intención hereda EXACTAMENTE quién ve la celda: reciprocidad y
//      bloqueo, sin reglas nuevas.
//   2. Nunca sobrevive a la celda. Si la celda caducó o se borró, la intención
//      no se muestra aunque su propia fecha no haya llegado.
//   3. Caduca sola, en horas.
//   4. No se filtra la mecánica: `nearbyIntentUntil` es de la caducidad, no
//      información que nadie deba recibir.
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('CercaIntencion', 'wtint');

  const CELDA = '1971_8933';       // misma celda para todos: se ven entre sí
  const ahora = () => new Date();
  const enHoras = (h) => new Date(Date.now() + h * 3600 * 1000);
  const haceDias = (d) => new Date(Date.now() - d * 24 * 3600 * 1000);

  await cleanup();
  try {
    const ana = await mkUser('ana');     // declara intención
    const beto = await mkUser('beto');   // comparte zona: la ve
    const caro = await mkUser('caro');   // NO comparte zona: no ve nada
    const dani = await mkUser('dani');   // bloqueada por ana
    const tAna = token(ana.id), tBeto = token(beto.id), tCaro = token(caro.id), tDani = token(dani.id);

    const compartir = (id, cuando = ahora()) =>
      prisma.user.update({ where: { id }, data: { nearbyCell: CELDA, nearbyUpdatedAt: cuando } });
    await Promise.all([compartir(ana.id), compartir(beto.id), compartir(dani.id)]);
    await prisma.block.create({ data: { blockerId: ana.id, blockedId: dani.id } });

    // Qué intención ve `tok` sobre ana (null si no la ve o si ana no aparece)
    const intencionDeAnaSegun = async (tok) => {
      const r = await call('GET', '/api/nearby', { tok });
      if (r.status !== 200) return { status: r.status, intencion: null, aparece: false };
      const p = (r.data.people || []).find(x => x.id === ana.id);
      return { status: 200, intencion: p?.intencion ?? null, aparece: Boolean(p) };
    };

    console.log('\n  — Declarar una intención —');
    let r = await call('PUT', '/api/nearby/intent', { tok: tAna, body: { intencion: 'ROLAR', horas: 4 } });
    check('se guarda y devuelve hasta cuándo', r.status === 200 && r.data.intencion === 'ROLAR' && Boolean(r.data.intencionHasta), `(${r.status})`);
    r = await call('GET', '/api/nearby/location', { tok: tAna });
    check('aparece en mi propio estado', r.data.intencion === 'ROLAR');
    check('y el estado ofrece las duraciones válidas', Array.isArray(r.data.horasDisponibles) && r.data.horasDisponibles.length > 0);

    console.log('\n  — Validación —');
    r = await call('PUT', '/api/nearby/intent', { tok: tAna, body: { intencion: 'FIESTA', horas: 4 } });
    check('una intención inventada → 400', r.status === 400, `(fue ${r.status})`);
    r = await call('PUT', '/api/nearby/intent', { tok: tAna, body: { intencion: 'ROLAR', horas: 72 } });
    check('una duración fuera del catálogo → 400', r.status === 400, `(fue ${r.status})`);
    r = await call('PUT', '/api/nearby/intent', { tok: tCaro, body: { intencion: 'ROLAR', horas: 4 } });
    check('sin compartir zona no se puede declarar → 403', r.status === 403, `(fue ${r.status})`);

    console.log('\n  — Hereda quién ve la celda: reciprocidad y bloqueo —');
    let v = await intencionDeAnaSegun(tBeto);
    check('quien comparte zona ve la intención', v.intencion === 'ROLAR', `(fue ${v.intencion})`);
    v = await intencionDeAnaSegun(tCaro);
    check('quien NO comparte zona no ve el mapa siquiera → 403', v.status === 403, `(fue ${v.status})`);
    v = await intencionDeAnaSegun(tDani);
    check('con bloqueo de por medio, ana ni siquiera aparece', !v.aparece);

    console.log('\n  — La mecánica de caducidad no se filtra —');
    r = await call('GET', '/api/nearby', { tok: tBeto });
    const pAna = r.data.people.find(x => x.id === ana.id);
    check('no viaja nearbyIntentUntil', pAna.nearbyIntentUntil === undefined && pAna.intencionHasta === undefined);
    check('ni nearbyUpdatedAt (cuándo actualizó su zona)', pAna.nearbyUpdatedAt === undefined);

    console.log('\n  — Caduca sola —');
    await prisma.user.update({ where: { id: ana.id }, data: { nearbyIntentUntil: new Date(Date.now() - 1000) } });
    v = await intencionDeAnaSegun(tBeto);
    check('vencida, la intención desaparece', v.intencion === null, `(fue ${v.intencion})`);
    check('pero la persona sigue en el mapa', v.aparece);

    console.log('\n  — LA REGLA: nunca sobrevive a la celda —');
    // Intención vigente por fecha, pero celda caducada (más de 7 días)
    await prisma.user.update({
      where: { id: ana.id },
      data: { nearbyIntent: 'CONECTAR', nearbyIntentUntil: enHoras(4), nearbyUpdatedAt: haceDias(30) }
    });
    v = await intencionDeAnaSegun(tBeto);
    check('con la celda caducada, ana sale del mapa y su intención con ella', !v.aparece && v.intencion === null);

    // Y el camino explícito: dejar de compartir
    await compartir(ana.id);
    await call('PUT', '/api/nearby/intent', { tok: tAna, body: { intencion: 'MIRANDO', horas: 2 } });
    v = await intencionDeAnaSegun(tBeto);
    check('vuelve a compartir y declara: se ve otra vez', v.intencion === 'MIRANDO');
    r = await call('DELETE', '/api/nearby/location', { tok: tAna });
    check('DELETE /location responde sin intención', r.data.intencion === null);
    const enBase = await prisma.user.findUnique({
      where: { id: ana.id }, select: { nearbyIntent: true, nearbyIntentUntil: true }
    });
    check('y la BORRA de la base, no la deja colgada',
      enBase.nearbyIntent === null && enBase.nearbyIntentUntil === null,
      `(${enBase.nearbyIntent}/${enBase.nearbyIntentUntil})`);
    // Si quedara colgada, reaparecería al volver a compartir zona
    await compartir(ana.id);
    v = await intencionDeAnaSegun(tBeto);
    check('al volver a compartir NO reaparece la intención vieja', v.aparece && v.intencion === null, `(fue ${v.intencion})`);

    console.log('\n  — Quitarla sin dejar de compartir —');
    await call('PUT', '/api/nearby/intent', { tok: tAna, body: { intencion: 'ROLAR', horas: 8 } });
    r = await call('DELETE', '/api/nearby/intent', { tok: tAna });
    check('se puede quitar sola', r.status === 200 && r.data.intencion === null);
    v = await intencionDeAnaSegun(tBeto);
    check('la zona sigue compartida, sin intención', v.aparece && v.intencion === null);
  } finally {
    await cleanup();
  }
  return results;
};
