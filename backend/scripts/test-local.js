// Pruebas de integración contra un Postgres LOCAL en Docker (ciclo 19.5, B23).
//
// POR QUÉ EXISTE. `npm test` corre contra el Supabase remoto: una pasada tarda
// ~25 minutos (cada consulta cruza internet) y una caída de red a mitad de
// corrida la mata sin que el código tenga nada que ver (P1001, 2026-10-20). El
// CI hace la MISMA suite en menos de un minuto porque su Postgres vive en el
// runner. Esto le da a la máquina de desarrollo lo mismo.
//
// Encaja con la política P-01: las pruebas nunca tocan la base viva. Aquí ni
// siquiera tocan el proyecto de Supabase: un contenedor efímero, en su propio
// puerto, con la base en memoria (tmpfs). Al pararlo, todo se va.
//
// Uso:  npm run test:local                (toda la suite)
//       npm run test:local -- chat.test.js (solo esa suite)
//       npm run test:local:parar           (apaga y borra el contenedor)
//
// No toca `.env.test`: usa su propio archivo (`.env.test.local`, ignorado por
// git; se crea a partir del ejemplo la primera vez) y se lo indica al runner
// con TEST_ENV_FILE. Los guardias de run.js se aplican igual.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const NOMBRE = 'weedtown-pg-test';
const PUERTO = 55432; // lejos del 5432 de otros proyectos
const IMAGEN = 'postgres:16'; // la misma que usa el CI
const ENV_LOCAL = path.join(ROOT, '.env.test.local');
const ENV_EJEMPLO = path.join(ROOT, '.env.test.local.example');

const docker = (args, opciones = {}) => spawnSync('docker', args, { encoding: 'utf8', ...opciones });

function abortar(mensaje) {
  console.error(`\n✗ ${mensaje}\n`);
  process.exit(1);
}

if (process.argv.includes('--parar')) {
  docker(['rm', '-f', NOMBRE]);
  console.log(`Contenedor ${NOMBRE} apagado y borrado.`);
  process.exit(0);
}

if (docker(['version', '--format', '{{.Server.Version}}']).status !== 0) {
  abortar('Docker no responde. Abre Docker Desktop y vuelve a intentarlo.');
}

// 1. El contenedor: si existe y está corriendo, se reutiliza; si existe parado,
//    se arranca; si no, se crea.
const estado = docker(['inspect', '-f', '{{.State.Running}}', NOMBRE]);
if (estado.status !== 0) {
  console.log(`Creando ${NOMBRE} (${IMAGEN}) en el puerto ${PUERTO}…`);
  const creado = docker([
    'run', '-d', '--name', NOMBRE,
    '-e', 'POSTGRES_USER=postgres', '-e', 'POSTGRES_PASSWORD=postgres', '-e', 'POSTGRES_DB=weedtown_ci',
    // Base en memoria: más rápida, y no deja nada en disco que limpiar.
    '--tmpfs', '/var/lib/postgresql/data',
    // Solo escucha en la propia máquina.
    '-p', `127.0.0.1:${PUERTO}:5432`,
    IMAGEN
  ]);
  if (creado.status !== 0) abortar(`No se pudo crear el contenedor:\n${creado.stderr}`);
} else if (estado.stdout.trim() !== 'true') {
  console.log(`Arrancando ${NOMBRE}…`);
  const arrancado = docker(['start', NOMBRE]);
  if (arrancado.status !== 0) abortar(`No se pudo arrancar el contenedor:\n${arrancado.stderr}`);
}

// 2. Esperar a que acepte conexiones (hasta ~30 s).
let listo = false;
for (let i = 0; i < 60 && !listo; i++) {
  listo = docker(['exec', NOMBRE, 'pg_isready', '-U', 'postgres', '-d', 'weedtown_ci']).status === 0;
  if (!listo) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
}
if (!listo) abortar(`${NOMBRE} no aceptó conexiones a tiempo. Revisa: docker logs ${NOMBRE}`);

// 3. El archivo de entorno local, a partir del ejemplo.
if (!fs.existsSync(ENV_LOCAL)) {
  if (!fs.existsSync(ENV_EJEMPLO)) abortar('Falta backend/.env.test.local.example.');
  fs.copyFileSync(ENV_EJEMPLO, ENV_LOCAL);
  console.log('Creado backend/.env.test.local (ignorado por git).');
}

// 4. El runner de siempre, apuntando a ese archivo.
const argumentos = process.argv.slice(2).filter(a => a !== '--');
const corrida = spawnSync(process.execPath, [path.join(ROOT, 'tests', 'run.js'), ...argumentos], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, TEST_ENV_FILE: ENV_LOCAL }
});
process.exit(corrida.status ?? 1);
