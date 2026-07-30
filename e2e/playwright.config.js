const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  // La base de pruebas vive en Supabase (remota, no Postgres local): cada
  // petición ronda 1-5 s bajo carga y una pantalla hace varias en cadena
  // (auth/me, posts, notifications, blocks...). 30 s por prueba no alcanza.
  timeout: 90000,
  expect: { timeout: 15000 },
  retries: 0,
  reporter: [['list']],
  // Todas las specs comparten un mismo backend y una misma base (el schema de
  // pruebas), no una por worker: en paralelo se pisan entre sí (una ve los
  // posteos de otra en el feed). Se corre en serie a propósito — agregar un
  // proyecto no debe convertirse en concurrencia entre proyectos tampoco.
  workers: 1,
  use: {
    baseURL: process.env.E2E_FRONTEND_URL || 'http://localhost:3021',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  // Dos proyectos, no dos configuraciones que compitan por las mismas specs:
  // "Desktop" corre todo lo de siempre (nada cambia ahí) y "Mobile Chrome"
  // corre SOLO la spec de navegación móvil — que a su vez solo tiene sentido
  // en viewport móvil, porque el menú hamburguesa que prueba está oculto por
  // CSS en escritorio (ver Navbar.jsx). Cruzar specs entre proyectos no suma
  // cobertura real: solo correría cada una donde no puede pasar por diseño.
  projects: [
    {
      name: 'Desktop',
      testIgnore: /mobile-nav\.spec\.js/
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
      testMatch: /mobile-nav\.spec\.js/
    }
  ]
});
