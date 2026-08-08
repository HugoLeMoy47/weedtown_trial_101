# `backend/scripts/` — utilerías de operación y de producto

Herramientas que **no forman parte de la aplicación** pero que hacen falta para operarla o para trabajar sobre ella. Ninguna se importa desde `src/`, ninguna se despliega, y ninguna abre superficie nueva en la API: todas exigen acceso al servidor y a las credenciales de la base, o corren enteras en tu navegador.

Se versionan a propósito. Una herramienta que solo vive en la máquina de quien la escribió se pierde, y la siguiente persona la vuelve a construir peor.

## Índice

| Script | Qué hace | Cuándo se usa |
|---|---|---|
| [`rol.js`](#roljs) | Asigna `USER` / `MOD` / `ADMIN` a una cuenta | Al montar un entorno, o para promover a alguien |
| [`subforos.js`](#subforosjs) | Siembra el catálogo inicial de subforos | Una vez por entorno, después del alta de la cuenta creadora |
| [`sembrar-dev.js`](#sembrar-devjs) | Escenario de desarrollo: cuentas, amistad, bloqueo y posteos | Al estrenar o vaciar la base de desarrollo |
| [`avatar-hoja.js`](#avatar-hojajs) | Hoja de contactos del catálogo de avatares | Al revisar o rediseñar el arte del avatar |
| [`avatar-plantillas.js`](#avatar-plantillasjs) | Plantillas de 32×32 para redibujar piezas | Al redibujar el catálogo (`wt2`) |
| [`avatar-convertidor.html`](#avatar-convertidorhtml) | PNG de pixel art → arreglo de rectángulos | Al integrar cada pieza dibujada |

**Las salidas generadas no se versionan** (`avatar-hoja.html`, `plantillas-wt2/`): se reconstruyen del catálogo vivo, así que guardarlas sería conservar copias que envejecen solas.

---

## Operación

### `rol.js`

Asigna el rol de una cuenta desde la línea de comandos. Existe para resolver el huevo y la gallina: el panel de `/admin` solo deja gestionar roles a un `ADMIN`, y al principio no hay ninguno.

```bash
npm run rol -- --listar
npm run rol -- --handle=hugolemoy --rol=ADMIN
npm run rol -- --id=3 --rol=MOD
```

### `subforos.js`

Siembra el catálogo de subforos temáticos (HU-FOR-010/011). **Idempotente**: hace upsert por slug y se salta los que ya existen sin tocar nombre ni descripción, así que una descripción que la comunidad ya editó nunca se sobreescribe.

Prerrequisito: la cuenta creadora (por defecto `@weedtown`) debe existir. El script no crea usuarios — si el handle no existe, falla con un mensaje claro.

```bash
npm run subforos
npm run subforos -- --creador=weedtown
```

### `sembrar-dev.js`

```bash
node scripts/sembrar-dev.js            # siembra (no hace nada si ya está)
node scripts/sembrar-dev.js --rehacer  # borra lo sembrado y lo vuelve a crear
node scripts/sembrar-dev.js --borrar   # solo borra
```

Desde que desarrollo y producción usan bases distintas, la de desarrollo arranca vacía — correcto, pero deja la app sin nada que mostrar. Y varias verificaciones no se pueden hacer con una sola cuenta: *"este posteo lo ve una amistad pero no un extraño"* necesita una amistad **y** un extraño **y** un bloqueo, montados a mano cada vez.

El reparto está diseñado contra **lo que hay que poder verificar**, no contra una idea de "usuarios de ejemplo". Cada cuenta existe para cubrir un caso:

| Cuenta | Para qué |
|---|---|
| `@luna` | La protagonista: perfil lleno (bio, sobre mí, edad, género) y posteos de ambas visibilidades |
| `@mora` | Su amistad — ve los posteos de solo-amigos |
| `@tuco` | Extraño con sesión — no los ve |
| `@nube` | Bloqueada por luna — para ella, luna no existe |
| `@sol` | Solicitud de amistad pendiente hacia luna |

Trae también posteos con y sin hashtags (incluida grafía en camello, para ver `displayTag`) y celdas de Cerca en zonas vecinas.

**Se puede entrar como cualquiera de ellas.** Cada cuenta lleva una identidad de correo `<handle>@dev.local` — un dominio reservado por RFC 6761, así que ningún correo real puede caer ahí. Pides el enlace mágico desde `/login` y, con `MAIL_DRIVER=log`, el enlace se imprime en la consola del backend en vez de enviarse.

**Dos guardianes**, y el segundo es el que importa:

1. Se niega si `NODE_ENV=production`.
2. Se niega si encuentra **una sola cuenta que él no creó** — sin importar a qué base apunte el `.env`. Es la defensa real: aunque alguien apunte el `.env` a una base con datos de gente, el script no toca nada. Aplica también con `--rehacer`, que es la bandera peligrosa.

Los subforos van aparte, con su propio script: `npm run subforos -- --creador=luna`.

---

## Taller del avatar

Las tres herramientas de abajo nacieron del rediseño del catálogo a 32×32 (`wt2`), pero sirven para cualquier trabajo futuro sobre el avatar. **Ninguna toca código de producto**: `avatar-hoja.js` y `avatar-plantillas.js` usan solo la API pública de [`src/lib/avatar.js`](../src/lib/avatar.js), y el convertidor es una página suelta sin dependencias.

> ### Estado del rediseño `wt2` — en pausa
>
> **Las herramientas están terminadas y verificadas. El arte no ha empezado.** El proyecto está detenido a propósito, esperando referencias visuales concretas que definan el estilo; retomar no requiere reconstruir nada.
>
> **Lo que ya quedó decidido** (no hace falta volver a discutirlo):
>
> - Rejilla **32×32**. Hoy es 16×16 y cada píxel de arte ocupa 8 px de pantalla — ese es el grosor que se quiere quitar.
> - El primer `wt2` conserva **la misma cantidad y el mismo orden de piezas por ranura** que `wt1` (base 8 · pelo 4 · ojos 4 · boca 4 · acc 10 · paletas 6). Así el índice 3 de peinado sigue siendo el mismo peinado, y migrar es reescribir `wt1-<índices>` a `wt2-<mismos índices>`: mismo personaje, mejor dibujado.
> - Las **piezas nuevas se agregan al final** de cada lista. Ésas —y solo ésas— son las desbloqueables de la gamificación.
> - **Migración automática**, sin vista previa, mientras la base de usuarios sea chica. Al llegar a masa crítica se reactiva la regla de ofrecer el cambio con vista previa.
>
> **Palanca que conviene recordar:** la constante `CABEZA` la comparten **5 de las 8 bases** (Persona, Planta, Ajolote, Luchador, Alebrije). Dibujar bien la cabeza de Persona resuelve la base de esas cinco; las otras cuatro quedan reducidas a redibujar solo lo que las distingue. Por eso el orden correcto es Persona primero, todo lo demás después.
>
> **Volumen:** 30 piezas dibujables (las 6 paletas son juegos de hexadecimales, no dibujos). El esfuerzo se reparte ~55 % en las 8 bases, ~25 % en los 10 accesorios, ~20 % en peinados, miradas y bocas.
>
> **Para retomar hace falta una sola cosa:** dos o tres referencias de pixel art que marquen el estilo — grosor de contorno, si hay contorno, cuánta sombra, qué tan caricatura. Con eso, el primer paso es dibujar **base Persona + mirada Abiertos**, que juntas fijan casi todo el riesgo de estilo.
>
> El detalle completo —incluida la especificación pieza por pieza de qué corregir en lentes, mirada, planta, calaca, ajolote y alebrije— está en el brief de planeación (`.planeacion/`, fuera de git).

### Por qué hicieron falta

Los avatares se generan por piezas, y **cada pieza es un arreglo de rectángulos escrito a mano** (`[x, y, w, h, rol]`), no un bitmap. Eso trae dos problemas prácticos que estas herramientas resuelven:

1. **No se pueden ver.** En la aplicación los avatares aparecen a 32-40 px sueltos, que es justo el tamaño en el que no se alcanza a juzgar nada. Para decidir qué está mal hay que verlos grandes, aislados y comparables entre sí.
2. **No se pueden dibujar en coordenadas.** Redibujar 30 piezas escribiendo rectángulos a mano es inviable. Dibujarlas en un editor de pixel art y convertirlas, no.

### `avatar-hoja.js`

```bash
node scripts/avatar-hoja.js            # → scripts/avatar-hoja.html
node scripts/avatar-hoja.js otra.html  # → donde le digas
```

Genera una hoja de contactos autocontenida (ábrela con doble clic) con:

- **Cada pieza de cada ranura aislada**, siempre sobre el mismo combo de referencia, así que lo único que cambia entre celdas es la pieza que estás mirando.
- **La misma cara en las 6 paletas**, para juzgar color aparte de forma.
- **48 combinaciones deterministas** — las mismas en cada corrida, para poder comparar dos versiones del catálogo lado a lado.
- Control de tamaño de 32 a 320 px, y fondos claro y oscuro.

Sirve igual con cualquier versión del catálogo: lee `catalogo()` y `render()`, no constantes internas.

### `avatar-plantillas.js`

```bash
node scripts/avatar-plantillas.js      # → scripts/plantillas-wt2/
```

Escribe PNG de 32×32 con el avatar actual **escalado 2×**, para abrirlos como capa de referencia y dibujar encima en vez de partir de un lienzo en blanco. De ahí sale casi gratis la propiedad de "mismo personaje, mejor dibujado" que hace segura una migración automática de catálogo.

Incluye una guía de geometría (contorno de la cabeza, líneas de ojos y boca, arranque de hombros, eje central de simetría) en un color que no está en ninguna paleta, para que en el convertidor se marque como *ignorar* de un vistazo.

Trae su propio codificador PNG mínimo (RGBA de 8 bits, sin entrelazado) sobre el `zlib` de Node — sin dependencias.

### `avatar-convertidor.html`

Se abre con doble clic. Sin servidor, sin dependencias, y **el archivo no sale de tu máquina**: el PNG se lee con canvas, en tu navegador.

Arrastras el PNG de una pieza y sale el arreglo `{ n: 'Nombre', r: [[x, y, w, h, 'rol'], …] }` listo para pegar en `avatar.js`.

- **Dibuja con los colores que quieras.** Lista los colores que encontró y les asignas un rol con un menú. Reconoce exactos los siete colores de autoría que emiten las plantillas, y estima el resto por luminosidad.
- **Original contra reconstruido**, lado a lado: si no coinciden, algún color quedó en *ignorar*. Es la comprobación de que la conversión no perdió nada.
- **Junta píxeles en rectángulos** en vez de emitir uno por píxel — un cuadro lleno sale como 1 rectángulo, no como 1024.

#### Los siete roles

Se dibuja **por rol, no por color literal**: cada pieza se dibuja una vez y se pinta seis veces, una por paleta. `b` significa "el color de piel de esta paleta", sea el que sea.

| Rol | Papel | Color de autoría |
|---|---|---|
| `b` | Base — relleno principal | `#c98a63` |
| `s` | Sombra de la base | `#a86a48` |
| `p` | Pelo y equivalentes | `#3b2a21` |
| `r` | Ropa y hombros | `#3f6f62` |
| `a` | Acento — el color vivo de la paleta | `#d9a441` |
| `o` | Oscuro **fijo**, no depende de la paleta | `#1a1a1a` |
| `l` | Luz **fija**, no depende de la paleta | `#f2efe6` |

`o` y `l` son la excepción a propósito: así los ojos son negros y el cráneo es hueso en las seis paletas.

### Flujo completo para redibujar una pieza

1. `node scripts/avatar-hoja.js` y mira el catálogo en grande para decidir qué cambiar.
2. `node scripts/avatar-plantillas.js` y abre la referencia como capa de fondo, con la guía encima.
3. Dibuja **una capa por pieza** y exporta cada capa como PNG con transparencia.
4. Pasa cada PNG por `avatar-convertidor.html` y pega el arreglo en `src/lib/avatar.js`.
5. Vuelve a correr `avatar-hoja.js` para comparar el resultado contra la muestra determinista.

---

## Cómo agregar una herramienta aquí

Si construyes una utilería para una prueba de concepto o para una mejora del producto, déjala en esta carpeta y agrégale una fila al índice. Tres criterios que vale la pena sostener:

- **Que no la importe `src/`.** Si el producto la necesita en tiempo de ejecución, no es una utilería: vive en `src/lib/`.
- **Que use la API pública de lo que toca**, no sus constantes internas. Así sobrevive al siguiente refactor en vez de romperse en silencio.
- **Que su salida generada esté en `.gitignore`.** Se versiona la herramienta, nunca lo que produce.
