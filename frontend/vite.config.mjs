import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Migración de Create React App a Vite (ciclo 12B).
//
// CRA dejó de recibir mantenimiento y el costo ya se veía en tres lugares: MUI
// fijado en v5 por incompatibilidad con react-scripts 5, el grueso de los
// avisos de `npm audit` viniendo del toolchain (32 altos y 2 críticos, contra
// 0 en el backend), y cada dependencia nueva entrando con la duda de si CRA la
// soporta.
export default defineConfig({
  plugins: [react()],

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
