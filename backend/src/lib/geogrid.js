// Cuadrícula fija de ~2 km para la función "Cerca" (reemplaza al geohash de ~5 km).
// Celdas de 0.02° (~2.2 km de lat; ~2.0-2.1 km de lon en el centro de México).
// La celda se calcula EN el cliente (frontend/src/lib/geo.js, misma fórmula) —
// el servidor nunca ve coordenadas reales. Cuadrícula fija: anti-triangulación.
const STEP_DEG = 0.02;
const LAT_CELLS = Math.round(180 / STEP_DEG);  // 9000
const LON_CELLS = Math.round(360 / STEP_DEG);  // 18000

// Formato de celda: "{latIdx}_{lonIdx}" (índices no negativos)
const CELL_RE = /^\d{1,4}_\d{1,5}$/;

function encode(lat, lon) {
  const latIdx = Math.min(LAT_CELLS - 1, Math.max(0, Math.floor((lat + 90) / STEP_DEG)));
  const lonIdx = ((Math.floor((lon + 180) / STEP_DEG) % LON_CELLS) + LON_CELLS) % LON_CELLS;
  return `${latIdx}_${lonIdx}`;
}

function parse(cell) {
  const [latIdx, lonIdx] = cell.split('_').map(Number);
  return { latIdx, lonIdx };
}

function isValidCell(cell) {
  if (typeof cell !== 'string' || !CELL_RE.test(cell)) return false;
  const { latIdx, lonIdx } = parse(cell);
  return latIdx < LAT_CELLS && lonIdx < LON_CELLS;
}

function centroid(cell) {
  const { latIdx, lonIdx } = parse(cell);
  return {
    lat: latIdx * STEP_DEG - 90 + STEP_DEG / 2,
    lon: lonIdx * STEP_DEG - 180 + STEP_DEG / 2
  };
}

// Cuadrícula de celdas alrededor de una celda (rings=5 → 11×11 ≈ radio ~11 km)
function neighborsGrid(cell, rings = 5) {
  const { latIdx, lonIdx } = parse(cell);
  const cells = [];
  for (let i = -rings; i <= rings; i++) {
    const nLat = latIdx + i;
    if (nLat < 0 || nLat >= LAT_CELLS) continue;
    for (let j = -rings; j <= rings; j++) {
      const nLon = ((lonIdx + j) % LON_CELLS + LON_CELLS) % LON_CELLS; // wrap antimeridiano
      cells.push(`${nLat}_${nLon}`);
    }
  }
  return cells;
}

// Distancia haversine entre centroides de dos celdas, en km
function cellDistanceKm(cellA, cellB) {
  const a = centroid(cellA);
  const b = centroid(cellB);
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

module.exports = { STEP_DEG, CELL_RE, encode, isValidCell, centroid, neighborsGrid, cellDistanceKm };
