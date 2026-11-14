# WeedTown · instrucciones para agentes

**Estado, pendientes y decisiones: en Jarvis, clave `MP-11`** (conector MCP `jarvis`).
Al empezar: `consultar_proyecto`. Al terminar: `cerrar_sesion` con liga al commit o PR.
Sin conector: anota en `.planeacion/BITACORA.md` con encabezado `## AAAA-MM-DD · título`.

## Dónde está cada cosa
- Reglas duras: este archivo.
- Por qué de las decisiones de diseño: `.planeacion/` (local, no se versiona) y `CHANGELOG.md` (qué se tocó en cada ciclo).
- Backlog detallado: `.planeacion/BACKLOG.md`.

## Reglas duras

Detalle en `.planeacion/POLITICAS.md`. Resumen para cualquier agente que entre al repo:

- **P-01 · Una sola base hasta los 5 000 usuarios únicos.** La base productiva se trata también como base de desarrollo; no se mantiene instancia aparte. **Excepción:** las pruebas nunca corren contra ella — van a su propio `?schema=`, porque `tests/reset.js` hace `DROP SCHEMA CASCADE`. En CI ya está resuelto con Postgres efímero. Los dos guardias de `reset.js` no se tocan. No planees trabajo para "separar ambientes" hasta cruzar el umbral.
- **P-02 · Calibración de riesgo: esto es un trial.** Un hallazgo de seguridad o privacidad se corrige y se sube; no se convierte en gestión de incidente. Se nombra con su severidad real, se corrige con su prueba y se registra en la bitácora — pero no dispara ceremonia.
- **P-03 · Todo ciclo cierra con sus cuatro piezas (ciclo 15E).** Plan en `.planeacion/`, prompt en `.planeacion/prompts/`, entrada en `CHANGELOG.md` (CI lo exige: `backend/tests/changelogAlDia.test.js`) y entrada en la bitácora — las cuatro **antes de cerrarse**, no después. El ciclo 14 se saltó las cuatro y costó un P0 nueve días en producción.

## Cómo trabajar aquí
- **Git:** commits y push de ramas sin preguntar; rama por ciclo. A `main` solo por PR con CI verde y squash que autoriza Hugo, cada vez (`main` está protegida). Nunca `--force` ni reescribir historial. Tras fusionar, revisa el CI una vez y repórtalo.
- Las pruebas nunca corren contra la base productiva (P-01). No se toca `tests/reset.js`.
- Cero nombres de clientes en commits, PR y documentos: el repo es público.

## Despliegue
- **Frontend y Worker:** Cloudflare Workers Builds publica **cada push a `main`** (y hace vistas previas de las ramas); no espera al CI. Fusionar es desplegar. No se despliega a mano con `npm run deploy`.
- **Backend:** Render. El Build Command corre `npx prisma generate && npx prisma migrate deploy` antes de reemplazar la instancia: las migraciones deben ser aditivas.
- **CI** (`.github/workflows/ci.yml`, en push a `main` y PR): backend con Postgres efímero, E2E y frontend. Dependabot semanal (los saltos mayores se ignoran a propósito) y `auditoria-semanal.yml`. Un aviso nuevo de `npm audit` rompe el CI sin cambio de código: se arregla con `npm audit fix` en el lockfile.

## Pruebas
- Locales: `cd backend && npm run test:local` (Postgres 16 en Docker, puerto 55432, `TEST_ENV_FILE=.env.test.local`), unos 2 min. `npm run test:local:parar` borra el contenedor.
- `npm test` va contra el Supabase remoto (schema `weedtown_test`): unos 25 min y puede caer por red (P1001). Prefiere las locales.
- Antes de correrlas, revisa que no haya un servidor viejo en el puerto 4010 (da 429 falsos). Tras `npm ci`, `npx prisma generate`.
- Tarjetas OG: `wrangler dev --var PREVIEW_API_URL:http://localhost:<puerto>`, o `curl` con `User-Agent: WhatsApp/2.23`.
- Una suite a la vez (equipo limitado).
