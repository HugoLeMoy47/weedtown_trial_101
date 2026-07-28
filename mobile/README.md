# WeedTown Mobile — congelado

> **Estado: congelado.** No forma parte de la Fase 1 ni de la Fase 2. Se conserva
> como semilla, no como parte del producto. Nada de lo que hay aquí llega a
> usuarios.

## Qué es hoy

Una demo de Expo de dos pantallas con **datos falsos en memoria**:

- `App.js` — pantalla de bienvenida con un usuario fijo (`UsuarioDemo`) y un botón.
- `ProfileScreen.js` — perfil editable que no persiste nada.

**No habla con la API.** No tiene login de Mastodon, ni cliente HTTP, ni sesión,
ni acceso a ninguna de las funciones reales (feed, foros, chat, Cerca,
moderación). Las dependencias declaradas (`expo ^50`, `react-native ^0.73`) están
sin instalar y llevan tiempo sin actualizarse.

## Por qué está congelado y no borrado

Descongelar es una decisión de producto, no un pendiente técnico: la web ya es
responsiva y funciona bien en móvil, así que una app nativa tiene que justificarse
por lo que la web no puede dar —notificaciones push, ubicación en segundo plano
para «Cerca», compartir desde otras apps—. Mientras esa justificación no exista,
mantener el módulo al día cuesta más de lo que aporta.

Se conserva porque borrarlo no ahorra nada (son cuatro archivos) y porque el
`package.json` sirve de punto de partida si algún día se retoma.

## Qué haría falta para revivirlo

En orden, si se decide retomarlo:

1. Cliente HTTP con la misma resolución de origen que `frontend/src/services/api.js`.
2. Flujo OAuth de Mastodon en móvil (`expo-auth-session` o navegador del sistema)
   y guardado del JWT en `expo-secure-store`, **no** en almacenamiento plano.
3. Reimplementar la ofuscación de «Cerca» con la **misma fórmula** que
   `backend/src/lib/geogrid.js` y `frontend/src/lib/geo.js` — y extender la prueba
   de paridad (`backend/tests/geogrid.test.js`) para cubrir también esta tercera
   copia. Si divergen, la privacidad falla en silencio.
4. Bloqueo, reporte y estado de suspensión en las pantallas: no son automáticos,
   son comprobaciones explícitas que la app tendría que respetar igual que la web.

## Si prefieres borrarlo

```bash
rm -rf mobile
```

No hay nada que dependa de esta carpeta: no está en el CI, no está en las pruebas
y el monorepo no tiene workspaces.
