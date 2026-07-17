// Ofuscación de ubicación EN el cliente para la función "Cerca".
// El GPS del navegador se convierte aquí a una celda de cuadrícula fija de
// ~2 km (0.02°) y SOLO la celda viaja al backend — las coordenadas reales
// nunca salen de este navegador. Misma fórmula que backend/src/lib/geogrid.js.
const STEP_DEG = 0.02;
const LAT_CELLS = Math.round(180 / STEP_DEG);  // 9000
const LON_CELLS = Math.round(360 / STEP_DEG);  // 18000

export function encodeCell(lat, lon) {
  const latIdx = Math.min(LAT_CELLS - 1, Math.max(0, Math.floor((lat + 90) / STEP_DEG)));
  const lonIdx = ((Math.floor((lon + 180) / STEP_DEG) % LON_CELLS) + LON_CELLS) % LON_CELLS;
  return `${latIdx}_${lonIdx}`;
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
