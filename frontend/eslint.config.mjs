import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

// ESLint del frontend (ciclo 12B).
//
// POR QUÉ ESTE ARCHIVO EXISTE, que es lo importante: antes NO había ninguna
// configuración de ESLint en el repo. El linter venía dentro de
// `react-scripts`, y el gate era `CI=true npm run build`, que convertía los
// warnings en error. Al quitar Create React App ese gate **desaparece sin que
// nada falle** — Vite compila igual con código que ESLint rechazaría.
//
// Eso no es teórico: en el ciclo 9E ese gate atrapó un comentario JSX dentro
// del return implícito de un `.map()`, que habría llegado a producción. Perder
// la red al migrar el bundler sería justo el patrón que este proyecto lleva
// varios ciclos cazando: una defensa que parece existir y no está conectada.
//
// Se queda deliberadamente CERCA de lo que CRA aplicaba, no más estricto: el
// objetivo es no perder cobertura, no abrir una discusión de estilo en medio
// de una migración. Endurecerlo después es barato; hacerlo ahora mezcla dos
// cambios y vuelve ilegible el diff.
export default [
  // `.wrangler/` son artefactos que genera `wrangler dev` — código empaquetado
  // por otra herramienta. Lintearlo daba 19 falsos `no-undef` sobre globales
  // del runtime de Cloudflare y tapaba los dos hallazgos reales.
  { ignores: ['build/**', 'node_modules/**', '.wrangler/**'] },

  js.configs.recommended,

  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Con el JSX transform moderno no hace falta importar React en cada
      // archivo, y esta base de código ya no lo hace en todos.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // Un import o una variable sin usar suele ser el resto de algo a medio
      // borrar. Se permite el prefijo `_` para lo intencional.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // APAGADAS A PROPÓSITO, y conviene saber por qué antes de encenderlas.
      //
      // `eslint-plugin-react-hooks` v6 trae reglas que CRA nunca aplicó —
      // `set-state-in-effect` sola marca 21 lugares de esta base de código.
      // Puede que varias tengan razón, pero eso es una revisión de calidad de
      // React, no parte de cambiar de bundler: encenderlas aquí obligaría a
      // refactorizar 21 componentes dentro del mismo diff que mueve el
      // toolchain, y ninguna de las dos cosas se podría revisar bien.
      //
      // El objetivo de este archivo es NO PERDER la cobertura que había, no
      // ganar cobertura nueva. Subirlas es un ciclo aparte, con su propio
      // diff y su propia verificación.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      // Comillas tipográficas en texto JSX. CRA tampoco la tenía, y los 8
      // casos están en el texto legal de Terms.jsx: cambiar copia legal para
      // callar un aviso cosmético es peor negocio que dejarla apagada.
      'react/no-unescaped-entities': 'off'
    }
  },

  {
    // El Worker corre en el runtime de Cloudflare, no en el navegador:
    // HTMLRewriter, caches y ASSETS no existen en `globals.browser`.
    files: ['src/worker.js'],
    languageOptions: { globals: { ...globals.browser, HTMLRewriter: 'readonly', caches: 'readonly' } }
  },

  {
    // Las pruebas usan los globales de Vitest (`globals: true` en vite.config).
    files: ['src/**/*.test.{js,jsx}'],
    languageOptions: { globals: { ...globals.node, describe: 'readonly', test: 'readonly', it: 'readonly', expect: 'readonly' } }
  }
];
