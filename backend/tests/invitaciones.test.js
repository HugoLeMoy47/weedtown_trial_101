// Ciclo 11A: invitaciones con contador ciego.
//
// Lo que de verdad hay que sostener aquí, en orden de gravedad:
//
//   1. NO EXISTE NINGÚN VÍNCULO PERSISTIDO entre quien invita y quien llega.
//      Es la razón de ser del ciclo. Se asierta sobre el ESQUEMA, no sobre la
//      respuesta de la API: una columna que hoy no se devuelve puede empezar a
//      devolverse mañana, pero una columna que no existe no puede filtrarse.
//   2. El log no permite reconstruir el par por correlación. El contador ciego
//      no sirve de nada si la bitácora delata lo mismo que la base no guarda.
//   3. Hacia terceros el contador sale en CUBETAS, nunca exacto — el número
//      exacto es, él solo, un canal de correlación.
//   4. Quién ve el contador lo decide la matriz del 10B, sin un control nuevo.
const { suite } = require('./lib');
const { cubetaInvitaciones } = require('../src/lib/invitaciones');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Invitaciones', 'wtinvita');

  await cleanup();
  try {
    const luna = await mkUser('luna');    // quien invita
    const nueva = await mkUser('nueva');  // quien llega
    const otra = await mkUser('otra');    // con sesión, sin relación
    const amiga = await mkUser('amiga');
    const tNueva = token(nueva.id), tOtra = token(otra.id), tAmiga = token(amiga.id), tLuna = token(luna.id);

    await prisma.friendRequest.create({
      data: { requesterId: luna.id, addresseeId: amiga.id, status: 'ACCEPTED', respondedAt: new Date() }
    });

    const cuenta = async (id) =>
      (await prisma.user.findUnique({ where: { id }, select: { invitaciones: true } })).invitaciones;

    console.log('\n  — No existe ningún vínculo persistido entre las dos cuentas —');
    // El corazón del ciclo. Si alguien agrega `invitadoPorId` "para poder
    // auditarlo", esta prueba es la que tiene que romperse y obligar a la
    // conversación.
    const columnas = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'User'
    `;
    const nombres = columnas.map(c => c.column_name.toLowerCase());
    const sospechosas = nombres.filter(n =>
      /invitad[oa]por|referid|referrer|invitedby|sponsor|padrino|reclut/.test(n)
    );
    check('ninguna columna de User ata a quien invitó con quien llegó',
      sospechosas.length === 0, `(sospechosas: ${sospechosas.join(', ')})`);

    const tablas = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()
    `;
    const tablasSospechosas = tablas.map(t => t.table_name.toLowerCase())
      .filter(n => /referral|invitacion|invite/.test(n));
    check('ni existe una tabla de referidos',
      tablasSospechosas.length === 0, `(sospechosas: ${tablasSospechosas.join(', ')})`);

    console.log('\n  — El contador sube solo cuando corresponde —');
    const antes = await cuenta(luna.id);
    let r = await call('POST', '/api/auth/attribution', { tok: tNueva, body: { ref: 'perfil', invitadoPor: luna.handle } });
    check('un alta con ref=perfil responde 204', r.status === 204, `(fue ${r.status})`);
    check('y el contador de quien invitó subió en 1', (await cuenta(luna.id)) === antes + 1);

    await call('POST', '/api/auth/attribution', { tok: tNueva, body: { ref: 'directo', invitadoPor: luna.handle } });
    check('con ref=directo NO sube (solo cuenta la invitación por perfil)', (await cuenta(luna.id)) === antes + 1);

    await call('POST', '/api/auth/attribution', { tok: tNueva, body: { ref: 'inventado', invitadoPor: luna.handle } });
    check('con un ref fuera de la lista blanca NO sube', (await cuenta(luna.id)) === antes + 1);

    await call('POST', '/api/auth/attribution', { tok: tNueva, body: { ref: 'perfil', invitadoPor: 'nadieconestehandle' } });
    check('un handle inexistente no rompe ni crea nada', (await cuenta(luna.id)) === antes + 1);

    // Auto-invitarse sería el fraude más barato posible: comparte tu enlace,
    // ábrelo tú, súbete el contador.
    const propioAntes = await cuenta(nueva.id);
    await call('POST', '/api/auth/attribution', { tok: tNueva, body: { ref: 'perfil', invitadoPor: nueva.handle } });
    check('nadie se puede auto-invitar', (await cuenta(nueva.id)) === propioAntes);

    // La ventana de atribución: una cuenta vieja no puede atribuirse un alta.
    //
    // Va con una cuenta DISTINTA a propósito. El limitador es de 5 por cuenta,
    // y `nueva` ya gastó las suyas: reusarla haría que esta llamada devolviera
    // 429 y que la prueba pasara **por la razón equivocada** —el contador no
    // sube porque el limitador cortó, no porque la ventana lo impida—. Ya pasó
    // al escribir esta suite; una prueba que pasa por el motivo equivocado es
    // peor que no tenerla.
    await prisma.user.update({
      where: { id: otra.id },
      data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) }
    });
    const rVentana = await call('POST', '/api/auth/attribution', { tok: tOtra, body: { ref: 'perfil', invitadoPor: luna.handle } });
    check('la llamada de la ventana NO fue rechazada por el limitador',
      rVentana.status === 204, `(fue ${rVentana.status})`);
    check('una cuenta fuera de la ventana de alta no incrementa nada',
      (await cuenta(luna.id)) === antes + 1);

    // Sin sesión no gasta cupo: `requireAuth` corta antes que el limitador.
    r = await call('POST', '/api/auth/attribution', { body: { ref: 'perfil', invitadoPor: luna.handle } });
    check('sin sesión → 401', r.status === 401, `(fue ${r.status})`);

    console.log('\n  — Las cubetas, incluidas sus fronteras exactas —');
    const casos = [
      [0, null], [1, 'algunas'], [4, 'algunas'],
      [5, '5+'], [19, '5+'],
      [20, '20+'], [49, '20+'],
      [50, '50+'], [1234, '50+']
    ];
    for (const [n, esperado] of casos) {
      check(`${n} → ${esperado === null ? 'no se pinta' : esperado}`,
        cubetaInvitaciones(n) === esperado, `(fue ${cubetaInvitaciones(n)})`);
    }

    console.log('\n  — Hacia terceros sale la cubeta; a su dueña, el número —');
    await prisma.user.update({
      where: { id: luna.id },
      data: { invitaciones: 7, visibilidadInvitaciones: 'TODOS' }
    });
    const vistaAjena = await call('GET', `/api/profile/handle/${luna.handle}`, { tok: tOtra });
    check('alguien más ve la cubeta, no el número', vistaAjena.data.invitaciones === '5+',
      `(fue ${JSON.stringify(vistaAjena.data.invitaciones)})`);
    // La propiedad real es que hacia terceros el campo es una CADENA (la
    // cubeta) y nunca un número. Buscar el "7" como subcadena en el JSON
    // parecía más estricto y era solo ruido: casaba con `"id":7`.
    check('el contador viaja como cubeta (cadena), nunca como número',
      typeof vistaAjena.data.invitaciones === 'string', `(fue ${typeof vistaAjena.data.invitaciones})`);

    const propia = await call('GET', '/api/profile/me', { tok: tLuna });
    check('su dueña sí ve el número exacto en /me', propia.data.invitaciones === 7,
      `(fue ${propia.data.invitaciones})`);

    console.log('\n  — Quién lo ve lo decide la matriz del 10B —');
    const verComo = async (tok) =>
      (await call('GET', `/api/profile/handle/${luna.handle}`, { tok })).data.invitaciones;

    await prisma.user.update({ where: { id: luna.id }, data: { visibilidadInvitaciones: 'NADIE' } });
    check('NADIE: no lo ve una amistad', (await verComo(tAmiga)) === null);
    check('NADIE: no lo ve alguien con sesión', (await verComo(tOtra)) === null);

    await prisma.user.update({ where: { id: luna.id }, data: { visibilidadInvitaciones: 'AMIGOS' } });
    check('AMIGOS: lo ve una amistad', (await verComo(tAmiga)) === '5+');
    check('AMIGOS: no lo ve quien no lo es', (await verComo(tOtra)) === null);

    // El caso que rompe la regla dura del 10B, aplicado al campo nuevo.
    await prisma.user.update({ where: { id: luna.id }, data: { perfilPublico: true } });
    const anonima = await call('GET', `/api/profile/handle/${luna.handle}`);
    check('AMIGOS + perfil público + sin sesión → NO sale',
      anonima.status === 200 && anonima.data.invitaciones === null,
      `(status ${anonima.status}, valor ${JSON.stringify(anonima.data?.invitaciones)})`);

    await prisma.user.update({ where: { id: luna.id }, data: { visibilidadInvitaciones: 'TODOS' } });
    const anonima2 = await call('GET', `/api/profile/handle/${luna.handle}`);
    check('TODOS + perfil público + sin sesión → sale la cubeta',
      anonima2.data.invitaciones === '5+', `(fue ${JSON.stringify(anonima2.data?.invitaciones)})`);

    console.log('\n  — La preferencia es de su dueña y no viaja a terceros —');
    check('visibilidadInvitaciones no sale en el perfil ajeno',
      anonima2.data.visibilidadInvitaciones === undefined);
    check('pero sí en /me, que es de quien la configura',
      (await call('GET', '/api/profile/me', { tok: tLuna })).data.visibilidadInvitaciones === 'TODOS');

    r = await call('PUT', '/api/profile/me', { tok: tLuna, body: { visibilidadInvitaciones: 'NADIE' } });
    check('se puede cambiar por PUT /me sin tocar nada más', r.status === 200);
    check('y quedó guardada',
      (await call('GET', '/api/profile/me', { tok: tLuna })).data.visibilidadInvitaciones === 'NADIE');
    r = await call('PUT', '/api/profile/me', { tok: tLuna, body: { visibilidadInvitaciones: 'CUALQUIERCOSA' } });
    check('un valor inválido se rechaza con 400', r.status === 400, `(fue ${r.status})`);
  } finally {
    await cleanup();
  }
  return results;
};
