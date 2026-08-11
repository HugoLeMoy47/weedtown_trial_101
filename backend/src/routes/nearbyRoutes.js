// Función "Cerca": descubrir comunidad en tu zona con ubicación ofuscada.
// Principios: (1) el servidor solo recibe la CELDA de ~2 km calculada
// en el navegador — nunca coordenadas; (2) recíproco: solo ves si compartes;
// (3) la celda caduca a los 7 días; (4) cuadrícula fija anti-triangulación.
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const prisma = require('../lib/prisma');
const { requireAuth, requireNotSuspended, requireEstablished } = require('../middlewares/requireAuth');
const { isValidCell, centroid, neighborsGrid, cellDistanceKm } = require('../lib/geogrid');
const { blockedWith, isBlockedBetween } = require('../lib/blocks');
const { friendIds } = require('../lib/friends');
const { toqueReciente, seSaludaron } = require('../lib/saludos');

const CELL_TTL_DAYS = 7;
const GRID_RINGS = 5; // 11×11 celdas de ~2 km ≈ radio efectivo ~11 km
const POKE_COOLDOWN_HOURS = 12;

const participantSelect = { id: true, name: true, displayName: true, avatar: true, handle: true };

function cutoffDate() {
  return new Date(Date.now() - CELL_TTL_DAYS * 24 * 60 * 60 * 1000);
}

// Anti-scraping: el mapa no se consulta en ráfaga
const nearbyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas consultas al mapa. Espera unos minutos.' }
});

function bandLabel(km, sameCell) {
  if (sameCell) return 'En tu zona';
  const rounded = Math.max(2, Math.round(km / 2) * 2);
  return `A ~${rounded} km`;
}

// Una celda vigente = existe, es del formato actual (las del geohash viejo se
// descartan) y no ha caducado
function hasActiveCell(user) {
  return Boolean(user?.nearbyCell && isValidCell(user.nearbyCell) && user.nearbyUpdatedAt >= cutoffDate());
}

// --- Intención (ciclo 10C) ---
//
// Duraciones que se pueden elegir. Horas, nunca días: la celda vive 7 días
// porque describe dónde sueles estar; la intención describe cómo andas AHORA.
// 4 h cubre una salida; 8 h, un tramo largo del día. Más allá de eso deja de
// ser información y pasa a ser una invitación que ya nadie sostiene — y quien
// la ve no tiene cómo saber que caducó de hecho aunque no de fecha.
const HORAS_INTENCION = [2, 4, 8];
const INTENCIONES = ['ROLAR', 'CONECTAR', 'MIRANDO'];

// LA REGLA: la intención NUNCA sobrevive a la celda.
//
// Se comprueban las dos cosas juntas y en un solo lugar, para que no exista un
// camino donde una intención se muestre sin celda vigente detrás. Si la celda
// caducó, la intención no se ve aunque su propia fecha no haya llegado: es un
// atributo de la celda, no algo independiente.
function intencionVigente(user) {
  if (!hasActiveCell(user)) return null;
  if (!user.nearbyIntent || !user.nearbyIntentUntil) return null;
  if (new Date(user.nearbyIntentUntil) <= new Date()) return null;
  return { intencion: user.nearbyIntent, hasta: user.nearbyIntentUntil };
}

// GET /api/nearby/location — mi estado de compartir (celda propia o null)
router.get('/location', requireAuth, async (req, res) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { nearbyCell: true, nearbyUpdatedAt: true, nearbyIntent: true, nearbyIntentUntil: true }
    });
    const active = hasActiveCell(me);
    const intencion = intencionVigente(me);
    res.json({
      sharing: active,
      cell: active ? me.nearbyCell : null,
      updatedAt: active ? me.nearbyUpdatedAt : null,
      intencion: intencion?.intencion ?? null,
      intencionHasta: intencion?.hasta ?? null,
      horasDisponibles: HORAS_INTENCION
    });
  } catch (e) {
    console.error('Error al consultar estado de Cerca:', e);
    res.status(500).json({ error: 'Error al consultar tu estado' });
  }
});

// PUT /api/nearby/location { cell } — activar/actualizar mi zona
router.put('/location', requireAuth, async (req, res) => {
  // Defensa explícita: si un cliente manda coordenadas reales, se rechaza y no se registra nada
  const forbidden = ['lat', 'lng', 'lon', 'latitude', 'longitude', 'coords', 'accuracy'];
  if (forbidden.some(k => k in (req.body || {}))) {
    return res.status(400).json({ error: 'Este endpoint solo acepta la celda ofuscada, nunca coordenadas' });
  }
  const cell = typeof req.body.cell === 'string' ? req.body.cell.trim() : '';
  if (!isValidCell(cell)) {
    return res.status(400).json({ error: 'Celda inválida' });
  }
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { nearbyCell: cell, nearbyUpdatedAt: new Date() }
    });
    res.json({ sharing: true, cell, updatedAt: new Date() });
  } catch (e) {
    console.error('Error al actualizar zona:', e);
    res.status(500).json({ error: 'Error al actualizar tu zona' });
  }
});

// DELETE /api/nearby/location — dejar de compartir (borra la celda)
router.delete('/location', requireAuth, async (req, res) => {
  try {
    // La intención se va con la celda (10C): dejar de compartir la zona no
    // puede dejar un estado colgado que reaparezca al volver a compartir.
    await prisma.user.update({
      where: { id: req.user.id },
      data: { nearbyCell: null, nearbyUpdatedAt: null, nearbyIntent: null, nearbyIntentUntil: null }
    });
    res.json({ sharing: false, intencion: null });
  } catch (e) {
    console.error('Error al dejar de compartir zona:', e);
    res.status(500).json({ error: 'Error al dejar de compartir' });
  }
});

// PUT /api/nearby/intent { intencion, horas } — declarar para qué ando (10C)
//
// Exige celda vigente: sin compartir zona no hay dónde poner la intención, y
// permitirla suelta crearía justo el estado colgado que `DELETE /location`
// evita.
router.put('/intent', requireAuth, async (req, res) => {
  const { intencion, horas } = req.body || {};
  if (!INTENCIONES.includes(intencion)) {
    return res.status(400).json({ error: 'Intención inválida' });
  }
  if (!HORAS_INTENCION.includes(Number(horas))) {
    return res.status(400).json({ error: `Duración inválida: elige ${HORAS_INTENCION.join(', ')} horas` });
  }
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { nearbyCell: true, nearbyUpdatedAt: true }
    });
    if (!hasActiveCell(me)) {
      return res.status(403).json({ error: 'Comparte tu zona antes de decir para qué andas' });
    }
    const hasta = new Date(Date.now() + Number(horas) * 60 * 60 * 1000);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { nearbyIntent: intencion, nearbyIntentUntil: hasta }
    });
    res.json({ intencion, intencionHasta: hasta });
  } catch (e) {
    console.error('Error al declarar intención:', e);
    res.status(500).json({ error: 'No se pudo guardar tu intención' });
  }
});

// DELETE /api/nearby/intent — quitarla sin dejar de compartir la zona
router.delete('/intent', requireAuth, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { nearbyIntent: null, nearbyIntentUntil: null }
    });
    res.json({ intencion: null });
  } catch (e) {
    console.error('Error al quitar intención:', e);
    res.status(500).json({ error: 'No se pudo quitar tu intención' });
  }
});

// GET /api/nearby — personas en mi zona y alrededores (recíproco)
router.get('/', requireAuth, nearbyLimiter, async (req, res) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { nearbyCell: true, nearbyUpdatedAt: true }
    });
    if (!hasActiveCell(me)) {
      return res.status(403).json({ error: 'Comparte tu zona para ver quién anda cerca (es recíproco)' });
    }

    const cells = neighborsGrid(me.nearbyCell, GRID_RINGS);
    // Quien está bloqueado (en cualquier dirección) desaparece del mapa para ambos
    const hidden = await blockedWith(req.user.id);
    const [users, amigos] = await Promise.all([
      prisma.user.findMany({
        where: {
          id: { notIn: [req.user.id, ...hidden] },
          nearbyCell: { in: cells },
          nearbyUpdatedAt: { gte: cutoffDate() }
        },
        select: {
          ...participantSelect,
          nearbyCell: true,
          // Para calcular la intención hace falta también nearbyUpdatedAt, que
          // ya viene filtrado por el `where`, pero `intencionVigente` lo
          // reevalúa: una sola función decide, sin confiar en que el filtro de
          // arriba siga siendo el mismo mañana.
          nearbyUpdatedAt: true,
          nearbyIntent: true,
          nearbyIntentUntil: true
        }
      }),
      friendIds(req.user.id)
    ]);
    const amigosSet = new Set(amigos);

    const people = users
      .map(u => {
        const km = cellDistanceKm(me.nearbyCell, u.nearbyCell);
        // Se sacan del objeto público: `nearbyIntentUntil` es la mecánica de
        // caducidad, no información que nadie necesite, y `nearbyUpdatedAt`
        // diría cuándo actualizó su zona por última vez.
        const { nearbyCell, nearbyUpdatedAt, nearbyIntent, nearbyIntentUntil, ...pub } = u;
        return {
          ...pub,
          cell: nearbyCell,
          distanceKm: Math.round(km),
          band: bandLabel(km, nearbyCell === me.nearbyCell),
          isFriend: amigosSet.has(u.id),
          // La intención viaja SOLO si está vigente, y por la misma función que
          // usa el resto: quien ve la celda ve la intención, nadie más.
          intencion: intencionVigente(u)?.intencion ?? null
        };
      })
      // Amistades primero; dentro de cada grupo se conserva el orden por cercanía
      .sort((a, b) => (b.isFriend - a.isFriend) || (a.distanceKm - b.distanceKm));

    // Zonas agregadas para el mapa (centroide + conteo por celda)
    const zoneMap = new Map();
    for (const p of people) {
      if (!zoneMap.has(p.cell)) {
        const c = centroid(p.cell);
        zoneMap.set(p.cell, { cell: p.cell, lat: c.lat, lon: c.lon, count: 0 });
      }
      zoneMap.get(p.cell).count += 1;
    }

    const myCentroid = centroid(me.nearbyCell);
    res.json({
      myZone: { cell: me.nearbyCell, lat: myCentroid.lat, lon: myCentroid.lon },
      people,
      zones: [...zoneMap.values()]
    });
  } catch (e) {
    console.error('Error al consultar Cerca:', e);
    res.status(500).json({ error: 'Error al consultar la zona' });
  }
});

// POST /api/nearby/poke { userId } — mandar un toque 👋 (llega como notificación)
//
// El toque es parte de "Cerca" y hereda sus dos reglas (HU-SEG-004): solo lo manda
// quien comparte zona, y solo llega a quien está dentro de su cuadrícula. Sin estas
// comprobaciones el endpoint era un "ping a cualquier userId": como los ids son
// enteros consecutivos, bastaba recorrerlos para notificar a toda la base.
router.post('/poke', requireAuth, requireNotSuspended, requireEstablished, nearbyLimiter, async (req, res) => {
  const targetId = Number(req.body.userId);
  if (!targetId) return res.status(400).json({ error: 'userId requerido' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'No puedes mandarte un toque a ti' });
  try {
    // 1. Reciprocidad: sin zona activa propia no se manda nada
    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { nearbyCell: true, nearbyUpdatedAt: true }
    });
    if (!hasActiveCell(me)) {
      return res.status(403).json({ error: 'Comparte tu zona para mandar un toque (es recíproco)' });
    }

    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, nearbyCell: true, nearbyUpdatedAt: true }
    });
    // 2. Cercanía: el destino debe estar compartiendo y caer dentro de mi cuadrícula.
    // Un destino inexistente, lejano o que no comparte responden igual (404): el
    // resultado no debe servir para deducir dónde está ni si existe.
    const reachable = target
      && hasActiveCell(target)
      && neighborsGrid(me.nearbyCell, GRID_RINGS).includes(target.nearbyCell);
    if (!reachable) return res.status(404).json({ error: 'Esa persona no está cerca' });

    // 3. Bloqueo en cualquier dirección: mismo 404, sin revelar el motivo
    if (await isBlockedBetween(req.user.id, targetId)) {
      return res.status(404).json({ error: 'Esa persona no está cerca' });
    }

    // 4. Anti-spam: un toque por persona cada POKE_COOLDOWN_HOURS
    const since = new Date(Date.now() - POKE_COOLDOWN_HOURS * 60 * 60 * 1000);
    const recent = await prisma.notification.findFirst({
      where: { type: 'POKE', actorId: req.user.id, recipientId: targetId, createdAt: { gte: since } },
      select: { id: true }
    });
    if (recent) {
      return res.status(429).json({ error: 'Ya le mandaste un toque hace poco — dale chance de responder 🌿' });
    }

    await prisma.notification.create({
      data: { type: 'POKE', recipientId: targetId, actorId: req.user.id }
    });
    res.json({ ok: true, saludoMutuo: await seSaludaron(req.user.id, targetId) });
  } catch (e) {
    console.error('Error al mandar toque:', e);
    res.status(500).json({ error: 'No se pudo mandar el toque' });
  }
});

// POST /api/nearby/poke/responder { userId } — devolver un toque (ciclo 13D)
//
// POR QUÉ EXISTE UNA RUTA APARTE y no se reusa /poke: el circuito no cerraba.
// Recibías «Fulano te mandó un toque 👋», hacías clic, y la campana te llevaba
// a /cerca — A LA LISTA, no a la persona. Para contestar había que buscarla, y
// si su celda había cambiado ni siquiera estaba. La alternativa era escribirle,
// que es exactamente el costo que el toque venía a evitar.
//
// Las diferencias con /poke son las tres decisiones del ciclo, y cada una tiene
// su porqué:
//
//   1. NO EXIGE COMPARTIR ZONA. /poke sí lo exige, y ahí está bien: es
//      reciprocidad, quien mira el mapa se deja ver. Pero contestar un saludo
//      no es asomarse al mapa de nadie. Exigirlo aquí convertiría una cortesía
//      en una coacción para encender la ubicación, y no revela nada nuevo:
//      quien saludó ya sabía que estabas en su cuadrícula cuando lo hizo.
//
//   2. NO EXIGE CERCANÍA ACTUAL. Contestas a quien te habló, no a una celda.
//      Que se haya movido no vuelve inválido su saludo.
//
//   3. NO CONSUME NI RESPETA EL ENFRIAMIENTO DE 12 h. Ese enfriamiento existe
//      para que A no insista; una respuesta es, por definición, solicitada. Lo
//      que sí se limita es a UNA respuesta por saludo recibido — si no, el
//      camino nuevo sería el rodeo al antispam del viejo, que es justo lo que
//      no puede ser.
//
// Lo que NO cambia: bloqueos, suspensión y cuarentena aplican igual. La
// cuarentena crea un pequeño callejón (una cuenta nueva no puede contestar por
// unas horas) y se resuelve como en el 13B: diciéndole cuándo podrá, no
// dejándola en un error genérico.
router.post('/poke/responder', requireAuth, requireNotSuspended, requireEstablished, nearbyLimiter, async (req, res) => {
  const targetId = Number(req.body.userId);
  if (!targetId) return res.status(400).json({ error: 'userId requerido' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'No puedes saludarte a ti' });
  try {
    // La autorización de esta ruta ES el saludo recibido: solo se puede
    // contestar a quien te habló primero, y dentro de la ventana. Sin eso
    // sería un /poke sin comprobación de cercanía — es decir, el "ping a
    // cualquier userId" que HU-SEG-004 cerró.
    const suSaludo = await toqueReciente(targetId, req.user.id);
    if (!suSaludo) {
      return res.status(404).json({ error: 'No hay un toque reciente de esa persona que contestar' });
    }

    // Mismo 404 que el resto de Cerca: el motivo no se revela.
    if (await isBlockedBetween(req.user.id, targetId)) {
      return res.status(404).json({ error: 'No hay un toque reciente de esa persona que contestar' });
    }

    // Una respuesta por saludo. Se mide contra la fecha de SU toque, no contra
    // un enfriamiento fijo: si vuelve a saludarte mañana, puedes contestarle
    // otra vez.
    const yaContesté = await prisma.notification.findFirst({
      where: {
        type: 'POKE',
        actorId: req.user.id,
        recipientId: targetId,
        createdAt: { gte: suSaludo.createdAt }
      },
      select: { id: true }
    });
    if (yaContesté) {
      return res.status(429).json({ error: 'Ya le contestaste el saludo 🌿' });
    }

    await prisma.notification.create({
      data: { type: 'POKE', recipientId: targetId, actorId: req.user.id }
    });
    // Siempre true por construcción (acabamos de crear la vuelta y su ida
    // existe), pero se calcula en vez de asumirse: el día que la ventana
    // cambie, este valor sigue diciendo la verdad.
    res.json({ ok: true, saludoMutuo: await seSaludaron(req.user.id, targetId) });
  } catch (e) {
    console.error('Error al contestar el toque:', e);
    res.status(500).json({ error: 'No se pudo contestar el toque' });
  }
});

module.exports = router;
