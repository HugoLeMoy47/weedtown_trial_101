// Amistades en Cerca (HU-CER-001), ciclo 4 — "Amigos cerca".
//
// GET /api/nearby ya devolvía a cada persona identificada de la cuadrícula;
// lo único que faltaba era distinguir quién de esa lista es una amistad
// aceptada. Cubre el caso obvio (amigos / no amigos / solicitud pendiente)
// y el caso clave del plan: bloquear rompe la amistad y desbloquear no la
// restaura sola, así que isFriend debe seguir en false después de ambos pasos.
const { suite } = require('./lib');

const CELL = '5000_8000';

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup } = suite('Cerca-Amigos', 'wtcam');

  await cleanup();
  try {
    console.log('\n  — isFriend distingue amistades en la lista —');
    const ana = await mkUser('ana');
    const beto = await mkUser('beto');
    const carla = await mkUser('carla');
    const tAna = token(ana.id);
    const tBeto = token(beto.id);
    const tCarla = token(carla.id);

    // Los tres comparten la misma celda: todos se ven entre sí
    await call('PUT', '/api/nearby/location', { tok: tAna, body: { cell: CELL } });
    await call('PUT', '/api/nearby/location', { tok: tBeto, body: { cell: CELL } });
    await call('PUT', '/api/nearby/location', { tok: tCarla, body: { cell: CELL } });

    // Ana y Beto son amigos; con Carla queda una solicitud pendiente (sin aceptar)
    let r = await call('POST', `/api/friends/request/${beto.id}`, { tok: tAna });
    const solicitudBeto = r.data.friendRequest.id;
    await call('POST', `/api/friends/accept/${solicitudBeto}`, { tok: tBeto });
    await call('POST', `/api/friends/request/${carla.id}`, { tok: tAna });

    r = await call('GET', '/api/nearby', { tok: tAna });
    const porId = Object.fromEntries(r.data.people.map(p => [p.id, p]));
    check('Beto (amigo aceptado) → isFriend true', porId[beto.id]?.isFriend === true, `(fue ${porId[beto.id]?.isFriend})`);
    check('Carla (solicitud pendiente, no aceptada) → isFriend false', porId[carla.id]?.isFriend === false, `(fue ${porId[carla.id]?.isFriend})`);

    r = await call('GET', '/api/nearby', { tok: tBeto });
    check('la bandera es simétrica: Beto también ve a Ana como amiga', r.data.people.find(p => p.id === ana.id)?.isFriend === true);

    console.log('\n  — Orden: amistades primero, cercanía dentro de cada grupo —');
    r = await call('GET', '/api/nearby', { tok: tAna });
    const orden = r.data.people.map(p => p.id);
    const posBeto = orden.indexOf(beto.id);
    const posCarla = orden.indexOf(carla.id);
    check('Beto (amigo) aparece antes que Carla (no amiga)', posBeto < posCarla, `(orden: ${orden})`);

    console.log('\n  — La respuesta no gana campos nuevos aparte de isFriend —');
    const camposEsperados = ['id', 'name', 'displayName', 'avatar', 'handle', 'cell', 'distanceKm', 'band', 'isFriend'].sort();
    const camposReales = Object.keys(porId[beto.id]).sort();
    check(
      'people[].keys() == campos esperados + isFriend',
      JSON.stringify(camposReales) === JSON.stringify(camposEsperados),
      `(reales: ${camposReales})`
    );

    console.log('\n  — Caso clave: bloquear y desbloquear NO restaura la amistad —');
    r = await call('POST', '/api/blocks', { tok: tAna, body: { userId: beto.id } });
    check('Ana bloquea a Beto → 200', r.status === 200, `(fue ${r.status})`);

    r = await call('DELETE', `/api/blocks/${beto.id}`, { tok: tAna });
    check('Ana desbloquea a Beto → 200', r.status === 200, `(fue ${r.status})`);

    // Beto sigue compartiendo la misma celda, así que vuelve a aparecer en la lista
    r = await call('GET', '/api/nearby', { tok: tAna });
    const betoTrasDesbloqueo = r.data.people.find(p => p.id === beto.id);
    check('Beto reaparece en Cerca tras desbloquear', Boolean(betoTrasDesbloqueo));
    check(
      'pero isFriend queda en false: el bloqueo rompió el vínculo y no se restaura solo',
      betoTrasDesbloqueo?.isFriend === false,
      `(fue ${betoTrasDesbloqueo?.isFriend})`
    );
  } finally {
    await cleanup();
  }

  return results;
};
