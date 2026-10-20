/* global process, URL */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Versión visible (ciclo 19B). Tres datos que se fijan al COMPILAR y viajan en
// el bundle: el ciclo, el commit y la fecha de build. Nada de esto puede romper
// el build: cada dato tiene una salida «desconocido» en vez de lanzar.
//
// El commit llega de donde haya: Cloudflare Workers Builds lo da como
// WORKERS_CI_COMMIT_SHA; GitHub Actions como GITHUB_SHA; en local, git. Se
// muestran 7 caracteres.
//
// La versión es el número de ciclo de la última entrada de CHANGELOG.md, NO
// `package.json`, que dice 1.0.0 desde el inicio y nunca significó nada: aquí
// el CHANGELOG es lo único que se mantiene al día por exigencia de CI.
function commitCorto() {
  const deEntorno = process.env.WORKERS_CI_COMMIT_SHA || process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA;
  if (deEntorno) return deEntorno.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'desconocido';
  } catch {
    return 'desconocido';
  }
}

function cicloDelChangelog() {
  try {
    const texto = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
    const m = /^## Ciclo (\d+)/m.exec(texto);
    return m ? m[1] : 'desconocido';
  } catch {
    return 'desconocido';
  }
}

// Migración de Create React App a Vite (ciclo 12B).
//
// CRA dejó de recibir mantenimiento y el costo ya se veía en tres lugares: MUI
// fijado en v5 por incompatibilidad con react-scripts 5, el grueso de los
// avisos de `npm audit` viniendo del toolchain (32 altos y 2 críticos, contra
// 0 en el backend), y cada dependencia nueva entrando con la duda de si CRA la
// soporta.
export default defineConfig({
  plugins: [react()],

  // Constantes de compilación (ver arriba). `src/lib/version.js` las lee con
  // `typeof`, así que un entorno que no pase por Vite no falla.
  define: {
    __WT_CICLO__: JSON.stringify(cicloDelChangelog()),
    __WT_COMMIT__: JSON.stringify(commitCorto()),
    __WT_CONSTRUIDO_EN__: JSON.stringify(new Date().toISOString())
  },

  // `build` y no el `dist` por defecto de Vite. NO es preferencia estética:
  // `wrangler.jsonc` declara `assets.directory: "build"` y `e2e/run.js` sirve
  // esa carpeta. Cambiar la salida obligaría a tocar el despliegue de
  // Cloudflare —que vive en su dashboard, fuera de este repo— y ese es
  // justamente el tipo de cambio que se rompe en silencio. La migración ya
  // trae bastante riesgo; el nombre de la carpeta no necesita sumar.
  build: {
    outDir: 'build',
    // CRA emitía `static/js/main.<hash>.js`; Vite emite `assets/index-<hash>.js`.
    // Nada del Worker depende de esa forma —sirve el index.html y deja pasar
    // el resto— pero queda dicho porque la documentación citaba el nombre viejo.
    sourcemap: false
  },

  server: { port: 3000 },
  preview: { port: 3000 },

  // NO hay configuración para "JSX dentro de archivos .js", y es a propósito.
  // `src/index.js` y `src/theme.js` tenían JSX; CRA lo toleraba y Vite no.
  // El primer intento fue configurar el loader, y no aplicó — la forma de
  // hacerlo cambia entre versiones de Vite. Se renombraron a `.jsx`, que es lo
  // que de verdad son: dos archivos movidos una vez, contra una opción frágil
  // que hay que revisar en cada actualización. Los imports son sin extensión,
  // así que nada más se tocó.

  // ACEPTA LOS DOS PREFIJOS DURANTE LA TRANSICIÓN.
  //
  // Vite expone al cliente solo las variables con prefijo declarado. El nombre
  // nuevo es VITE_API_URL, pero Render, el job de E2E y cualquier nota vieja
  // siguen hablando de REACT_APP_API_URL. Si solo se aceptara el nuevo, una
  // configuración desactualizada haría que el bundle apunte al backend
  // equivocado **sin ningún error** — el modo de fallo más caro de esta
  // migración. Aceptando los dos, lo viejo sigue funcionando y `api.js` avisa
  // por consola para que la limpieza sea deliberada y no un descubrimiento.
  envPrefix: ['VITE_', 'REACT_APP_'],

  test: {
    // Las pruebas son de funciones puras (el Worker, validación de rutas,
    // recorte, etiquetas). Ninguna toca el DOM, así que no hace falta jsdom
    // ni una dependencia más — ver el comentario de recorte.test.js.
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
    globals: true
  }
});
