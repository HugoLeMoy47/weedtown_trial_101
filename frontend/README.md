# WeedTown — Frontend

React (Create React App) servido en producción como **Cloudflare Workers Static Assets**, con un Worker propio delante para las fichas de previsualización de `/p/:id` y `/forum/:slug`. Ver el [README raíz](../README.md) para la visión general del proyecto.

## Desarrollo local

```
npm install
npm start
```

Levanta en `http://localhost:3000` contra el backend de `http://localhost:4000` (ver [README raíz → Arranque local](../README.md#-arranque-local)).

## Build de producción

```
npm run build
```

Genera `build/`, que es lo que sirve tanto `serve -s build` en local como Cloudflare en producción.

## El Worker de fichas: `/p/:id` y `/forum/:slug` (HU-SHR-002, ciclo 7B; HU-SHR-004, ciclo 9A)

**Por qué existe.** Un enlace de WeedTown pegado en WhatsApp, Telegram, Facebook o X necesita mostrar una ficha con imagen, título y descripción — lo que se conoce como meta tags Open Graph. El problema es que **esto no se puede resolver desde React**: los rastreadores de esas apps no ejecutan JavaScript, así que nunca ven lo que `react-helmet` o un `useEffect` escribirían en el `<head>` después de que la página cargó. Necesitan HTML crudo, servido por el servidor, ya con las meta tags puestas.

Sin este archivo, `weedtown.social` sirve el mismo `index.html` para cualquier ruta — correcto para `/feed`, `/login`, `/auth/callback`, pero para `/p/:id` y `/forum/:slug` significa que el enlace se ve como texto plano en cualquier chat.

**Qué hace `src/worker.js`.** Intercepta únicamente `GET /p/:id` y `GET /forum/:slug`:

1. Busca la ficha en la Cache API del borde.
2. Si no hay caché (o está vencida), le pide la ficha al backend con 1.5s de timeout — `GET /api/posts/:id/preview` para un posteo, `GET /api/forum/subforums/:slug/preview` para un subforo.
3. Toma el `index.html` real del binding de assets (`env.ASSETS`) y usa `HTMLRewriter` para inyectar las meta tags en streaming — sin cargar el documento completo en memoria.
4. Guarda el resultado en caché y responde.

Los dos recursos comparten TODO salvo tres datos (ruta canónica, endpoint del backend y `og:type`: `article` para un posteo, `website` para un subforo). La tabla de caché de abajo, el escapado y la inyección existen una sola vez.

Todo lo que **no** sea `/p/:id` ni `/forum/:slug` pasa de largo a `env.ASSETS.fetch(request)` — el mismo comportamiento (incluido el fallback SPA de `not_found_handling`) que tenía el proyecto antes de que este Worker existiera. No hay detección de User-Agent: las meta tags son inocuas para un navegador, y sniffear UA para decidir qué servir es frágil y se considera *cloaking*.

> **Trampa del ciclo 9A:** bajo `/forum/` hay dos rutas del SPA, `/forum/:slug` (el subforo, con ficha) y `/forum/:slug/post/:id` (un hilo, **sin** ficha todavía). La regex del Worker usa `[^/]+`, no `.+`, justo para no capturar la segunda: con `.+` tomaría `cultivo/post/42` como slug, pediría una ficha inexistente y serviría la genérica — o sea, rompería las tarjetas de los hilos sin ningún error visible. Hay una prueba por cada caso en `src/worker.test.js`.

**Si "simplificas" esto de vuelta a solo `assets` en `wrangler.jsonc`:** las fichas desaparecen. No hay error, no hay log, nada avisa — esas rutas simplemente vuelven a servir el `index.html` genérico. Si vas a tocar el despliegue, lee este archivo primero.

### Caché resistente al backend dormido

El backend vive en Render (plan gratuito): se duerme a los ~15 min de inactividad y tarda 30–60s en despertar, muy por encima del timeout de cualquier rastreador. La mitigación es cachear largo y servir la copia vieja antes que nada:

| Situación | Qué hace el Worker |
|---|---|
| Caché fresca (< 1h) | La sirve, no toca el backend |
| Caché rancia (< 24h) | La sirve IGUAL, y refresca aparte (sin bloquear la respuesta) |
| Sin caché, backend responde | La construye y la guarda |
| Sin caché, backend falla o tarda > 1.5s | Ficha genérica de WeedTown (no se guarda; el próximo intento reintenta solo) |
| Caché rancia, backend falla o tarda | Sirve la rancia, no la genérica |
| Backend responde 404 explícito | Invalida la caché (aunque estuviera rancia) y sirve la genérica |

Límite aceptado: un enlace que **nunca** se expandió antes cae en la ficha genérica la primera vez si el backend está dormido — hace falta que alguien lo abra una vez para que quede cacheado. Precalentar al compartir o pagar el plan Starter de Render resolverían esto; quedan fuera de alcance a propósito.

### Variables

| Variable | Dónde vive | Valor |
|---|---|---|
| `PREVIEW_API_URL` | `wrangler.jsonc` → `vars` (raíz) | `http://localhost:4000` — solo para `wrangler dev` / `npm run worker:dev` |
| `PREVIEW_API_URL` | `wrangler.jsonc` → `env.production.vars` | `https://weedtown-api.onrender.com` — lo que de verdad se despliega |

Están separados a propósito: si `npm run deploy` leyera el valor de arriba, el Worker en Cloudflare intentaría hablarle a "localhost" desde el borde, fallaría siempre, y como el diseño cae a la ficha genérica sin error (ver la tabla de abajo), **nadie se enteraría** — mismo patrón de "variable mal puesta apaga algo en silencio" que el `apiLimiter` del backend. Por eso `npm run deploy` ya corre `wrangler deploy --env production`: no hay forma de mandar el valor de desarrollo a producción por accidente. Verificado con `npx wrangler deploy --dry-run` (sin `--env`, resuelve a `localhost:4000`) y `npx wrangler deploy --dry-run --env production` (resuelve al dominio real), sin desplegar de verdad.

### Probarlo en local

```
npm run worker:dev
```

Compila (`npm run build`) y levanta `wrangler dev`, que sirve el Worker + los assets tal como los serviría Cloudflare. Con el backend de desarrollo corriendo en el puerto 4000:

```
curl http://127.0.0.1:8787/p/1                       # meta tags og:* en el <head>, og:type=article
curl http://127.0.0.1:8787/forum/senadito-420        # meta tags og:* del subforo, og:type=website
curl http://127.0.0.1:8787/forum/no-existe           # ficha genérica, 200, sin tronar
curl http://127.0.0.1:8787/forum/senadito-420/post/13 # CERO og:* — el SPA tal cual (ver la trampa del 9A)
curl http://127.0.0.1:8787/feed                      # el SPA igual que siempre, sin tocarlo
```

`curl -I` (HEAD) **no** sirve para inspeccionar estos headers: el Worker solo actúa sobre `GET`, así que un HEAD pasa de largo a los assets y devuelve el `Cache-Control` de ellos (`max-age=0, must-revalidate`), no el de la ficha. Para ver los headers reales que recibe el cliente, usa un GET descartando el cuerpo:

```
curl -sD- -o /dev/null http://127.0.0.1:8787/forum/senadito-420
```

Debe traer `Cache-Control: public, max-age=300` (el TTL corto del cliente) y **ningún** `X-Wt-Cached-At` — ese header es interno de la caché del borde y no debe salir al navegador.

### Desplegar

```
npm run deploy
```

Compila y corre `wrangler deploy --env production`, que toma `PREVIEW_API_URL` de `env.production.vars` en `wrangler.jsonc` — ya apunta al backend real, no hace falta editar nada antes de desplegar.

### Deploy automático (Cloudflare) — y por qué el comando importa dos veces

En la práctica **nadie corre `npm run deploy` a mano en producción**: Cloudflare tiene su propia integración de Git conectada a este repo, y hace un deploy automático en cada push a `main`. Eso significa que el comando correcto tiene que estar bien puesto **en dos lugares independientes**, no solo en `package.json`:

1. **`package.json` → script `deploy`** (arriba): ya corre `wrangler deploy --env production`. Este es el que usa quien despliega a mano desde su máquina.
2. **El dashboard de Cloudflare, en su propio campo de configuración** — Workers & Pages → **`weedtown`** → **Settings → Build → Build configuration → Deploy command**. Este campo **no lee `package.json`**: es un comando independiente que Cloudflare guarda en su propia configuración de la integración de Git, y es el que corre en cada deploy automático. Debe decir exactamente:
   ```
   npx wrangler deploy --env production
   ```

**Por qué el flag es obligatorio en los dos:** sin `--env production`, `wrangler deploy` toma `vars` de la raíz de `wrangler.jsonc` — el valor de desarrollo de `PREVIEW_API_URL` (`http://localhost:4000`), inalcanzable desde el edge de Cloudflare (ver la sección "Variables" arriba y el comentario de `src/worker.js:62-69`). El Worker no falla ni avisa: cae a la ficha genérica en silencio para *todo* `/p/:id` y `/forum/:slug`.

**Esto ya pasó.** El campo del dashboard llegó a tener el comando sin el flag, y `weedtown.social` sirvió la ficha genérica para todos los posteos hasta que se corrigió (2026-08-07). Si vuelves a configurar este Worker desde cero, o si Cloudflare alguna vez resetea la configuración de build al reconectar el repositorio, **revisa este campo primero** — es la causa más probable si las fichas de `/p/:id` dejan de traer datos reales sin que nada más haya cambiado.

**El dominio también vive solo en el dashboard.** `weedtown.social` está enlazado al Worker como **Custom Domain** (Settings → **Domains**), no como una Workers Route de zona clásica — si buscas el binding en "Workers Routes" a nivel de cuenta, esa lista aparece vacía a propósito; no es un error, es que el binding vive en la página del Worker, no en la de la zona.
