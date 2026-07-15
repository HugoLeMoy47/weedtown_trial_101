// Función "Cerca": descubrir comunidad en tu zona con ubicación ofuscada.
// Principios: (1) el servidor solo recibe la CELDA geohash de ~5 km calculada
// en el navegador — nunca coordenadas; (2) recíproco: solo ves si compartes;
// (3) la celda caduca a los 7 días; (4) cuadrícula fija anti-triangulación.
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const prisma = require('../lib/prisma');
const { requireAuth } = require('../middlewares/requireAuth');
const { CELL_RE, centroid, neighborsGrid, cellDistanceKm } = require('../lib/geohash');

const CELL_TTL_DAYS = 7;
const GRID_RINGS = 2; // 5×5 celdas ≈ radio efectivo ~12 km

const participantSelect = { id: true, name: true, displayName: true, avatar: true, acct: true };

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
  const rounded = Math.max(5, Math.round(km / 5) * 5);
  return `A ~${rounded} km`;
}

// GET /api/nearby/location — mi estado de compartir (celda propia o null)
router.get('/location', requireAuth, async (req, res) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { nearbyCell: true, nearbyUpdatedAt: true }
    });
    const active = Boolean(me?.nearbyCell && me.nearbyUpdatedAt >= cutoffDate());
    res.json({ sharing: active, cell: active ? me.nearbyCell : null, updatedAt: active ? me.nearbyUpdatedAt : null });
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
  const cell = typeof req.body.cell === 'string' ? req.body.cell.trim().toLowerCase() : '';
  if (!CELL_RE.test(cell)) {
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
    await prisma.user.update({
      where: { id: req.user.id },
      data: { nearbyCell: null, nearbyUpdatedAt: null }
    });
    res.json({ sharing: false });
  } catch (e) {
    console.error('Error al dejar de compartir zona:', e);
    res.status(500).json({ error: 'Error al dejar de compartir' });
  }
});

// GET /api/nearby — personas en mi zona y alrededores (recíproco)
router.get('/', requireAuth, nearbyLimiter, async (req, res) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { nearbyCell: true, nearbyUpdatedAt: true }
    });
    if (!me?.nearbyCell || me.nearbyUpdatedAt < cutoffDate()) {
      return res.status(403).json({ error: 'Comparte tu zona para ver quién anda cerca (es recíproco)' });
    }

    const cells = neighborsGrid(me.nearbyCell, GRID_RINGS);
    const users = await prisma.user.findMany({
      where: {
        id: { not: req.user.id },
        nearbyCell: { in: cells },
        nearbyUpdatedAt: { gte: cutoffDate() }
      },
      select: { ...participantSelect, nearbyCell: true }
    });

    const people = users
      .map(u => {
        const km = cellDistanceKm(me.nearbyCell, u.nearbyCell);
        const { nearbyCell, ...pub } = u;
        return { ...pub, cell: nearbyCell, distanceKm: Math.round(km), band: bandLabel(km, nearbyCell === me.nearbyCell) };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

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

module.exports = router;
