# Seguridad

WeedTown maneja identidad (Mastodon, llave de acceso, correo), ubicación aproximada ("Cerca") y contenido de una comunidad expuesta a estigma social. Si encontraste un problema de seguridad, repórtalo en privado — no abras un issue público con detalles de explotación.

## Cómo reportar

Usa [GitHub Security Advisories](https://github.com/HugoLeMoy47/weedtown_trial_101/security/advisories/new) — es privado por diseño: solo lo ve quien mantiene el repo hasta que se decide publicarlo.

**No abras un issue ni una discusión pública** con pasos de explotación, ni lo publiques en redes o foros antes de dar tiempo a que se corrija.

## Qué incluir

- Pasos para reproducir, lo más concretos posible.
- Impacto: qué se puede hacer con esto (¿leer datos de otra cuenta? ¿saltarse la cuarentena? ¿inyectar contenido?).
- Componente afectado y, si aplica, el commit o la fecha en que lo probaste.
- Prueba de concepto, si la tienes — un `curl` real vale más que una descripción.

## Alcance

**Dentro:** el backend (Express), el frontend (React) y el Worker de Cloudflare de este repo — todo lo que vive en `backend/`, `frontend/` y su configuración de despliegue.

**Fuera:** la infraestructura de terceros (Render, Supabase, Cloudflare como plataforma, Resend) — un problema ahí se reporta directamente a ese proveedor, no aquí. Tampoco cubre la app móvil (`mobile/`): está congelada, es una demo con datos falsos sin conexión a la API real (ver [mobile/README.md](mobile/README.md)).

## Avisos conocidos que NO se han corregido, y por qué

Se listan a propósito: un aviso abierto sin explicación se vuelve ruido que nadie mira, y a los seis meses ya nadie recuerda si se evaluó o se olvidó.

**`react-router-dom` 6.x — tres avisos moderados** (evaluados el 2026-08-10, ciclo 12D). El único arreglo es migrar a la v7, que es un cambio de mayor. Se **acepta formalmente** por ahora, con este análisis de exposición:

| Aviso | ¿Aplica aquí? |
|---|---|
| *Arbitrary Constructor Injection via `deserializeErrors()`* | **No.** Es de hidratación SSR. Esta app es una SPA de Create React App, sin renderizado en servidor: ese código no se ejecuta nunca |
| *Open redirect via backslash en `<Link>` y `useNavigate`* | **Mitigado desde antes de que existiera el aviso.** El único punto donde una cadena que viene de la URL llega a `useNavigate` es el `next` del muro de login, y `frontend/src/lib/rutaInterna.js` lo valida: exige que empiece con `/`, rechaza `//`, rechaza esquemas, y **rechaza la barra invertida** — que es exactamente el vector del CVE. Se escribió para la trampa T5 del ciclo 7A, no para esto |
| *Open redirect leading to XSS* | Mismo razonamiento: depende del mismo vector |

**Lo que sí queda como riesgo, y es el motivo de que esto no sea "cerrado" sino "aceptado":** la mitigación depende de que *cada* destino dinámico de navegación pase por una validación. Hoy es así —los demás se construyen con datos ya validados (handle, slug, id)— pero nada obliga a que el siguiente `navigate()` lo haga. La migración a la v7 se agenda junto con la del bundler (`react-scripts` → Vite), donde el riesgo de la migración baja.

## Tiempo de respuesta

Todavía no hay un compromiso de tiempo de respuesta definido — este proyecto no tiene un equipo de seguridad dedicado. Se atiende lo antes posible; si no tienes noticias en un tiempo razonable, es válido volver a escribir.
