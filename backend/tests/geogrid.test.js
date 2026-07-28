// Paridad de la cuadrícula entre cliente y servidor.
//
// La fórmula que convierte GPS en celda está implementada DOS veces: en
// backend/src/lib/geogrid.js y en frontend/src/lib/geo.js. Tiene que ser así —
// el cálculo ocurre en el navegador para que las coordenadas reales nunca
// salgan de ahí, y el servidor necesita la misma fórmula para ubicar celdas.
//
// El riesgo es que diverjan en silencio: un STEP_DEG distinto o un redondeo
// diferente no darían error, darían datos incorrectos en una función de
// privacidad. Por eso esta prueba lee el archivo REAL del frontend y compara
// salida contra salida, en vez de copiar la fórmula aquí.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const backend = require('../src/lib/geogrid');

const RUTA_FRONTEND = path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', 'geo.js');

// El archivo del frontend es un módulo ESM; se le quitan los `export` y se
// evalúa aislado para poder llamar a su encodeCell desde Node.
function cargarFrontend() {
  const fuente = fs.readFileSync(RUTA_FRONTEND, 'utf8').replace(/^export\s+/gm, '');
  const caja = {};
  vm.createContext(caja);
  vm.runInContext(`${fuente}\n; __encodeCell = encodeCell; __STEP = STEP_DEG;`, caja);
  return { encodeCell: caja.__encodeCell, STEP_DEG: caja.__STEP };
}

module.exports = async function run() {
  const results = { name: 'Cuadrícula', pass: 0, fail: 0, failures: [] };
  const check = (label, ok, detalle = '') => ok
    ? (results.pass++, console.log(`  ✓ ${label}`))
    : (results.fail++, results.failures.push(label), console.log(`  ✗ ${label} ${detalle}`));

  let front;
  try {
    front = cargarFrontend();
  } catch (e) {
    check('se puede cargar frontend/src/lib/geo.js', false, `(${e.message})`);
    return results;
  }

  console.log('\n  — La constante —');
  check(
    `STEP_DEG coincide (${backend.STEP_DEG})`,
    front.STEP_DEG === backend.STEP_DEG,
    `(front ${front.STEP_DEG} vs backend ${backend.STEP_DEG})`
  );

  console.log('\n  — Puntos con nombre —');
  const lugares = [
    ['Ciudad de México', 19.4326, -99.1332],
    ['Guadalajara', 20.6597, -103.3496],
    ['Monterrey', 25.6866, -100.3161],
    ['Tijuana', 32.5149, -117.0382],
    ['Mérida', 20.9674, -89.5926]
  ];
  for (const [nombre, lat, lon] of lugares) {
    const a = front.encodeCell(lat, lon);
    const b = backend.encode(lat, lon);
    check(`${nombre} → misma celda (${b})`, a === b, `(front ${a} vs backend ${b})`);
  }

  console.log('\n  — Casos límite —');
  const limites = [
    ['ecuador y meridiano cero', 0, 0],
    ['antimeridiano positivo', 0, 180],
    ['antimeridiano negativo', 0, -180],
    ['polo norte', 90, 0],
    ['polo sur', -90, 0],
    ['justo en un borde de celda', 19.42, -99.14],
    ['epsilon antes del borde', 19.419999999, -99.140000001],
    ['longitud negativa cerca de cero', 0.0001, -0.0001]
  ];
  for (const [nombre, lat, lon] of limites) {
    const a = front.encodeCell(lat, lon);
    const b = backend.encode(lat, lon);
    check(`${nombre} → misma celda (${b})`, a === b, `(front ${a} vs backend ${b})`);
  }

  console.log('\n  — Barrido aleatorio —');
  let divergencias = 0;
  let ejemplo = null;
  for (let i = 0; i < 2000; i++) {
    const lat = Math.random() * 180 - 90;
    const lon = Math.random() * 360 - 180;
    if (front.encodeCell(lat, lon) !== backend.encode(lat, lon)) {
      divergencias++;
      ejemplo = ejemplo || `${lat},${lon}`;
    }
  }
  check('2000 coordenadas al azar dan la misma celda', divergencias === 0, `(${divergencias} divergencias, ej. ${ejemplo})`);

  console.log('\n  — La celda que produce el cliente es válida para el servidor —');
  let invalidas = 0;
  for (let i = 0; i < 500; i++) {
    const celda = front.encodeCell(Math.random() * 180 - 90, Math.random() * 360 - 180);
    if (!backend.isValidCell(celda)) invalidas++;
  }
  check('500 celdas del cliente pasan isValidCell', invalidas === 0, `(${invalidas} rechazadas)`);

  return results;
};
