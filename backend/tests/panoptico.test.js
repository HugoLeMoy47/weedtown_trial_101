// Panóptico: indicadores agregados (HU-PAN-001/002/003/004), ciclo 6.
//
// Cubre lo mínimo que pidió el ciclo: la ruta rechaza a MOD y a anónimo,
// `dias` inválido da 400, el truncado de día cae en el día correcto para un
// registro creado a las 23:00 hora de México (la prueba que atrapa la Trampa
// 2 — zona horaria), y un desglose con pocos elementos no expone el detalle
// (Trampa 4). También cubre el recorte por rol de la carga de moderación
// (HU-PAN-004 CA5) y que ningún campo nuevo se cuele fuera de lo agregado.
//
// Orden deliberado: TODOS los datos de prueba se siembran ANTES de la
// primera consulta a /api/admin/indicadores. Los indicadores se cachean en
// memoria del proceso por `dias` (5-15 min, a propósito — es la Trampa que el
// propio ciclo pide respetar); sembrar datos después de la primera lectura de
// un `dias` dado consultaría la respuesta vieja, no un bug del backend.
const { suite } = require('./lib');

// 23:00 hora de México (UTC-6 fijo, sin horario de verano desde 2022 —
// verificado contra la base real antes de escribir esta prueba) cae a las
// 05:00 UTC del día calendario SIGUIENTE. Si el backend truncara en UTC
// ingenuo, este registro aparecería un día después del que le toca.
//
// El mismo instante sirve para las DOS caras de la Trampa 2: el agrupado (¿en
// qué día cae?) y el límite de la ventana (¿entra siquiera?) — ver la acción
// de moderación de las 23:00 de HOY, más abajo.
function las2300MexicoDe(fechaISO) {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(5, 0, 0, 0);
  return d;
}

function hoyMexicoISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
}

function sumarDiasISO(fechaISO, delta) {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Panóptico', 'wtpan');

  await cleanup();
  try {
    console.log('\n  — Siembra: todos los datos de prueba ANTES de tocar la ruta (ver nota de caché arriba) —');
    const user = await mkUser('user');
    const mod = await mkUser('mod', { role: 'MOD' });
    const admin = await mkUser('admin', { role: 'ADMIN' });
    const tUser = token(user.id);
    const tMod = token(mod.id);
    const tAdmin = token(admin.id);

    // Trampa 2: un bloqueo a las 23:00 hora de México de "ayer"
    const hoy = hoyMexicoISO();
    const ayer = sumarDiasISO(hoy, -1);
    const instante2300 = las2300MexicoDe(ayer);
    const otro = await mkUser('bloqueado');
    await prisma.block.create({ data: { blockerId: user.id, blockedId: otro.id, createdAt: instante2300 } });

    // Trampa 4: dos subforos con menos de 5 seguidores cada uno
    const sub1 = await prisma.subForum.create({ data: { name: 'wtpan sub uno', slug: 'wtpan-sub-uno', creatorId: admin.id } });
    const sub2 = await prisma.subForum.create({ data: { name: 'wtpan sub dos', slug: 'wtpan-sub-dos', creatorId: admin.id } });
    const seguidorA = await mkUser('seg_a');
    const seguidorB = await mkUser('seg_b');
    await prisma.subForumFollow.create({ data: { userId: seguidorA.id, subforumId: sub1.id } });
    await prisma.subForumFollow.create({ data: { userId: seguidorB.id, subforumId: sub1.id } });
    await prisma.subForumFollow.create({ data: { userId: seguidorA.id, subforumId: sub2.id } });

    // Carga por moderador: dos acciones del MOD, y la segunda es la que
    // importa.
    //
    // Trampa 2 en el LÍMITE de la ventana: la ventana de indicadores va de
    // `desdeActual` a `hasta`, dos fechas de calendario MEXICANO. La versión
    // anterior de `consultaCargaPorModerador` las convertía a instantes con una
    // "Z" pegada (`${hasta}T23:59:59.999Z`), o sea las leía como UTC — y un día
    // de México termina 6 horas DESPUÉS de eso. Resultado: todo lo ocurrido
    // entre las 18:00 y la medianoche hora de México del último día quedaba
    // fuera del conteo.
    //
    // Esta acción de las 23:00 de HOY cae justo en esa franja, así que la
    // prueba falla con el bug y pasa con el arreglo SIN IMPORTAR a qué hora se
    // corran las pruebas. Antes no era así: la única acción sembrada era "el
    // instante actual", que solo cae en la franja ciega si la suite se corre de
    // noche — por eso este bug vivió en verde y solo se destapó corriendo las
    // pruebas después de las 18:00 hora de México.
    const sub3 = await prisma.subForum.create({ data: { name: 'wtpan mod', slug: 'wtpan-mod-target', creatorId: admin.id } });
    await prisma.moderationAction.create({
      data: { moderatorId: mod.id, type: 'ARCHIVAR_SUBFORO', targetType: 'SUBFORUM', targetId: sub3.id }
    });
    await prisma.moderationAction.create({
      data: {
        moderatorId: mod.id, type: 'ARCHIVAR_SUBFORO', targetType: 'SUBFORUM', targetId: sub3.id,
        createdAt: las2300MexicoDe(hoy)
      }
    });

    // ---- Ciclo 12C: las dos instantáneas que medían algo que ya no era cierto.
    //
    // Ninguna tenía prueba, y por eso los dos bugs vivieron. Se siembra aquí,
    // con el resto, porque la respuesta se cachea 10 minutos: sembrar después
    // de la primera lectura consultaría la respuesta vieja.
    //
    // CUARENTENA (8H). La ventana es POR PROVEEDOR —Mastodon 0 h, correo 3 h,
    // llave 24 h— y una cuenta con varias identidades toma la MÁS CORTA. El
    // indicador usaba una sola ventana de 24 h para todos.
    const haceHoras = (h) => new Date(Date.now() - h * 60 * 60 * 1000);
    // SIN `mkUser` a propósito: ese helper siempre agrega una identidad de
    // MASTODON, cuya ventana de cuarentena es 0 h. Cualquier cuenta creada con
    // él queda fuera de la cuarentena por definición, así que no sirve para
    // probar las otras dos ventanas. Costó una corrida darse cuenta.
    const conIdentidad = (sufijo, proveedor, horasDeAntiguedad) => prisma.user.create({
      data: {
        handle: `wtpan_${sufijo}`.toLowerCase().slice(0, 20),
        name: `wtpan_${sufijo}`,
        createdAt: haceHoras(horasDeAntiguedad),
        identities: { create: { provider: proveedor, externalId: `wtpan-${sufijo}-${Date.now()}` } }
      }
    });
    // Correo de 5 h: YA SALIÓ de cuarentena (ventana 3 h). Con el bug se
    // contaba, porque 5 < 24. Es el caso que destapa el 8H.
    await conIdentidad('q_email_vieja', 'EMAIL', 5);
    // Correo de 1 h: sigue dentro.
    await conIdentidad('q_email_nueva', 'EMAIL', 1);
    // Llave de 5 h: sigue dentro (ventana 24 h).
    await conIdentidad('q_llave', 'PASSKEY', 5);
    // Mastodon recién creada: ventana 0, nunca cuenta.
    await conIdentidad('q_masto', 'MASTODON', 0.1);
    // Llave + correo, 5 h: toma la ventana MÁS CORTA (3 h), así que YA salió.
    const mixta = await conIdentidad('q_mixta', 'PASSKEY', 5);
    await prisma.identity.create({
      data: { userId: mixta.id, provider: 'EMAIL', externalId: `wtpan-q-mixta-mail-${mixta.id}` }
    });

    // ZONA COMPARTIDA. `hasActiveCell()` exige además que la celda tenga el
    // formato ACTUAL: las del geohash viejo no aparecen en el mapa de nadie,
    // pero el indicador las contaba.
    const conCelda = (sufijo, celda) => mkUser(sufijo, {
      nearbyCell: celda, nearbyUpdatedAt: new Date()
    });
    await conCelda('celda_ok', '5432_9876');      // formato actual: cuenta
    await conCelda('celda_vieja', '9g3q7bx');     // geohash viejo: NO debe contar
    await conCelda('celda_fuera', '9999_99999');  // formato válido, fuera de la cuadrícula: NO
    await mkUser('celda_caduca', {                 // formato bueno pero caducada: NO
      nearbyCell: '5432_9877',
      nearbyUpdatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    });

    console.log('\n  — Permisos: solo ADMIN en la ruta principal —');
    let r = await call('GET', '/api/admin/indicadores?dias=30');
    check('anónimo → 401', r.status === 401, `(fue ${r.status})`);

    r = await call('GET', '/api/admin/indicadores?dias=30', { tok: tUser });
    check('un USER → 403 (ni siquiera pasa del portón de /admin)', r.status === 403, `(fue ${r.status})`);

    r = await call('GET', '/api/admin/indicadores?dias=30', { tok: tMod });
    check('un MOD → 403 (los indicadores son ADMIN, no MOD — CA1)', r.status === 403, `(fue ${r.status})`);

    r = await call('GET', '/api/admin/indicadores?dias=30', { tok: tAdmin });
    check('un ADMIN → 200', r.status === 200, `(fue ${r.status})`);

    console.log('\n  — `dias` validado contra lista blanca —');
    r = await call('GET', '/api/admin/indicadores?dias=15', { tok: tAdmin });
    check('dias=15 (fuera de la lista) → 400', r.status === 400, `(fue ${r.status})`);
    r = await call('GET', '/api/admin/indicadores?dias=99999', { tok: tAdmin });
    check('dias absurdo → 400', r.status === 400, `(fue ${r.status})`);
    r = await call('GET', '/api/admin/indicadores?dias=DROP+TABLE', { tok: tAdmin });
    check('dias no numérico → 400, no cae en el default en silencio', r.status === 400, `(fue ${r.status})`);
    r = await call('GET', '/api/admin/indicadores?dias=30.5', { tok: tAdmin });
    check('dias con decimales (no está en la lista exacta) → 400', r.status === 400, `(fue ${r.status})`);

    console.log('\n  — Ciclo 12C: instantáneas que medían algo que ya no era cierto —');
    const inst = (await call('GET', '/api/admin/indicadores?dias=30', { tok: tAdmin })).data;
    // Las instantáneas viven repartidas por área temática en la respuesta, no
    // bajo una llave "instantaneas": la cuarentena es crecimiento y la zona
    // compartida es actividad.
    const enCuarentena = inst.crecimiento.cuentasEnCuarentena;
    const compartiendo = inst.actividad.personasCompartiendoZona;

    // No se asierta un número absoluto: la suite crea muchas otras cuentas y
    // ese total cambiaría cada vez que alguien agregue un caso arriba. Se
    // asierta la DIFERENCIA contra lo que habría contado el bug, que es lo que
    // de verdad distingue el arreglo.
    //
    // Las dos que sobran con el bug son `q_email_vieja` (correo, 5 h: ya salió
    // a las 3 h) y `q_mixta` (llave + correo, 5 h: toma la ventana más corta,
    // también 3 h). Con la ventana única de 24 h las dos contaban.
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ conBug }] = await prisma.$queryRaw`
      SELECT count(*)::int AS "conBug" FROM "User" u
      WHERE u."deletedAt" IS NULL AND u."createdAt" >= ${hace24h}
        AND NOT EXISTS (SELECT 1 FROM "Identity" i WHERE i."userId" = u.id AND i.provider = 'MASTODON')`;
    check('la cuarentena usa la ventana real de cada proveedor (8H)',
      enCuarentena === conBug - 2,
      `(el indicador dice ${enCuarentena}; la fórmula vieja de 24 h decía ${conBug}, y sobran exactamente 2)`);

    // De las cuatro con celda, solo UNA es visible en Cerca.
    check('zona compartida cuenta solo celdas del formato actual y vigentes',
      compartiendo === 1,
      `(fueron ${compartiendo}; contando las inválidas o caducadas serían 2-4)`);

    console.log('\n  — Caché: incluye calculadoEn y no recalcula en la siguiente consulta —');
    r = await call('GET', '/api/admin/indicadores?dias=30', { tok: tAdmin });
    check('trae calculadoEn', Boolean(r.data.calculadoEn));
    const primeraVez = r.data.calculadoEn;
    r = await call('GET', '/api/admin/indicadores?dias=30', { tok: tAdmin });
    check('segunda consulta seguida devuelve el mismo calculadoEn (caché)', r.data.calculadoEn === primeraVez);

    console.log('\n  — dias=7/90 también responden 200 (primera consulta a cada uno, ya con los datos sembrados) —');
    let r7, r90;
    for (const d of [7, 90]) {
      const resp = await call('GET', `/api/admin/indicadores?dias=${d}`, { tok: tAdmin });
      check(`dias=${d} → 200`, resp.status === 200, `(fue ${resp.status})`);
      if (d === 7) r7 = resp;
      if (d === 90) r90 = resp;
    }

    console.log('\n  — Trampa 2: la zona horaria, verificada con el bloqueo de las 23:00 hora de México —');
    const serieBloqueos = r7.data.saludSocial.bloqueosPorDia.serie;
    const filaAyer = serieBloqueos.find(f => f.dia === ayer);
    const filaHoy = serieBloqueos.find(f => f.dia === hoy);
    check(
      `el bloqueo de las 23:00 hora de México cae en "${ayer}" (día correcto), no en "${hoy}" (lo que daría un truncado en UTC puro)`,
      filaAyer?.valor >= 1,
      `(serie: ${JSON.stringify(serieBloqueos)})`
    );
    check('no se coló en el día calendario UTC siguiente', (filaHoy?.valor || 0) === 0, `(hoy=${filaHoy?.valor})`);

    console.log('\n  — Trampa 4: ningún desglose expone segmentos con menos de 5 elementos —');
    const desglose = r90.data.foros.seguidoresPorSubforo;
    const nombres = desglose.map(d => d.nombre);
    check('el subforo con 2 seguidores NO aparece por su nombre', !nombres.includes('wtpan sub uno'), `(nombres: ${JSON.stringify(nombres)})`);
    check('el otro subforo con 1 seguidor tampoco', !nombres.includes('wtpan sub dos'), `(nombres: ${JSON.stringify(nombres)})`);
    check(
      'todo lo que se muestra individualmente tiene 5+ (o es el cubo "Otros")',
      desglose.every(d => d.valor >= 5 || d.nombre === 'Otros'),
      `(desglose: ${JSON.stringify(desglose)})`
    );
    check('aparece el cubo "Otros" agrupando los chicos', desglose.some(d => d.nombre === 'Otros' && d.agrupados >= 2), `(desglose: ${JSON.stringify(desglose)})`);

    console.log('\n  — Ningún campo devuelve contenido de posts/comentarios/mensajes —');
    const plano = JSON.stringify(r90.data);
    check('no aparece la palabra "content" en la respuesta', !plano.includes('"content"'));
    check('no aparece "reporterId" (quién reportó) en la respuesta', !plano.includes('reporterId'));

    console.log('\n  — Carga por moderador: recorte por rol (HU-PAN-004 CA5) —');
    r = await call('GET', '/api/admin/indicadores/carga-moderacion?dias=30', { tok: tMod });
    check('un MOD SÍ puede consultar esta ruta aparte (a diferencia de /indicadores)', r.status === 200, `(fue ${r.status})`);
    check(
      'un MOD ve su propio número, y cuenta las DOS acciones — incluida la de las 23:00 hora de México (Trampa 2 en el límite de la ventana)',
      r.data.propio === 2,
      `(propio=${r.data.propio}; si dice 1, la ventana se está cortando a las 18:00 hora de México)`
    );
    check('un MOD ve el promedio del equipo', typeof r.data.promedioEquipo === 'number');
    check('un MOD NO ve el desglose por persona', r.data.desglose === undefined, `(trae: ${Object.keys(r.data)})`);

    r = await call('GET', '/api/admin/indicadores/carga-moderacion?dias=30', { tok: tAdmin });
    check('un ADMIN sí ve el desglose por persona', Array.isArray(r.data.desglose));
    check('el desglose incluye al MOD que actuó', r.data.desglose.some(m => m.moderatorId === mod.id));

    r = await call('GET', '/api/admin/indicadores/carga-moderacion?dias=30');
    check('anónimo → 401 también en la ruta de carga', r.status === 401, `(fue ${r.status})`);

    console.log('\n  — Estado técnico (HU-PAN-003) —');
    r = await call('GET', '/api/admin/salud-tecnica', { tok: tMod });
    check('un MOD no puede ver la salud técnica → 403 (es ADMIN)', r.status === 403, `(fue ${r.status})`);
    r = await call('GET', '/api/admin/salud-tecnica', { tok: tAdmin });
    check('un ADMIN sí → 200', r.status === 200, `(fue ${r.status})`);
    check('trae db/storage/mailer/uptimeSegundos', ['db', 'storage', 'mailer', 'uptimeSegundos'].every(k => k in r.data));
    check('observabilityUrl es null sin OBSERVABILITY_URL configurada', r.data.observabilityUrl === null || typeof r.data.observabilityUrl === 'string');
  } finally {
    await cleanup();
  }

  return results;
};
