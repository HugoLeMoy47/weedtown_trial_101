# `backend/scripts/` — utilerías de operación y de producto

Herramientas que **no forman parte de la aplicación** pero que hacen falta para operarla o para trabajar sobre ella. Ninguna se importa desde `src/`, ninguna se despliega, y ninguna abre superficie nueva en la API: todas exigen acceso al servidor y a las credenciales de la base, o corren enteras en tu navegador.

Se versionan a propósito. Una herramienta que solo vive en la máquina de quien la escribió se pierde, y la siguiente persona la vuelve a construir peor.

## Índice

| Script | Qué hace | Cuándo se usa |
|---|---|---|
| [`rol.js`](#roljs) | Asigna `USER` / `MOD` / `ADMIN` a una cuenta | Al montar un entorno, o para promover a alguien |
| [`subforos.js`](#subforosjs) | Siembra el catálogo inicial de subforos | Una vez por entorno, después del alta de la cuenta creadora |
| [`sembrar-dev.js`](#sembrar-devjs) | Escenario de desarrollo: cuentas, amistad, bloqueo y posteos | Al estrenar o vaciar la base de desarrollo |
| [`respaldo.js`](#respaldojs) | Copia a un JSON cualquiera de las dos bases, entera o por tablas/grupos | **Producción no tiene respaldos automáticos** — con la frecuencia que aguantes perder |
| [`respaldo-gui.js`](#respaldo-guijs) | La misma herramienta, con clics en vez de banderas | Cuando no quieras recordar la sintaxis |
| [`restaurar.js`](#restaurarjs) | Carga un respaldo y verifica que quedó igual | Al probar un respaldo, y el día de una recuperación real |
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

## Respaldo y recuperación

**El plan gratuito de Supabase no hace respaldos automáticos.** Hay cuentas reales con posteos, foros y chats que la comunidad no puede reconstruir. De toda la deuda técnica del proyecto, es la única cuyo peor caso no se puede arreglar después: todo lo demás, si sale mal, se corrige.

**Por qué esto y no `pg_dump`.** Sería el artefacto estándar. La máquina de trabajo no tiene las herramientas cliente de PostgreSQL ni Docker para prestarlas, y un respaldo que existe hoy vale más que el respaldo perfecto de la semana que viene. Si algún día se instalan, `pg_dump` sigue siendo mejor idea para el respaldo periódico — estas dos herramientas no dejan de servir, porque el par respaldo↔restauración verificada es lo que convierte un archivo en una garantía.

### `respaldo.js`

```bash
npm run respaldo -- --listar                                              # qué tablas y grupos hay
npm run respaldo -- --base produccion --destino "D:\respaldos-weedtown"   # respaldo completo
npm run respaldo -- --base dev        --destino "D:\respaldos-weedtown"
```

Recorre las tablas en orden de dependencia y las escribe en un JSON con manifiesto: cuándo se tomó, de qué proyecto, **con qué migración**, si es completo y cuántas filas por tabla.

**`--base` nombra la base y no hay que adivinar cuál salió.** `produccion` toma `RESPALDO_DATABASE_URL` de `.env.produccion`; `dev` toma `DATABASE_URL` de `.env`. Si pides `produccion` y falta la variable, se detiene en vez de caer a desarrollo.

#### Respaldo selectivo

```bash
npm run respaldo -- --base produccion --destino "..." --solo cuentas,feed --acepto-parcial
npm run respaldo -- --base produccion --destino "..." --excepto chats     --acepto-parcial
npm run respaldo -- --base dev        --destino "..." --solo User,Post,Comment
```

`--solo` y `--excepto` aceptan **tablas y grupos mezclados**. Los grupos existen para no tener que acordarse de qué tablas componen una idea:

| Grupo | Tablas |
|---|---|
| `cuentas` | `User`, `Identity`, `Passkey`, `MagicLink` |
| `feed` | `Post`, `Hashtag`, `HashtagOnPost`, `Comment`, `Reaction`, `Media` |
| `foros` | `SubForum`, `SubForumFollow`, `ForumPost`, `ForumComment` |
| `social` | `Block`, `FriendRequest`, `Notification` |
| `chats` | `Chat`, `Message` |
| `moderacion` | `Report`, `ModerationAction`, `PalabraDescartada`, `PrivacyAction` |

**La selección se valida contra las llaves foráneas antes de conectar.** Pedir `--solo feed` falla, y dice por qué:

```
✖ La selección deja fuera tablas de las que otras dependen:
      Post necesita User
      Comment necesita User
    Selección que sí funciona:
      --solo User,Post,Hashtag,HashtagOnPost,Comment,Reaction,Media
```

Sin esa comprobación el archivo se generaría sin quejarse y reventaría por violación de FK **durante la recuperación**, que es el peor momento posible para descubrirlo.

**Un parcial no es un respaldo de recuperación, y el sistema entero lo trata así:** se exige `--acepto-parcial` cuando el origen es producción, el nombre del archivo lleva el sufijo `-parcial`, el manifiesto guarda `completo: false` con la lista de omitidas, y **`restaurar.js` se niega a cargarlo**. La razón es concreta: restaurar vacía el destino, así que cargar un recorte dejaría en blanco las tablas que no venían — eso no es recuperar, es perder.

Solo las FK **obligatorias** cuentan como dependencia. Una `Reaction` apunta a `Post` o a `Comment` o a `ForumPost`, nunca a todos; tratarlas como duras obligaría a incluir el esquema completo en cualquier selección y el respaldo selectivo dejaría de existir.

**Si el esquema crece y nadie actualiza la lista de tablas, el script se detiene.** Compara los modelos del cliente de Prisma contra los suyos: una tabla nueva sin registrar quedaría fuera de todos los respaldos, en silencio y para siempre.

Para respaldar producción, pon la cadena en `RESPALDO_DATABASE_URL` dentro de `backend/.env.produccion` — `.gitignore` ya lo excluye por el patrón `.env.*` — en vez de pasarla por `--url`, donde queda en el historial de la terminal. Usa el **puerto 5432** (conexión directa), no el 6543 del pooler: para una lectura masiva es más confiable.

> ### El error que hay que entender antes de usar esto
>
> **Todos los proyectos de Supabase de una misma región comparten el hostname del pooler.** Desarrollo y producción se ven **idénticos** por host: `aws-0-us-west-1.pooler.supabase.com` los dos. Lo único que los distingue es el `<project-ref>` del usuario (`postgres.<ref>`).
>
> La primera versión de este script solo hacía `dotenv.config()` —que lee `.env`— mientras este README ya mandaba a poner la cadena en `.env.produccion`. El archivo existía, estaba bien escrito, y el script lo ignoraba: respaldó **desarrollo** y anunció `✔ respaldo completo`. Lo cachó el PO el 2026-08-09, y solo porque sabía cuántas cuentas hay en producción.
>
> **Un respaldo de la base equivocada que se reporta como éxito es peor que no tener respaldo**, porque produce confianza. De ahí las tres correcciones: el script carga los dos archivos, el banner muestra el **proyecto** (no el host), y **se niega a correr** si el proyecto resuelto es el mismo del `DATABASE_URL` de desarrollo, salvo `--acepto-desarrollo`.

**Cuatro decisiones que no son obvias:**

- **`--destino` es obligatorio y no tiene default.** El archivo lleva correos, teléfonos y mensajes privados de personas reales; un default cómodo terminaría poniéndolo junto al código. Además **se niega** si la ruta cae dentro del repositorio: la comprobación es lo que evita el accidente, no el comentario.
- **El banner dice de dónde salió la cadena**, no solo cuál es: `RESPALDO_DATABASE_URL de .env.produccion` o `DATABASE_URL de .env — LA BASE DE DESARROLLO`. Resolver en silencio es lo que permitió el fallo de arriba.
- **La contraseña nunca se imprime.** Igual que el log `arranque_base_de_datos`: la pregunta "¿esto es producción?" se contesta con el proyecto y el schema, sin ver el secreto.
- **Se guarda la migración de origen.** Restaurar datos sobre un esquema distinto al de origen es cómo un respaldo falla justo el día que hace falta, y `restaurar.js` compara antes de tocar nada.

El nombre del archivo lleva el project ref (`weedtown-<ref>-<fecha>.json`) y no el host, justamente para que en la carpeta se distinga cuál es cuál.

**Lo que NO cubre**, dicho aquí para que nadie lo descubra durante una recuperación:

- **Las imágenes.** Viven en Supabase Storage; aquí solo viaja su URL. Restaurar deja los posteos apuntando a archivos que hay que respaldar aparte.
- **El esquema.** Se reconstruye con `prisma migrate deploy`, que sí está en git.

### `respaldo-gui.js`

```bash
npm run respaldo:gui
```

Imprime una URL con token; la abres en el navegador y eliges base, carpeta y tablas con clics. Muestra las dos bases con su **project ref** —lo único que las distingue—, valida las dependencias mientras armas la selección, avisa cuando el recorte deja de servir para recuperar, y lista los respaldos que ya hay en la carpeta.

**No respalda nada.** Arma los argumentos y lanza `scripts/respaldo.js` como proceso hijo. Es la decisión que ordena todo el archivo: las guardias —base equivocada, parcial de producción, destino dentro del repo, dependencias rotas, tabla nueva sin registrar— se aplican **idénticas** desde la terminal y desde el navegador, porque son literalmente el mismo código. Una GUI que reimplementara el respaldo sería una segunda versión con sus propios huecos, y el hueco aparecería el día de una recuperación. Comprobado: pedirle `Post` y `Comment` sin `User` desde el navegador falla con el mismo mensaje que en la terminal.

El mapa de tablas vive en [`lib/respaldo-tablas.js`](lib/respaldo-tablas.js) justamente para que la validación instantánea de la pantalla y la del script lean la misma lista.

La pantalla **muestra el comando equivalente** de lo que estás por hacer. La GUI es un atajo, no una caja negra: ese comando sirve para repetir el respaldo sin ella, o para meterlo en una tarea programada.

**Tres cosas sobre seguridad**, porque esto puede volcar producción a disco:

- **Escucha solo en `127.0.0.1`.** No es alcanzable desde la red local.
- **Exige un token aleatorio** que se genera en cada arranque y se imprime en la terminal. Sin él, cualquier página abierta en el mismo navegador podría pedirle un respaldo a `localhost` sin que te enteres. Se exige también para el HTML, no solo para la API.
- **Muere con la terminal.** No se despliega, no se importa desde `src/`, y no forma parte de la aplicación.

### `restaurar.js`

```bash
npm run restaurar -- --archivo "D:/respaldos-weedtown/weedtown-....json"
```

Un respaldo que nadie ha restaurado nunca no es un respaldo, es un archivo. Este script es la mitad que convierte al otro en una garantía: vacía el destino, carga en orden de dependencia, **reajusta las secuencias** y cuenta cada tabla contra el manifiesto.

Sin `--url` escribe en `DATABASE_URL`, o sea tu base de desarrollo — el default es ese a propósito: verificar un respaldo es justo para lo que sirve tener una base desechable.

**Lo de las secuencias no es un detalle.** Al insertar con ids explícitos, los contadores autoincrementales se quedan en 1, y la app choca con llaves duplicadas la primera vez que alguien publica — horas después de que la restauración pareció exitosa. Es el error clásico de restaurar así.

**Se niega a escribir sobre la base de la que salió el respaldo** (`--forzar` para una recuperación real), y **se niega si la migración del destino no coincide** con la del respaldo. La primera guardia importa porque restaurar es borrar primero: equivocarse ahí destruye justo los datos que se estaban protegiendo.

Esa comparación es **por project ref, no por host** — por la misma razón de arriba. Comparando por host tenía una consecuencia concreta: se disparaba al restaurar un respaldo de producción en desarrollo, que es exactamente la verificación que uno quiere poder hacer.

**Verificado el 2026-08-09** con un viaje redondo completo sobre el schema de pruebas: respaldo → vaciado → carga → conteo, las 25 tablas coincidiendo.

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
