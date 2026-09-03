// Pruebas para Web Push (W3C Push API / VAPID)
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Web Push', 'wtpush');

  await cleanup();
  try {
    console.log('\n  — GET /api/push/public-key —');
    let r = await call('GET', '/api/push/public-key');
    // Si VAPID_PUBLIC_KEY está en el entorno devuelve 200, o 503 si no
    check('responde con status válido (200 o 503)', r.status === 200 || r.status === 503, `(fue ${r.status})`);
    if (r.status === 200) {
      check('devuelve publicKey como string', typeof r.data.publicKey === 'string' && r.data.publicKey.length > 10);
    }

    console.log('\n  — POST /api/push/subscribe —');
    const ana = await mkUser('ana');
    const tAna = token(ana.id);

    const mockSub = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/wtpush-mock-endpoint-' + Date.now(),
      keys: {
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
        auth: 'tBHItJI5svbpez7KI4CCXg'
      }
    };

    r = await call('POST', '/api/push/subscribe', {
      tok: tAna,
      body: { subscription: mockSub }
    });
    check('registrar suscripción responde 200 ok', r.status === 200 && r.data.ok === true, `(fue ${r.status})`);

    const subDb = await prisma.pushSubscription.findUnique({
      where: { endpoint: mockSub.endpoint }
    });
    check('suscripción guardada en la base de datos con userId correcto', subDb && subDb.userId === ana.id);

    console.log('\n  — POST /api/push/unsubscribe —');
    r = await call('POST', '/api/push/unsubscribe', {
      tok: tAna,
      body: { endpoint: mockSub.endpoint }
    });
    check('desuscribir responde 200 ok', r.status === 200 && r.data.ok === true);

    const subDbAfter = await prisma.pushSubscription.findUnique({
      where: { endpoint: mockSub.endpoint }
    });
    check('suscripción eliminada de la base de datos', subDbAfter === null);

    console.log('\n  — Ciclo 15D: el mismo endpoint desde otra cuenta no se queda con la fila —');
    const beto = await mkUser('beto');
    const tBeto = token(beto.id);
    const endpointCompartido = 'https://fcm.googleapis.com/fcm/send/wtpush-compartido-' + Date.now();
    const subCompartida = { endpoint: endpointCompartido, keys: mockSub.keys };

    r = await call('POST', '/api/push/subscribe', { tok: tAna, body: { subscription: subCompartida } });
    check('Ana registra el endpoint compartido → 200', r.status === 200, `(fue ${r.status})`);

    r = await call('POST', '/api/push/subscribe', { tok: tBeto, body: { subscription: subCompartida } });
    check('Beto registra el MISMO endpoint que Ana → 200', r.status === 200, `(fue ${r.status})`);
    const subReasignada = await prisma.pushSubscription.findUnique({ where: { endpoint: endpointCompartido } });
    check('la fila queda a nombre de Beto, no de Ana', subReasignada && subReasignada.userId === beto.id);
    const filasParaEseEndpoint = await prisma.pushSubscription.count({ where: { endpoint: endpointCompartido } });
    check('sigue habiendo una sola fila para ese endpoint (no una por cuenta)', filasParaEseEndpoint === 1, `(hay ${filasParaEseEndpoint})`);

  } finally {
    await cleanup();
  }

  return results;
};
