// Ofuscación de ubicación EN el cliente para la función "Cerca".
// El GPS del navegador se convierte aquí a una celda geohash de ~5 km
// (precisión 5) y SOLO la celda viaja al backend — las coordenadas reales
// nunca salen de este navegador. Cuadrícula fija: anti-triangulación.
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export const CELL_PRECISION = 5;

export function encodeCell(lat, lon, precision = CELL_PRECISION) {
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

// Pide la ubicación al navegador y devuelve SOLO la celda ofuscada
export function getMyCell() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Tu navegador no soporta geolocalización'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(encodeCell(pos.coords.latitude, pos.coords.longitude)),
      (err) => reject(new Error(
        err.code === 1
          ? 'Permiso de ubicación denegado. Actívalo en tu navegador para usar Cerca.'
          : 'No se pudo obtener tu ubicación. Intenta de nuevo.'
      )),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  });
}
