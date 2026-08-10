// Orquesta un ciclo de E2E completo: reinicia el schema de pruebas del
// backend (el mismo que usa `backend/tests`, nunca el de desarrollo),
// levanta backend + frontend apuntando ahí, corre las specs de Playwright
// contra un navegador real, y apaga todo al terminar.
//
// Requiere:
//   - backend/.env.test (mismas reglas que backend/tests/run.js)
//   - el navegador de Playwright instalado una vez: npx playwright install chromium
//
// Uso:  npm test   (desde e2e/)
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const FRONTEND = path.join(ROOT, 'frontend');
const ENV_TEST = path.join(BACKEND, '.env.test');

const BACKEND_PORT = process.env.E2E_BACKEND_PORT || 4020;
const FRONTEND_PORT = process.env.E2E_FRONTEND_PORT || 3021;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
const SHELL = process.platform === 'win32';

function abortar(mensaje) {
  console.error(`\n✗ ${mensaje}\n`);
  process.exit(1);
}

// En local el entorno sale de backend/.env.test; en CI ya viene inyectado en
// el ambiente, igual que en backend/tests/run.js. Exigir el archivo era lo que
// impedía correr esto en el runner de GitHub (ciclo 12A).
const EN_CI = Boolean(process.env.CI);
if (EN_CI) {
  if (!process.env.DATABASE_URL) abortar('En CI hace falta DATABASE_URL en el entorno.');
  if (!process.env.JWT_SECRET) abortar('En CI hace falta JWT_SECRET en el entorno.');
} else {
  if (!fs.existsSync(ENV_TEST)) {
    abortar(
      'Falta backend/.env.test — las specs E2E corren contra el mismo schema de ' +
      'pruebas que la suite de integración (ver backend/tests/run.js).'
    );
  }
  require('dotenv').config({ path: ENV_TEST, override: true });
}

const entornoBackend = {
  ...process.env,
  PORT: String(BACKEND_PORT),
  BACKEND_URL,
  FRONTEND_URL,
  // Sin credenciales de verdad: las specs de enlace mágico siembran el token
  // directo en la base, igual que la suite de integración.
  MAIL_DRIVER: 'log'
};

let backendProc = null;
let frontendProc = null;

async function esperar(url, intentos = 90) {
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch { /* todavía no responde */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

function apagar(proc) {
  if (!proc || proc.killed) return;
  if (SHELL) spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  else proc.kill('SIGTERM');
}

async function main() {
  console.log('\nReiniciando el schema de pruebas…');
  const reset = spawnSync('node', ['tests/reset.js'], {
    cwd: BACKEND, env: entornoBackend, stdio: 'inherit', shell: SHELL
  });
  if (reset.status !== 0) abortar('No se pudo reiniciar el schema de pruebas.');

  console.log('\nLevantando el backend de pruebas…');
  backendProc = spawn('node', ['app.js'], { cwd: BACKEND, env: entornoBackend, stdio: 'inherit' });
  backendProc.on('error', e => abortar(`No se pudo iniciar el backend: ${e.message}`));
  if (!await esperar(`${BACKEND_URL}/health`)) abortar('El backend de pruebas no respondió a tiempo.');
  console.log('  backend listo');

  // En CI se sirve el frontend COMPILADO; en local, el servidor de desarrollo.
  // El porqué está en servidorEstatico.js — resumido: en CI interesa probar lo
  // que se despliega, y el dev server de CRA es lento y a veces se cuelga en
  // runners sin TTY.
  if (EN_CI) {
    console.log('\nCompilando el frontend contra el backend de pruebas…');
    // Vite incrusta VITE_* en tiempo de COMPILACIÓN, no de ejecución: si esta
    // variable no está aquí, el bundle apunta al backend equivocado y todas las
    // specs fallan con errores de red que no dicen por qué. (Antes de la
    // migración del 12B la variable se llamaba REACT_APP_API_URL.)
    const build = spawnSync('npm', ['run', 'build'], {
      cwd: FRONTEND,
      env: { ...process.env, VITE_API_URL: BACKEND_URL, CI: 'true' },
      stdio: 'inherit', shell: SHELL
    });
    if (build.status !== 0) abortar('No se pudo compilar el frontend.');

    // EN SU PROPIO PROCESO, no en éste. Abajo se corre Playwright con
    // `spawnSync`, que **bloquea el event loop** de este proceso durante toda
    // la tanda: un servidor levantado aquí adentro acepta la conexión y no
    // contesta jamás. Costó una corrida entera de diagnóstico — las 10 specs
    // agotaron su timeout de 1.7 min cada una contra un servidor mudo, y
    // Playwright no dice "el servidor no responde", dice "no encontré el
    // elemento".
    frontendProc = spawn('node', ['servidorEstatico.js', String(FRONTEND_PORT)], {
      cwd: __dirname, stdio: 'inherit'
    });
    frontendProc.on('error', e => abortar(`No se pudo servir el frontend compilado: ${e.message}`));
    if (!await esperar(FRONTEND_URL, 30)) abortar('El frontend compilado no respondió.');
    console.log(`  frontend compilado sirviéndose en ${FRONTEND_URL}\n`);
  } else {
    console.log('\nLevantando el frontend, apuntando al backend de pruebas…');
    // `--port` como bandera, no como variable de entorno: Vite NO lee PORT, a
    // diferencia de react-scripts. Sin esto el servidor arrancaría en 3000 y
    // las specs golpearían el puerto equivocado (o el de otra cosa que esté
    // corriendo ahí).
    frontendProc = spawn('npm', ['start', '--', '--port', String(FRONTEND_PORT), '--strictPort'], {
      cwd: FRONTEND,
      env: { ...process.env, VITE_API_URL: BACKEND_URL },
      stdio: 'inherit',
      shell: SHELL
    });
    frontendProc.on('error', e => abortar(`No se pudo iniciar el frontend: ${e.message}`));
    // El primer arranque de Vite compila dependencias; es rápido, pero se deja
    // margen holgado porque en una máquina fría igual tarda.
    if (!await esperar(FRONTEND_URL, 180)) abortar('El frontend de pruebas no respondió a tiempo.');
    console.log('  frontend listo\n');
  }

  const pw = spawnSync('npx', ['playwright', 'test'], {
    cwd: __dirname,
    env: { ...process.env, E2E_FRONTEND_URL: FRONTEND_URL, E2E_BACKEND_URL: BACKEND_URL },
    stdio: 'inherit',
    shell: SHELL
  });

  return pw.status ?? 1;
}

main()
  .then(codigo => { apagar(backendProc); apagar(frontendProc); process.exit(codigo); })
  .catch(e => {
    console.error('\n✗ Error en el ciclo E2E:', e);
    apagar(backendProc); apagar(frontendProc);
    process.exit(1);
  });
