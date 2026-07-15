// Geohash mínimo para la función "Cerca" (sin dependencias).
// Una celda de precisión 5 mide ~4.9 × 4.9 km: es la unidad de ofuscación.
// El servidor SOLO maneja celdas — las coordenadas reales nunca llegan aquí;
// el encode en el cliente existe en frontend/src/lib/geo.js.
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

const CELL_PRECISION = 5;
const CELL_RE = /^[0-9b-hjkmnp-z]{5}$/;

function encode(lat, lon, precision = CELL_PRECISION) {
  let minLat = -90, maxLat = 90, minLon = -180, maxLon = 180;
  let hash = '';
  let bits = 0, bit = 0, evenBit = true;
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (minLon + maxLon) / 2;
      if (lon >= mid) { bit = bit * 2 + 1; minLon = mid; } else { bit = bit * 2; maxLon = mid; }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) { bit = bit * 2 + 1; minLat = mid; } else { bit = bit * 2; maxLat = mid; }
    }
    evenBit = !evenBit;
    if (++bits === 5) {
      hash += BASE32[bit];
      bits = 0; bit = 0;
    }
  }
  return hash;
}

function decodeBounds(hash) {
  let minLat = -90, maxLat = 90, minLon = -180, maxLon = 180;
  let evenBit = true;
  for (const ch of hash) {
    const idx = BASE32.indexOf(ch);
    for (let n = 4; n >= 0; n--) {
      const bit = (idx >> n) & 1;
      if (evenBit) {
        const mid = (minLon + maxLon) / 2;
        if (bit === 1) minLon = mid; else maxLon = mid;
      } else {
        const mid = (minLat + maxLat) / 2;
        if (bit === 1) minLat = mid; else maxLat = mid;
      }
      evenBit = !evenBit;
    }
  }
  return { minLat, maxLat, minLon, maxLon };
}

function centroid(hash) {
  const b = decodeBounds(hash);
  return { lat: (b.minLat + b.maxLat) / 2, lon: (b.minLon + b.maxLon) / 2 };
}

// Cuadrícula de celdas alrededor de una celda (rings=2 → 5×5 ≈ 25 km de lado)
function neighborsGrid(hash, rings = 2) {
  const { lat, lon } = centroid(hash);
  const b = decodeBounds(hash);
  const dLat = b.maxLat - b.minLat;
  const dLon = b.maxLon - b.minLon;
  const cells = new Set();
  for (let i = -rings; i <= rings; i++) {
    const nLat = lat + i * dLat;
    if (nLat > 90 || nLat < -90) continue;
    for (let j = -rings; j <= rings; j++) {
      const nLon = ((lon + j * dLon + 540) % 360) - 180; // wrap antimeridiano
      cells.add(encode(nLat, nLon, hash.length));
    }
  }
  return [...cells];
}

// Distancia haversine entre centroides de dos celdas, en km
function cellDistanceKm(hashA, hashB) {
  const a = centroid(hashA);
  const b = centroid(hashB);
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

module.exports = { CELL_PRECISION, CELL_RE, encode, decodeBounds, centroid, neighborsGrid, cellDistanceKm };
