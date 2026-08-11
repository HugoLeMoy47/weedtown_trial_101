// Ciclo 13D: contestar un toque, y el saludo mutuo.
//
// Lo que se cuida, en orden de importancia:
//
//   1. QUE EL CAMINO NUEVO NO SEA UN RODEO A LAS DEFENSAS DEL VIEJO. Contestar
//      no exige compartir zona ni cercanía —eso es deliberado y está
//      argumentado en la ruta— pero bloqueo, suspensión y cuarentena aplican
//      igual, y solo se puede contestar a quien te saludó primero. Sin esa
//      última condición, /poke/responder sería el "ping a cualquier userId"
//      que HU-SEG-004 cerró.
//   2. Que una respuesta no se pueda repetir: una por saludo recibido.
//   3. Que el saludo mutuo se detecte dentro de la ventana y NO fuera.
const { suite } = require('./lib');
const { VENTANA_SALUDO_H } = require('../src/lib/saludos');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('SaludoDeVuelta', 'wtsal');

  const toque = (deId, paraId, cuando) => prisma.notification.create({
    data: { type: 'POKE', actorId: deId, recipientId: paraId, ...(cuando ? { createdAt: cuando } : {}) }
  });
  const cuentaToques = (deId, paraId) => prisma.notification.count({
    where: { type: 'POKE', actorId: deId, recipientId: paraId }
  });

  await cleanup();
  try {
    const ana = await mkUser('ana');
    const beto = await mkUser('beto');
    const tAna = token(ana.id), tBeto = token(beto.id);

    console.log('\n  — solo se contesta a quien te saludó primero —');
    let r = await call('POST', '/api/nearby/poke/responder', { tok: tAna, body: { userId: beto.id } });
    check('sin un toque previo → 404', r.status === 404, `(fue ${r.status})`);
    check('y no se creó ninguna notificación', (await cuentaToques(ana.id, beto.id)) === 0);

    r = await call('POST', '/api/nearby/poke/responder', { tok: tAna, body: { userId: ana.id } });
    check('contestarte a ti misma → 400', r.status === 400, `(fue ${r.status})`);

    r = await call('POST', '/api/nearby/poke/responder', { body: { userId: beto.id } });
    check('sin sesión → 401', r.status === 401, `(fue ${r.status})`);

    console.log('\n  — con un saludo recibido, se contesta en un gesto —');
    await toque(beto.id, ana.id);
    r = await call('POST', '/api/nearby/poke/responder', { tok: tAna, body: { userId: beto.id } });
    check('responde 200', r.status === 200, `(fue ${r.status}: ${JSON.stringify(r.data)})`);
    check('y declara el saludo mutuo', r.data?.saludoMutuo === true, `(dijo ${JSON.stringify(r.data)})`);
    check('le llegó el toque de vuelta a quien saludó', (await cuentaToques(ana.id, beto.id)) === 1);

    // NO exige zona ni cercanía, y eso es la decisión del ciclo: ninguna de las
    // dos cuentas está compartiendo zona en toda esta prueba. Con /poke, la
    // misma llamada habría dado 403.
    r = await call('POST', '/api/nearby/poke', { tok: tAna, body: { userId: beto.id } });
    check('el toque ORIGINAL sí sigue exigiendo zona compartida → 403',
      r.status === 403, `(fue ${r.status})`);

    console.log('\n  — una respuesta por saludo, no diez —');
    r = await call('POST', '/api/nearby/poke/responder', { tok: tAna, body: { userId: beto.id } });
    check('contestar dos veces el mismo saludo → 429', r.status === 429, `(fue ${r.status})`);
    check('y sigue habiendo un solo toque de vuelta', (await cuentaToques(ana.id, beto.id)) === 1);

    // Pero si vuelve a saludarte, puedes volver a contestar: el límite cuelga
    // del saludo recibido, no de un enfriamiento fijo.
    await toque(beto.id, ana.id);
    r = await call('POST', '/api/nearby/poke/responder', { tok: tAna, body: { userId: beto.id } });
    check('si te vuelve a saludar, puedes contestar otra vez', r.status === 200, `(fue ${r.status})`);
    check('ahora hay dos toques de vuelta', (await cuentaToques(ana.id, beto.id)) === 2);

    console.log('\n  — el saludo viejo ya no se puede contestar —');
    const carla = await mkUser('carla');
    const viejo = new Date(Date.now() - (VENTANA_SALUDO_H + 2) * 60 * 60 * 1000);
    await toque(carla.id, ana.id, viejo);
    r = await call('POST', '/api/nearby/poke/responder', { tok: tAna, body: { userId: carla.id } });
    check(`un toque de hace más de ${VENTANA_SALUDO_H} h → 404`, r.status === 404, `(fue ${r.status})`);

    console.log('\n  — el bloqueo corta el camino nuevo igual que el viejo —');
    const dana = await mkUser('dana');
    await toque(dana.id, ana.id);
    await prisma.block.create({ data: { blockerId: dana.id, blockedId: ana.id } });
    r = await call('POST', '/api/nearby/poke/responder', { tok: tAna, body: { userId: dana.id } });
    check('con bloqueo de por medio → 404, sin revelar el motivo', r.status === 404, `(fue ${r.status})`);
    check('y no se creó el toque de vuelta', (await cuentaToques(ana.id, dana.id)) === 0);

    console.log('\n  — la cuarentena aplica igual que en el toque original —');
    // mkUser crea identidad MASTODON (ventana 0 h), así que para una cuenta en
    // cuarentena hay que crearla con llave de acceso, como hizo el 12C.
    const nueva = await prisma.user.create({
      data: {
        handle: 'wtsal_nueva', name: 'wtsal_nueva',
        identities: { create: { provider: 'PASSKEY', externalId: `wtsal-${Date.now()}` } }
      }
    });
    await toque(beto.id, nueva.id);
    r = await call('POST', '/api/nearby/poke/responder', { tok: token(nueva.id), body: { userId: beto.id } });
    check('una cuenta recién creada no puede contestar → 403', r.status === 403, `(fue ${r.status})`);
    check('y el 403 dice CUÁNDO podrá (13B), no solo que no puede',
      Boolean(r.data?.disponibleEn), `(cuerpo: ${JSON.stringify(r.data)})`);

    console.log('\n  — la campana marca los toques ya correspondidos —');
    r = await call('GET', '/api/notifications', { tok: tBeto });
    const deAna = (r.data?.notifications || []).find(n => n.type === 'POKE' && n.actor?.id === ana.id);
    check('el toque de Ana llega marcado como saludo mutuo',
      deAna?.saludoMutuo === true, `(llegó ${JSON.stringify(deAna?.saludoMutuo)})`);

    r = await call('GET', '/api/notifications', { tok: token(nueva.id) });
    const sinContestar = (r.data?.notifications || []).find(n => n.type === 'POKE' && n.actor?.id === beto.id);
    check('un toque sin contestar NO viene marcado',
      sinContestar && sinContestar.saludoMutuo === false,
      `(llegó ${JSON.stringify(sinContestar?.saludoMutuo)})`);
  } finally {
    await prisma.user.deleteMany({ where: { handle: 'wtsal_nueva' } }).catch(() => {});
    await cleanup();
  }

  return results;
};
