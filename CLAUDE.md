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
- Cambios por rama y PR hacia `main`; Hugo aprueba y fusiona. Sin `push` directo a `main`.
- Las pruebas nunca corren contra la base productiva (P-01). No se toca `tests/reset.js`.
- Cero nombres de clientes en commits, PR y documentos: el repo es público.
