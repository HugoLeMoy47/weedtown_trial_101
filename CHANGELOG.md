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

## Ciclo 19.5 — Términos: cláusula de medición y registro de aceptación (2026-10-20)

### Añadido
- **Cláusula «Medición de uso, sin historial»** publicada en `Terms.jsx` (sección 2), con el texto aprobado por el PO. Declara lo que el 19A ya guardaba: solo la fecha del último día de uso, que se sobrescribe; se borra al eliminar la cuenta y sale en la exportación. Los Términos muestran su versión vigente.
- **Registro de la aceptación:** `User.terminosVersion` y `User.terminosAceptadosEn` (migración `20261020220000_terminos_aceptacion`). La versión es la fecha de publicación del texto (`2026-10-20`) y vive en `backend/src/lib/terminos.js` y `frontend/src/lib/terminos.js`; una prueba falla si divergen. `POST /api/profile/me/terminos` solo acepta la versión **vigente**, es idempotente (cuenta la primera aceptación) y está documentado en Swagger. `GET /api/auth/me` devuelve `terminosVersion`, `terminosAceptadosEn` y `terminosVigentes`. El dato se exporta con «mis datos» y se borra al eliminar la cuenta.
- **Desde el login:** marcar la casilla de 18+ y Términos deja la marca de la versión leída; al haber sesión, se registra en silencio. Las **113 cuentas existentes** quedan sin versión (no podían aceptar un texto que no existía) y ven **un aviso una vez por sesión**, con «Más tarde» y «Acepto» de igual peso. No bloquea nada.

- **Frase «Registro de aceptación»** en `Terms.jsx`, aprobada por el PO: declara que se guarda qué versión se aceptó y cuándo, que se borra con la cuenta y que sale en la exportación. Va en la **misma versión** `2026-10-20`, porque se publica junto con el registro y nadie había aceptado aún.
- **Pruebas rápidas en local:** `npm run test:local` corre la misma suite contra un Postgres 16 en Docker (~2 min contra ~25 min del Supabase remoto), sin tocar `.env.test`. `TEST_ENV_FILE` le dice a `tests/run.js` y `tests/reset.js` qué archivo de entorno usar. Ver el README.

### Decisiones del PO que guían los ciclos siguientes (no se construyen aquí)
- **Consentimiento por finalidad:** capa base anónima obligatoria y cinco capas opcionales, apagadas por defecto y revocables (medición personal, reconocimientos, avisos por correo, mensajes comunitarios, resumen «cerca»), más `comunicaciones_comerciales` como finalidad propia. A las cuentas presentes les llega todo desactivado.
- **Compuerta de la capa base:** quien no la acepte pierde el acceso tras **30 días de gracia**; la cuenta nunca se borra. Ver `BACKLOG.md` (B19, B21, B24).

## Ciclo 19 — Medición agregada de actividad, versión visible y CI/CD barato (2026-10-20)

### Añadido
- **Personas activas por día** (19A): `User.ultimaActividadDia` (solo una fecha, **se sobrescribe**: no hay historial) y `ConteoActividad` (un número por día, sin identidades), migración `20261020180000_actividad_agregada`. Cualquier petición autenticada cuenta, no solo escribir; una persona suma 1 por día aunque haga mil peticiones o se reinicie el servidor (la garantía vive en el `UPDATE`, no en el mapa en memoria). El día es el de México. Nunca lanza ni retrasa la petición. Aparece en el Panóptico como `actividad.personasActivasPorDia`, solo `ADMIN`. La fecha se exporta con «mis datos» y se borra al eliminar la cuenta. La tabla entra al respaldo (grupo `metricas`).
- **Versión visible** (19B): el pie muestra `ciclo N · commit · fecha de compilación`; al tocarlo, pide `GET /health` y suma el commit y el arranque del backend. `/health` ahora devuelve `commit` e `iniciadoEn`.
- **CI/CD** (19C): auditoría semanal de dependencias (`auditoria-semanal.yml`) y Dependabot agrupado por semana, con la serie 6.x de `react-router-dom` fija.

### Cambiado
- `README.md`: sección «Qué está automatizado y qué vive en los paneles», con lo que el repositorio **no** puede arreglar solo (Cloudflare y Render publican sin esperar al CI).

### Pendiente de decisión del PO
- Cláusula de los Términos para la fecha de actividad: borrador en `.planeacion/borrador_terminos_ciclo19.md`. **No se ha publicado ningún cambio a los Términos.**

## Ciclo 18 — Ficha Open Graph de hilos del foro (2026-10-20)

### Añadido
- Los hilos (`/forum/:slug/post/:id`) tienen ficha al pegarse en WhatsApp, Telegram, X o Facebook. **No lleva nada del hilo:** el foro exige sesión, así que la tarjeta dice «Conversación en <subforo>» con el texto institucional del subforo. El Worker le pide la ficha al **subforo**, de modo que el id del hilo nunca viaja al backend y la tarjeta es idéntica exista o no ese hilo (no sirve para verificar ids). Lleva `noindex`. Sin cambios de backend, API ni migraciones.
- El id del hilo se acota a 9 dígitos en la regex del Worker, para que no se pueda llenar la caché del borde con claves inventadas.
- Subforo y posteo no cambian.

### Cambiado
- La documentación decía que los hilos «no tienen ficha, y es una decisión». Se conserva la decisión de fondo (su título y contenido no salen) y se corrige lo que dice: ahora hay ficha, vacía de hilo.

## Ciclo 17 — Cierre de la enumerabilidad: búsqueda de personas y perfil por id (2026-10-20)

### Corregido
- **P2 (B-1):** `GET /api/chat/users` enumeraba toda la plataforma (handle, nombre y avatar), incluía borradas y suspendidas, y entregaba `confirmacionesLectura` y `mostrarEnLinea` de desconocidos. Ahora la búsqueda parcial o por nombre se acota a tu red y a quien activó `perfilPublico`; el **handle exacto** sigue encontrando a cualquiera (es la credencial, y así sigue funcionando agregar a alguien por su handle); solo devuelve identidad.
- **P2 (B-3):** `GET /api/profile/:id` entregaba la identidad de cualquiera recorriendo ids secuenciales. Por id ahora solo resuelve si la persona ya es visible por otra vía: tu red, `perfilPublico`, o un posteo público suyo (para que el CTA de invitación bajo un posteo siga llegando). Fuera de eso responde igual que «no existe». Por handle no cambia nada.
- **P3 (B-2):** `POST /api/chat/conversations` ya no abre chat con cuentas borradas ni suspendidas.

### Cambiado
- El cálculo de la red (amigos y amigos de amigos) sale de `mention-suggestions` a `backend/src/lib/red.js`, compartido por las tres superficies.
- Placeholder de la búsqueda en Amigos: «Busca en tu red, o escribe un handle exacto…».

## Ciclo 16 — Enumerabilidad y auditoría del bloque entre ciclos (2026-10-20)

### Corregido
- **P2 (A-1):** `chat:query_presence` era un oráculo de presencia: cualquier sesión consultaba a cualquier id, incluidos bloqueados, suspendidos y borrados. Ahora exige chat compartido, sin bloqueo, cuenta viva y reciprocidad, y toda negativa responde igual que «desconectado». Tope de 30 consultas por minuto por conexión.
- **P2 (A-2):** dos cambios de handle simultáneos saltaban el cooldown de 180 días. El `UPDATE` ahora se condiciona al estado leído; el perdedor recibe 409. Un choque de unicidad también da 409 en vez de 500.
- **P2 (A-3), decisión del PO:** el handle abandonado se reserva 90 días (`HandleReservado`, migración `20261020120000_handle_reservado`), para que enlaces de invitación y menciones viejas no pasen a una persona distinta. No hay redirección. La tabla entra al respaldo (grupo `cuentas`).

### Añadido
- La invariante **enumerabilidad ≠ direccionabilidad** escrita donde se decide (`profileRoutes.js`) y fijada por pruebas en pares: `perfilPorHandle.test.js` (direccionable) y `menciones.test.js` (no enumerable). El segundo grado de sugerencias queda anotado como deliberado.
- Auditoría de lectura 16B de las rutas que devuelven identidad ajena. Hallazgos **sin corregir** (por regla del barrido): `GET /api/chat/users` enumera la plataforma (B-1), `POST /api/chat/conversations` no excluye borradas/suspendidas y sondea ids (B-2), `GET /api/profile/:id` por id secuencial salta la invariante (B-3).
- `presenciaConsulta.test.js`.

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
