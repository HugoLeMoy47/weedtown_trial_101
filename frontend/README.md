# WeedTown — Frontend

React (Create React App) servido en producción como **Cloudflare Workers Static Assets**, con un Worker propio delante para la ficha de previsualización de `/p/:id`. Ver el [README raíz](../README.md) para la visión general del proyecto.

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

## El Worker de `/p/:id` (HU-SHR-002, ciclo 7B)

**Por qué existe.** Un enlace de WeedTown pegado en WhatsApp, Telegram, Facebook o X necesita mostrar una ficha con imagen, título y descripción — lo que se conoce como meta tags Open Graph. El problema es que **esto no se puede resolver desde React**: los rastreadores de esas apps no ejecutan JavaScript, así que nunca ven lo que `react-helmet` o un `useEffect` escribirían en el `<head>` después de que la página cargó. Necesitan HTML crudo, servido por el servidor, ya con las meta tags puestas.

Sin este archivo, `weedtown.social` sirve el mismo `index.html` para cualquier ruta — correcto para `/feed`, `/login`, `/auth/callback`, pero para `/p/:id` significa que el enlace se ve como texto plano en cualquier chat.

**Qué hace `src/worker.js`.** Intercepta únicamente `GET /p/:id`:

1. Busca la ficha en la Cache API del borde.
2. Si no hay caché (o está vencida), le pide `GET /api/posts/:id/preview` al backend, con 1.5s de timeout.
3. Toma el `index.html` real del binding de assets (`env.ASSETS`) y usa `HTMLRewriter` para inyectar las meta tags en streaming — sin cargar el documento completo en memoria.
4. Guarda el resultado en caché y responde.

Todo lo que **no** sea `/p/:id` pasa de largo a `env.ASSETS.fetch(request)` — el mismo comportamiento (incluido el fallback SPA de `not_found_handling`) que tenía el proyecto antes de que este Worker existiera. No hay detección de User-Agent: las meta tags son inocuas para un navegador, y sniffear UA para decidir qué servir es frágil y se considera *cloaking*.

**Si "simplificas" esto de vuelta a solo `assets` en `wrangler.jsonc`:** las fichas desaparecen. No hay error, no hay log, nada avisa — `/p/:id` simplemente vuelve a servir el `index.html` genérico. Si vas a tocar el despliegue, lee este archivo primero.

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

| Variable (`wrangler.jsonc` → `vars`) | Qué es |
|---|---|
| `PREVIEW_API_URL` | Origen del backend que consulta el Worker para `GET /api/posts/:id/preview`. En local (`npm run worker:dev`) apunta a `http://localhost:4000`; **en producción hay que cambiarlo a `https://weedtown-api.onrender.com`** antes de desplegar (o moverlo a un secreto/variable del dashboard de Cloudflare si no se quiere commitear el dominio real) |

### Probarlo en local

```
npm run worker:dev
```

Compila (`npm run build`) y levanta `wrangler dev`, que sirve el Worker + los assets tal como los serviría Cloudflare. Con el backend de desarrollo corriendo en el puerto 4000:

```
curl http://127.0.0.1:8787/p/1          # debe traer las meta tags og:* en el <head>
curl http://127.0.0.1:8787/feed         # debe servir el SPA igual que siempre, sin tocarlo
```

### Desplegar

```
npm run deploy
```

Compila y corre `wrangler deploy`. Verifica antes que `vars.PREVIEW_API_URL` en `wrangler.jsonc` apunte al backend real — no al de desarrollo.
