const { defineConfig } = require('@playwright/test');

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
  // posteos de otra en el feed). Se corre en serie a propósito.
  workers: 1,
  use: {
    baseURL: process.env.E2E_FRONTEND_URL || 'http://localhost:3021',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
});
