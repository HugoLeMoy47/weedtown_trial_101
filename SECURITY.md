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

## Tiempo de respuesta

Todavía no hay un compromiso de tiempo de respuesta definido — este proyecto no tiene un equipo de seguridad dedicado. Se atiende lo antes posible; si no tienes noticias en un tiempo razonable, es válido volver a escribir.
