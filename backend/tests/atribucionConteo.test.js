// Ciclo 13A: el conteo diario de intentos de atribución.
//
// Lo que estas pruebas cuidan, en orden de importancia:
//
//   1. Que la tabla NO GUARDE A NADIE. Es la condición que permite que exista
//      sin reabrir el canal de correlación que el contador ciego del 11A cerró
//      a propósito. Se asserta contra el esquema real, no contra la API — una
//      columna nueva "solo para depurar" tiene que romper esta prueba.
//   2. Que cada escalón del recorrido incremente EL SUYO y solo el suyo. Si
//      dos casos distintos caen en el mismo cubo, el tablero miente y nadie se
//      entera: es exactamente el fallo que el 12C encontró en otros dos
//      indicadores.
//   3. Que la respuesta siga siendo 204 pase lo que pase. Distinguir los casos
//      hacia afuera convertiría el endpoint en el oráculo de existencia de
//      handles que el 10A cerró.
//
// PRESUPUESTO DE PETICIONES: el limitador es 5 por cuenta cada 15 min. Cada
// bloque de abajo usa una cuenta distinta justamente por eso, y el bloque del
// limitador gasta 6 a propósito. Si agregas llamadas, revisa el reparto.
const { suite } = require('./lib');
const { RESULTADOS } = require('../src/lib/atribucion');
const { diaMexicoISO } = require('../src/lib/diaMexico');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('AtribucionConteo', 'wtatrc');

  // Los conteos no cuelgan de ninguna cuenta, así que `cleanup()` no los toca
  // (y no debe: son la métrica del sistema, no datos de las cuentas de
  // prueba). Todo se mide por DIFERENCIA contra la foto de antes.
  const foto = async () => {
    const filas = await prisma.conteoAtribucion.findMany();
    return Object.fromEntries(filas.map(f => [`${diaISO(f.dia)}|${f.resultado}`, f.conteo]));
  };
  const diaISO = (d) => new Date(d).toISOString().slice(0, 10);
  const hoy = diaMexicoISO();
  const delta = (antes, despues, resultado) =>
    (despues[`${hoy}|${resultado}`] || 0) - (antes[`${hoy}|${resultado}`] || 0);

  await cleanup();
  try {
    console.log('\n  — la tabla no guarda a nadie (la condición que la hace admisible) —');
    const columnas = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ConteoAtribucion' ORDER BY column_name
    `;
    const nombres = columnas.map(c => c.column_name).sort();
    check('las columnas son exactamente id, dia, resultado y conteo',
      JSON.stringify(nombres) === JSON.stringify(['conteo', 'dia', 'id', 'resultado']),
      `(son ${nombres.join(', ')})`);
    // Deliberadamente redundante con la de arriba: aquélla falla si cambia el
    // conjunto, ésta dice POR QUÉ importa si alguien agrega justo lo prohibido.
    const sospechosas = nombres.filter(n => /user|handle|ip|actor|invit|session|sesion/i.test(n));
    check('ninguna columna parece identificar a una persona',
      sospechosas.length === 0, `(sospechosas: ${sospechosas.join(', ')})`);

    const invitador = await mkUser('inv');

    console.log('\n  — cada escalón incrementa el suyo, y solo el suyo —');
    const uA = await mkUser('a');
    const tokA = token(uA.id);

    let antes = await foto();
    const r1 = await call('POST', '/api/auth/attribution', { tok: tokA, body: { ref: 'inventado' } }); // 1/5
    let despues = await foto();
    check('ref no válido responde 204 y cuenta como ref_no_valido',
      r1.status === 204 && delta(antes, despues, RESULTADOS.REF_NO_VALIDO) === 1,
      `(status ${r1.status}, delta ${delta(antes, despues, RESULTADOS.REF_NO_VALIDO)})`);
    check('y no incrementó ningún otro escalón',
      delta(antes, despues, RESULTADOS.ATRIBUIDA) === 0 &&
      delta(antes, despues, RESULTADOS.SIN_INVITADOR) === 0);

    antes = await foto();
    const r2 = await call('POST', '/api/auth/attribution', { tok: tokA, body: { ref: 'post' } }); // 2/5
    const r3 = await call('POST', '/api/auth/attribution', { tok: tokA, body: { ref: 'directo' } }); // 3/5
    despues = await foto();
    check('un CTA sin invitador cuenta como sin_invitador, y dos suman en la MISMA fila del día',
      r2.status === 204 && r3.status === 204 && delta(antes, despues, RESULTADOS.SIN_INVITADOR) === 2,
      `(delta ${delta(antes, despues, RESULTADOS.SIN_INVITADOR)})`);
    const filasHoy = await prisma.conteoAtribucion.count({
      where: { resultado: RESULTADOS.SIN_INVITADOR, dia: new Date(`${hoy}T00:00:00Z`) }
    });
    check('y hay UNA sola fila por día y resultado (el ON CONFLICT hace su trabajo)',
      filasHoy === 1, `(hay ${filasHoy})`);

    antes = await foto();
    // "ab" tiene forma inválida (mínimo 3): pasa el filtro de ref pero no el de handle.
    const r4 = await call('POST', '/api/auth/attribution', { tok: tokA, body: { ref: 'perfil', invitadoPor: 'ab' } }); // 4/5
    despues = await foto();
    check('un handle mal formado cuenta aparte de "no resolvió"',
      r4.status === 204 && delta(antes, despues, RESULTADOS.HANDLE_MAL_FORMADO) === 1 &&
      delta(antes, despues, RESULTADOS.ENLACE_SIN_DESTINO) === 0,
      `(status ${r4.status})`);

    antes = await foto();
    const r5 = await call('POST', '/api/auth/attribution', { tok: tokA, body: { ref: 'perfil', invitadoPor: uA.handle } }); // 5/5
    despues = await foto();
    check('abrir tu PROPIO enlace cuenta como auto_invitacion, no como enlace roto',
      r5.status === 204 && delta(antes, despues, RESULTADOS.AUTO_INVITACION) === 1 &&
      delta(antes, despues, RESULTADOS.ENLACE_SIN_DESTINO) === 0,
      `(status ${r5.status})`);

    console.log('\n  — el caso bueno, y el que hasta hoy era invisible —');
    const uB = await mkUser('b');
    const tokB = token(uB.id);

    antes = await foto();
    const rOk = await call('POST', '/api/auth/attribution', { tok: tokB, body: { ref: 'perfil', invitadoPor: invitador.handle } });
    despues = await foto();
    const invActualizado = await prisma.user.findUnique({ where: { id: invitador.id }, select: { invitaciones: true } });
    check('una invitación real cuenta como atribuida',
      rOk.status === 204 && delta(antes, despues, RESULTADOS.ATRIBUIDA) === 1,
      `(delta ${delta(antes, despues, RESULTADOS.ATRIBUIDA)})`);
    check('y el contador de quien invitó subió exactamente 1',
      invActualizado.invitaciones === 1, `(quedó en ${invActualizado.invitaciones})`);

    antes = await foto();
    const rHuerfano = await call('POST', '/api/auth/attribution', { tok: tokB, body: { ref: 'perfil', invitadoPor: 'nadie_por_aqui' } });
    despues = await foto();
    check('un enlace que no resuelve a nadie ya NO se confunde con una atribución',
      rHuerfano.status === 204 &&
      delta(antes, despues, RESULTADOS.ENLACE_SIN_DESTINO) === 1 &&
      delta(antes, despues, RESULTADOS.ATRIBUIDA) === 0,
      `(sin destino ${delta(antes, despues, RESULTADOS.ENLACE_SIN_DESTINO)}, atribuida ${delta(antes, despues, RESULTADOS.ATRIBUIDA)})`);
    check('y la respuesta es idéntica a la del caso bueno: 204, sin pistas',
      rHuerfano.status === rOk.status && JSON.stringify(rHuerfano.data) === JSON.stringify(rOk.data));

    console.log('\n  — cuenta que ya no es nueva —');
    const uC = await mkUser('c');
    await prisma.user.update({
      where: { id: uC.id },
      data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) } // una hora: fuera de los 10 min
    });
    antes = await foto();
    const rVieja = await call('POST', '/api/auth/attribution', { tok: token(uC.id), body: { ref: 'perfil', invitadoPor: invitador.handle } });
    despues = await foto();
    const invSinCambio = await prisma.user.findUnique({ where: { id: invitador.id }, select: { invitaciones: true } });
    check('fuera de la ventana cuenta como fuera_de_ventana',
      rVieja.status === 204 && delta(antes, despues, RESULTADOS.FUERA_DE_VENTANA) === 1,
      `(delta ${delta(antes, despues, RESULTADOS.FUERA_DE_VENTANA)})`);
    check('y no incrementó a nadie',
      invSinCambio.invitaciones === 1, `(quedó en ${invSinCambio.invitaciones})`);

    console.log('\n  — el limitador también es un escalón —');
    const uD = await mkUser('d');
    const tokD = token(uD.id);
    for (let i = 0; i < 5; i++) {
      await call('POST', '/api/auth/attribution', { tok: tokD, body: { ref: 'post' } });
    }
    antes = await foto();
    const rTope = await call('POST', '/api/auth/attribution', { tok: tokD, body: { ref: 'post' } });
    despues = await foto();
    check('la petición frenada por el limitador se cuenta como limitada, no se pierde',
      rTope.status === 429 && delta(antes, despues, RESULTADOS.LIMITADA) === 1,
      `(status ${rTope.status}, delta ${delta(antes, despues, RESULTADOS.LIMITADA)})`);

    console.log('\n  — el día se guarda en calendario de México —');
    const filaHoy = await prisma.conteoAtribucion.findFirst({
      where: { resultado: RESULTADOS.ATRIBUIDA }, orderBy: { dia: 'desc' }
    });
    check('la fila más reciente lleva el día mexicano de hoy, no el UTC',
      filaHoy && diaISO(filaHoy.dia) === hoy,
      `(fila ${filaHoy && diaISO(filaHoy.dia)}, hoy en México ${hoy})`);
  } finally {
    await cleanup();
  }

  return results;
};
