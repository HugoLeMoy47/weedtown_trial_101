// Ciclo 16C · A-1: la consulta de presencia del chat ya no es un oráculo.
//
// `chat:query_presence` aceptaba cualquier `targetUserId`: una sesión cualquiera
// recorría ids y sabía quién estaba en línea — también bloqueados, suspendidos
// y borrados. Estas pruebas atacan la decisión de autorización
// (`presenciaVisiblePara`) directamente, porque el backend no trae cliente de
// Socket.IO y el handler del socket es una capa delgada encima de ella.
//
// La presencia vive en memoria del proceso (presence.js). Aquí se simula con
// addSocket/removeSocket sobre el módulo del propio proceso de prueba: lo que
// se prueba es la decisión, no el transporte.
const { suite } = require('./lib');
const { addSocket, removeSocket } = require('../src/lib/presence');
const { presenciaVisiblePara, crearLimitador } = require('../src/lib/presenciaAutorizada');

module.exports = async function run() {
  const { results, check, mkUser, cleanup, prisma } = suite('PresenciaConsulta', 'wtpres');

  const sockets = [];
  const conectar = (user) => {
    const id = `wtpres-${user.id}-${sockets.length}`;
    sockets.push(id);
    addSocket(user.id, id);
  };

  await cleanup();
  try {
    const ana = await mkUser('ana');       // quien pregunta
    const beto = await mkUser('beto');     // chat con ana, en línea: el caso feliz
    const caro = await mkUser('caro');     // en línea, SIN chat con ana: desconocida
    const dani = await mkUser('dani');     // chat con ana, pero ana la bloqueó
    const eli = await mkUser('eli');       // chat con ana, cuenta borrada
    const fer = await mkUser('fer');       // chat con ana, suspendida
    const gus = await mkUser('gus', { mostrarEnLinea: false }); // chat con ana, oculta su presencia
    const hana = await mkUser('hana', { mostrarEnLinea: false }); // quien pregunta con la presencia apagada

    for (const otro of [beto, dani, eli, fer, gus]) {
      await prisma.chat.create({ data: { users: { connect: [{ id: ana.id }, { id: otro.id }] } } });
    }
    await prisma.chat.create({ data: { users: { connect: [{ id: hana.id }, { id: beto.id }] } } });
    await prisma.block.create({ data: { blockerId: ana.id, blockedId: dani.id } });
    await prisma.user.update({ where: { id: eli.id }, data: { deletedAt: new Date() } });
    await prisma.user.update({ where: { id: fer.id }, data: { suspendedUntil: new Date(Date.now() + 7 * 86400000) } });

    for (const u of [beto, caro, dani, eli, fer, gus, hana]) conectar(u);

    console.log('\n  — Caso feliz —');
    check('chat compartido, sin bloqueo, ambos visibles y en línea → true', (await presenciaVisiblePara(ana.id, beto.id)) === true);

    console.log('\n  — Todo lo demás responde false, igual que "desconectado" —');
    check('una desconocida EN LÍNEA sin chat compartido → false (el oráculo original)', (await presenciaVisiblePara(ana.id, caro.id)) === false);
    check('con bloqueo de por medio → false', (await presenciaVisiblePara(ana.id, dani.id)) === false);
    check('...y el bloqueo corre para los dos lados', (await presenciaVisiblePara(dani.id, ana.id)) === false);
    check('cuenta borrada → false', (await presenciaVisiblePara(ana.id, eli.id)) === false);
    check('cuenta suspendida → false', (await presenciaVisiblePara(ana.id, fer.id)) === false);
    check('quien oculta su presencia (reciprocidad) → false', (await presenciaVisiblePara(ana.id, gus.id)) === false);
    check('quien pregunta con la presencia apagada tampoco ve a nadie → false', (await presenciaVisiblePara(hana.id, beto.id)) === false);

    console.log('\n  — Entradas que el cliente puede mandar —');
    check('uno mismo → false', (await presenciaVisiblePara(ana.id, ana.id)) === false);
    check('id inexistente → false', (await presenciaVisiblePara(ana.id, 2147483000)) === false);
    check('id no numérico → false', (await presenciaVisiblePara(ana.id, 'abc')) === false);
    check('id nulo/cero/negativo → false',
      (await presenciaVisiblePara(ana.id, null)) === false &&
      (await presenciaVisiblePara(ana.id, 0)) === false &&
      (await presenciaVisiblePara(ana.id, -1)) === false);
    check('id fraccionario → false', (await presenciaVisiblePara(ana.id, 1.5)) === false);

    console.log('\n  — Una vez desconectada, deja de verse —');
    removeSocket(sockets.find(s => s.startsWith(`wtpres-${beto.id}-`)));
    check('beto sin sockets → false', (await presenciaVisiblePara(ana.id, beto.id)) === false);

    console.log('\n  — Tope de consultas por conexión —');
    const permitir = crearLimitador({ max: 3, ventanaMs: 1000 });
    const t0 = 1_000_000;
    check('las primeras 3 pasan', permitir(t0) && permitir(t0 + 1) && permitir(t0 + 2));
    check('la cuarta dentro de la ventana se rechaza', permitir(t0 + 3) === false);
    check('pasada la ventana vuelve a permitir', permitir(t0 + 1500) === true);
  } finally {
    for (const s of sockets) removeSocket(s);
    await cleanup();
  }
  return results;
};
