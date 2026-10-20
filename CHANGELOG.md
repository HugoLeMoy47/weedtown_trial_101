# Changelog

Formato inspirado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
adaptado a **una entrada por ciclo de trabajo** (no por commit ni por versión
semántica) — así es como se planea y se audita este proyecto. El razonamiento
de cada ciclo — trampas, opciones descartadas, hallazgos transferibles — vive
en `.planeacion/` (privado, sin versionar); esto es el registro del cambio:
qué se tocó y por qué, en dos o tres líneas.

Una tanda de CI falla si hay commits que tocan `backend/src/` o
`frontend/src/` desde el último cambio de este archivo (ver
`backend/tests/changelogAlDia.test.js`), salvo que el commit lleve
`[skip changelog]` en el mensaje.

## Entre los ciclos 14 y 15 — chat, handle, mes patrio y etiquetas PE420 (2026-09-11 → 2026-10-16)

Entró a `main` en paralelo a la rama del ciclo 15, sin plan ni prompt, y se
registra aquí a posteriori al cerrar el ciclo 15 (política P-03). Lo que sigue
sale de los mensajes de commit, no de una auditoría: **no se ha auditado.**

### Añadido
- Chat: reciprocidad estricta y privacidad de presencia en tiempo real (migración `chat_reciprocidad_y_presencia`).
- Cambio de handle con cooldown de 180 días (máximo 2 al año; el primer cambio de una cuenta nueva es libre), `GET /api/profile/check-handle` y validación en vivo en el perfil (migración `handle_cooldown_politica`).
- Temática visual del mes patrio con toggle manual.
- Estudio de etiquetado artesanal PE420 en `etkt420.weedtown.social` y `/etiquetas`, y ficha Open Graph de 1200×630 desde el Worker (`run_worker_first`).

### Corregido
- Gate de `npm audit` en rojo por avisos nuevos (axios, undici, sharp, `proxy-addr` crítica en backend, entre otros): `npm audit fix` en ambos lockfiles. El backend audita solo producción (`--omit=dev`) porque `braces`, vía `nodemon`, no tiene versión corregida.

## Ciclo 15 — Reparación del ciclo 14 y guardia de proceso (2026-09-03)

### Corregido
- **P0:** una mención en un posteo `FRIENDS` filtraba el contenido completo a quien no era amigo del autor, tanto por la campana como por WebSocket.
- **P1:** Cerca publicaba en el feed al compartir zona por defecto (opt-out disfrazado de opt-in) y arrastraba la intención a un posteo público permanente.
- **P1:** `mention-suggestions` aceptaba `q` de un carácter y buscaba en toda la plataforma sin respetar el perfil público, fuera de la red de quien busca.
- **P2 × 3 + P3 × 2:** reasignación de suscripción push por endpoint ajeno; SSRF por host de push sin lista blanca; menciones sin tope por texto; regex de mención discrepante entre frontend y backend; `TOKEN_REGEX.lastIndex` compartido entre renders; `notificationclick` del Service Worker secuestrando la pestaña activa.
- **15F, auditoría del propio ciclo 15:** el recorte de contenido ajeno era una *denylist* por tipo (`type !== 'MENTION'`) que habría dejado pasar cualquier tipo nuevo con destinatario tercero — se invirtió a *allowlist* (`TIPOS_CON_EXTRACTO`). De paso se cerró el mismo patrón en `forumPost.title`, que la primera pasada del ciclo dejó sin recortar. Y una prueba propia del ciclo afirmaba sobre el total de notificaciones en vez del delta, así que nunca podía pasar como estaba escrita — corregida.
- El proyecto Supabase dedicado a pruebas se eliminó; `weedtown_test` pasa a vivir en el mismo proyecto que producción, distinguido solo por `?schema=` (política P-01). Al correr la suite completa por primera vez desde que el proyecto anterior se cayó, aparecieron tres bugs pre-existentes que nadie había podido ver: el guardia de producción de `consolidar-foros.js` comparaba solo el ref de proyecto (ahora también mira el schema); `atribucionConteo.test.js` tenía una consulta a `information_schema.columns` sin `table_schema = current_schema()` (duplicaba columnas); y la prueba de bloqueo mutuo en `menciones.test.js` llamaba a una ruta que nunca existió desde el ciclo 14, así que nunca bloqueó a nadie de verdad.

### Añadido
- Este archivo, y la prueba de CI que exige mantenerlo al día (`backend/tests/changelogAlDia.test.js`).

## Ciclo 14 — Web Push, menciones y presencia en Cerca (2026-08-25 → 2026-09-03)

### Añadido
- Web Push (VAPID) con Service Worker, suscripción/desuscripción y despachador asíncrono no bloqueante.
- Menciones `@handle` con autocompletado y notificaciones en feed y foros.
- Botón de chat directo desde el perfil público, embebido de YouTube, navegación directa desde la campana de notificaciones y publicación opcional de presencia en Cerca.

Entregado sin plan ni prompt — el primer ciclo desde que existe el método sin
ninguno de los dos. Origen de la auditoría (`2026-09-03_auditoria_ciclo14.html`)
que produjo el ciclo 15.

## Ciclo 13 — Ola 5: activación (2026-08-10)

### Añadido
- Conteo de atribución persistente (`ConteoAtribucion`) para auditar altas referidas.
- Diálogo de bienvenida para incorporar perfiles vacíos en cuarentena.
- Consolidación de subforos dispersos en cuatro temáticos activos (Cultivo, Extracciones, Cultura y Dudas).
- Saludo mutuo en Cerca (responder un toque desde la campana) y fechas relativas unificadas con actualización en vivo.

### Corregido
- Ningún respaldo era restaurable: faltaba registrar en `scripts/respaldo.js` el modelo `ConteoAtribucion` recién creado en este mismo ciclo.

## Ciclo 12 — Ola 4: consolidación y confiabilidad (2026-08-10)

### Añadido
- E2E de Playwright conectado a CI contra un Postgres efímero del runner.
- `documentacionApi.test.js`: guardia que compara rutas montadas contra `swagger.json` y truena en CI si se desfasan.
- Gate de `npm audit --audit-level=high` en frontend y backend.
- Respaldo estructurado de tablas en orden topológico de FK, con restauración probada.

### Corregido
- Cuatro fallas intermitentes de CI: una aserción de cuarentena que dependía del reloj, `reset.js` exigiendo `.env.test` en el runner de E2E, el handle duplicado en el perfil, y un comentario dentro de un bloque plegado de YAML que tumbaba ambos jobs.

## Ciclo 11 — Ola 3: crecimiento y juego (2026-08-09)

### Añadido
- Invitaciones con contador ciego (`/@handle?ref=perfil`), sin relación persistida en base entre invitador e invitado.
- Ficha Open Graph de perfil para redes sociales, generada en el Worker de Cloudflare.

### Corregido
- El aviso de "te invitó" nunca aparecía, y quedaba un `0` suelto colgado en el perfil.
