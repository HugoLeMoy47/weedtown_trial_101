// Agregados para el panóptico (HU-PAN-001/002/003/004).
//
// Principio rector, heredado de logger.js: el panóptico mide qué pasa en la
// red, no qué hace cada persona. Todo lo de abajo son conteos, sumas y
// percentiles sobre columnas que YA EXISTEN (createdAt, deletedAt, hiddenAt…)
// — cero columnas, cero tablas, cero migraciones. Si algo aquí pareciera
// necesitar guardar un dato nuevo sobre una persona, es que se salió del
// alcance: no se hace, se avisa.
//
// Tres reglas que gobiernan cada función de este archivo:
//   1. Una consulta agregada por métrica (agrupando en la base), nunca un
//      ciclo con un conteo por día — ver `diaMx()` y las consultas UNION ALL.
//   2. El día se trunca en America/Mexico_City, no en UTC (ver `diaMx`).
//   3. Ningún desglose expone un segmento con menos de UMBRAL_SUPRESION
//      elementos — se colapsa en "otros" (ver `suprimir`).
const { Prisma } = require('@prisma/client');
const prisma = require('./prisma');

const DIAS_PERMITIDOS = [7, 30, 90];
const TTL_CACHE_MS = 10 * 60 * 1000; // 10 min — dentro del rango 5-15 que pide el ciclo
const UMBRAL_SUPRESION = 5;
const CELL_TTL_DIAS = 7; // = CELL_TTL_DAYS en nearbyRoutes.js; mantener sincronizado si cambia ahí
// Límites de la cuadrícula, importados de geogrid.js en vez de copiados: si
// STEP_DEG cambia ahí, este indicador no puede quedarse midiendo con los
// viejos. Es justo la clase de desincronización que este ciclo vino a cazar.
const { LAT_CELLS, LON_CELLS } = require('./geogrid');

// Cuarentena: LAS MISMAS VENTANAS QUE APLICA requireAuth.js, no una sola.
//
// Esto era el 8H. Antes había una constante `QUARANTINE_HOURS` que leía
// `process.env.SIGNUP_QUARANTINE_HOURS` — una variable que **nadie define**
// desde que HU-SEG-007 pasó a cuarentena graduada por proveedor. Caía siempre
// a 24 h, así que el tablero contaba como "en cuarentena" a cuentas de correo
// que ya podían tocar y chatear desde las 3 h. No afectaba la cuarentena real,
// solo el número que ve un ADMIN — que es peor de lo que suena: un número que
// nadie puede contrastar es un número en el que se confía.
//
// Se leen las mismas variables que requireAuth.js y con los mismos defaults.
// Duplicarlas es feo, pero importarlas desde un middleware para calcular una
// métrica ata dos cosas que no se parecen; el comentario cruzado en ambos
// archivos es la defensa, y la prueba de este ciclo la hace real.
const VENTANA_CUARENTENA_H = {
  MASTODON: 0,
  EMAIL: Number(process.env.SIGNUP_QUARANTINE_HOURS_EMAIL) || 3,
  PASSKEY: Number(process.env.SIGNUP_QUARANTINE_HOURS_PASSKEY) || 24
};

// ---------- Zona horaria (Trampa 2) ----------
//
// Verificado contra information_schema en la base real: TODAS las columnas de
// fecha relevantes (createdAt, deletedAt, hiddenAt, resolvedAt…) son
// TIMESTAMP(3) SIN zona en Postgres — el default de Prisma. Pero el valor
// guardado SÍ es un instante UTC real: Prisma serializa los `Date` de Node así
// al escribir. date_trunc('day', "createdAt") de cabeza agruparía en UTC, lo
// que para México corta el día a las 18:00 hora local — justo antes del pico
// de actividad nocturna — y nadie lo nota porque las gráficas igual se ven
// razonables.
//
// El truco de doble AT TIME ZONE: el primero reinterpreta el valor naive como
// el instante UTC que en realidad es (produce un timestamptz correcto); el
// segundo convierte ese instante a hora de pared en America/Mexico_City
// (vuelve a producir un timestamp naive, pero ahora en hora local). Recién
// ahí se trunca el día. `col` nunca es entrada de usuario — es un nombre de
// columna fijo que este mismo archivo elige, así que usar Prisma.raw() aquí
// no abre ninguna superficie de inyección.
//
// `alias` es el alias de tabla cuando la consulta lo usa (`fp."createdAt"`).
// Como `col`, nunca es entrada de usuario: lo elige este mismo archivo.
function diaMx(col, alias) {
  const ref = alias ? `"${alias}"."${col}"` : `"${col}"`;
  return Prisma.raw(`date_trunc('day', ${ref} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City')::date`);
}

// Filtro de ventana EN DÍAS DE MÉXICO, para las consultas que no agrupan por
// día y por lo tanto no pueden recortarse después con `enRango()`.
//
// LA TRAMPA 2, OTRA VEZ, PERO EN EL LÍMITE DE LA VENTANA (hallazgo del ciclo
// 9A, ver `ventana()` abajo — el comentario ya describía esta regla; cuatro
// consultas no la seguían). Estas cuatro filtraban así:
//
//     BETWEEN new Date(`${desde}T00:00:00Z`) AND new Date(`${hasta}T23:59:59.999Z`)
//
// Eso toma una fecha de CALENDARIO MEXICANO y la interpreta como un instante
// UTC. Un día de México va de las 06:00 UTC a las 06:00 UTC del día siguiente,
// así que la ventana entera quedaba corrida 6 horas hacia atrás: se comía todo
// lo ocurrido entre las 18:00 y la medianoche del último día —el pico de
// actividad nocturna, exactamente el mismo horario que el comentario de
// `diaMx` señala para el agrupado— y a cambio metía esas mismas 6 horas del
// día anterior al primero. No fallaba: devolvía un número plausible y más
// chico, todos los días, y solo se notaba corriendo las pruebas después de las
// 18:00 hora de México.
//
// El arreglo es dejar que Postgres traduzca el día, igual que en `diaMx`, en
// vez de hardcodear el desfase en JS: así sigue siendo correcto si México
// volviera a tener horario de verano.
//
// Sí, envolver la columna en una expresión impide usar un índice sobre ella.
// Es deliberado y no se compensa con un rango UTC holgado extra: son cuatro
// consultas de panel sobre tablas chicas, cacheadas 10 min (TTL_CACHE_MS), y
// el rango holgado es justamente la pieza que ya se le olvidó a alguien una
// vez. Correcto y simple le gana a rápido y sutil aquí.
function entreDiasMx(col, alias, desdeISO, hastaISO) {
  return Prisma.sql`${diaMx(col, alias)} BETWEEN ${desdeISO}::date AND ${hastaISO}::date`;
}

// "Hoy" en hora de México, como 'YYYY-MM-DD' — independiente de en qué huso
// corra el proceso de Node (en Render puede ser UTC).
function hoyMexicoISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
}

function sumarDiasISO(fechaISO, delta) {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Ventana de trabajo para un `dias` ya validado contra la lista blanca.
// `desdeConsulta` lleva un margen de sobra (no es el corte exacto): el corte
// FINO al día correcto lo hace el recorte en JS después de agrupar, con
// `enRango()`. Así el filtro WHERE nunca corta a la mitad de un día en hora
// de México — que es exactamente el bug de la Trampa 2, aplicado al límite de
// la ventana en vez de al agrupado.
//
// `hasta`, `desdeActual` y `desdeAnterior` son fechas de CALENDARIO MEXICANO
// ('YYYY-MM-DD'), no instantes. Las consultas que no agrupan por día (y por lo
// tanto no pasan por `enRango()`) tienen que filtrarlas con `entreDiasMx()`,
// nunca convirtiéndolas a `Date` con una "Z" pegada — ver la nota de esa
// función: eso corre la ventana entera 6 horas y no falla, solo cuenta de
// menos.
function ventana(dias) {
  const hasta = hoyMexicoISO();
  const desdeActual = sumarDiasISO(hasta, -(dias - 1));
  const desdeAnterior = sumarDiasISO(hasta, -(2 * dias - 1));
  const desdeConsulta = new Date(Date.now() - (2 * dias + 2) * 24 * 60 * 60 * 1000);
  return { hasta, desdeActual, desdeAnterior, desdeConsulta };
}

// ---------- Helpers de forma ----------

const fmtDia = (d) => new Date(d).toISOString().slice(0, 10);
const enRango = (diaISO, desdeISO, hastaISO) => diaISO >= desdeISO && diaISO <= hastaISO;

// De filas {dia, valor} (ya agrupadas por Postgres) a una serie SIN huecos
// entre dos fechas — un día sin actividad no debe desaparecer de la gráfica,
// debe verse como 0.
function serieCompleta(filas, desdeISO, hastaISO) {
  const porDia = new Map();
  for (const f of filas) {
    const dia = fmtDia(f.dia);
    if (!enRango(dia, desdeISO, hastaISO)) continue;
    porDia.set(dia, (porDia.get(dia) || 0) + Number(f.valor));
  }
  const serie = [];
  for (let iso = desdeISO; iso <= hastaISO; iso = sumarDiasISO(iso, 1)) {
    serie.push({ dia: iso, valor: porDia.get(iso) || 0 });
  }
  return serie;
}

const suma = (serie) => serie.reduce((a, s) => a + s.valor, 0);

// Serie actual + serie del periodo anterior (mismo largo) + tendencia. Es
// "gratis": ya se consultó la ventana doble, esto solo reparte por fecha.
function conTendencia(filas, v) {
  const actual = serieCompleta(filas, v.desdeActual, v.hasta);
  const anterior = serieCompleta(filas, v.desdeAnterior, sumarDiasISO(v.desdeActual, -1));
  const totalActual = suma(actual);
  const totalAnterior = suma(anterior);
  return { serie: actual, total: totalActual, totalPeriodoAnterior: totalAnterior, tendencia: totalActual - totalAnterior };
}

// Divide filas con una subclave (proveedor, tipo, estado…) en sub-series con
// tendencia, más un total por subclave. `filas` trae {dia, sub, valor}.
function conTendenciaPorSubclave(filas, v) {
  const subclaves = [...new Set(filas.map(f => f.sub))];
  const porSubclave = {};
  for (const sub of subclaves) {
    porSubclave[sub] = conTendencia(filas.filter(f => f.sub === sub), v);
  }
  return porSubclave;
}

// Trampa 4: ningún desglose expone un segmento con menos de UMBRAL_SUPRESION.
// Colapsa los chicos en un cubo "Otros" (suma), conserva el resto con nombre.
function suprimir(filas, { clave = 'nombre', valor = 'valor' } = {}) {
  const visibles = [];
  let otros = 0;
  let otrosCount = 0;
  for (const f of filas) {
    if (f[valor] < UMBRAL_SUPRESION) {
      otros += f[valor];
      otrosCount += 1;
    } else {
      visibles.push({ [clave]: f[clave], [valor]: f[valor] });
    }
  }
  if (otrosCount > 0) visibles.push({ [clave]: 'Otros', [valor]: otros, agrupados: otrosCount });
  return visibles;
}

// ---------- Consultas (una por métrica o grupo de métricas afines) ----------

// A. Series de un solo conteo por día, de tablas distintas, en UNA consulta —
// evita 9 viajes a la base para 9 métricas simples (Trampa 1).
async function consultaSeriesSimples(desdeConsulta) {
  return prisma.$queryRaw`
    SELECT 'altas' AS fuente, ${diaMx('createdAt')} AS dia, count(*)::int AS valor
      FROM "User" WHERE "createdAt" >= ${desdeConsulta} GROUP BY 2
    UNION ALL
    SELECT 'eliminaciones', ${diaMx('deletedAt')}, count(*)::int
      FROM "User" WHERE "deletedAt" IS NOT NULL AND "deletedAt" >= ${desdeConsulta} GROUP BY 2
    UNION ALL
    SELECT 'exportaciones', ${diaMx('createdAt')}, count(*)::int
      FROM "PrivacyAction" WHERE type = 'EXPORTAR_DATOS' AND "createdAt" >= ${desdeConsulta} GROUP BY 2
    UNION ALL
    SELECT 'mensajes', ${diaMx('createdAt')}, count(*)::int
      FROM "Message" WHERE "createdAt" >= ${desdeConsulta} GROUP BY 2
    UNION ALL
    SELECT 'imagenes', ${diaMx('createdAt')}, count(*)::int
      FROM "Media" WHERE "createdAt" >= ${desdeConsulta} GROUP BY 2
    UNION ALL
    SELECT 'toques', ${diaMx('createdAt')}, count(*)::int
      FROM "Notification" WHERE type = 'POKE' AND "createdAt" >= ${desdeConsulta} GROUP BY 2
    UNION ALL
    SELECT 'bloqueos', ${diaMx('createdAt')}, count(*)::int
      FROM "Block" WHERE "createdAt" >= ${desdeConsulta} GROUP BY 2
    UNION ALL
    SELECT 'suspensionesNuevas', ${diaMx('createdAt')}, count(*)::int
      FROM "ModerationAction" WHERE type = 'SUSPENDER' AND "createdAt" >= ${desdeConsulta} GROUP BY 2
    UNION ALL
    SELECT 'suspensionesLevantadas', ${diaMx('createdAt')}, count(*)::int
      FROM "ModerationAction" WHERE type = 'LEVANTAR_SUSPENSION' AND "createdAt" >= ${desdeConsulta} GROUP BY 2
  `;
}

// B. Altas por proveedor de identidad y día — mide el efecto del reordenamiento del login (ciclo 2)
async function consultaAltasPorProveedor(desdeConsulta) {
  return prisma.$queryRaw`
    SELECT provider AS sub, ${diaMx('createdAt')} AS dia, count(*)::int AS valor
    FROM "Identity" WHERE "createdAt" >= ${desdeConsulta}
    GROUP BY provider, dia
  `;
}

// C. Feed: posts + comentarios por día
async function consultaFeedPorDia(desdeConsulta) {
  return prisma.$queryRaw`
    SELECT 'post' AS sub, ${diaMx('createdAt')} AS dia, count(*)::int AS valor
      FROM "Post" WHERE "createdAt" >= ${desdeConsulta} GROUP BY 2
    UNION ALL
    SELECT 'comment', ${diaMx('createdAt')}, count(*)::int
      FROM "Comment" WHERE "createdAt" >= ${desdeConsulta} GROUP BY 2
  `;
}

// D. Reacciones por día y tipo (feed + foro juntos: son la misma tabla)
async function consultaReaccionesPorDia(desdeConsulta) {
  return prisma.$queryRaw`
    SELECT type AS sub, ${diaMx('createdAt')} AS dia, count(*)::int AS valor
    FROM "Reaction" WHERE "createdAt" >= ${desdeConsulta}
    GROUP BY type, dia
  `;
}

// E. Foro: posts + comentarios por día
async function consultaForoPorDia(desdeConsulta) {
  return prisma.$queryRaw`
    SELECT 'forumPost' AS sub, ${diaMx('createdAt')} AS dia, count(*)::int AS valor
      FROM "ForumPost" WHERE "createdAt" >= ${desdeConsulta} GROUP BY 2
    UNION ALL
    SELECT 'forumComment', ${diaMx('createdAt')}, count(*)::int
      FROM "ForumComment" WHERE "createdAt" >= ${desdeConsulta} GROUP BY 2
  `;
}

// F. Solicitudes de amistad por día y estado — la tasa de aceptación es lo interesante
async function consultaAmistadPorDia(desdeConsulta) {
  return prisma.$queryRaw`
    SELECT status AS sub, ${diaMx('createdAt')} AS dia, count(*)::int AS valor
    FROM "FriendRequest" WHERE "createdAt" >= ${desdeConsulta}
    GROUP BY status, dia
  `;
}

// G. Reportes por día, motivo y estado — nunca quién reportó, nunca el detalle
// libre. `sub` combina motivo+estado como "MOTIVO::ESTADO" (los enums de
// Postgres no concatenan con `||` sin castear a texto primero); el frontend
// separa por ese delimitador.
async function consultaReportesPorDia(desdeConsulta) {
  return prisma.$queryRaw`
    SELECT reason::text || '::' || status::text AS sub, ${diaMx('createdAt')} AS dia, count(*)::int AS valor
    FROM "Report" WHERE "createdAt" >= ${desdeConsulta}
    GROUP BY reason, status, dia
  `;
}

// H. Instantáneas de "ahora mismo" que no son series de tiempo — combinadas en
// una sola consulta con subconsultas escalares.
async function consultaInstantaneas() {
  const ahora = Date.now();
  const corte = (h) => new Date(ahora - h * 60 * 60 * 1000);
  const cutMastodon = corte(VENTANA_CUARENTENA_H.MASTODON);
  const cutEmail = corte(VENTANA_CUARENTENA_H.EMAIL);
  const cutPasskey = corte(VENTANA_CUARENTENA_H.PASSKEY);
  const cercaCutoff = new Date(ahora - CELL_TTL_DIAS * 24 * 60 * 60 * 1000);
  const filas = await prisma.$queryRaw`
    SELECT
      -- Cuarentena, con la ventana REAL de cada cuenta (8H).
      --
      -- La regla de requireAuth.js: una cuenta con varias identidades toma la
      -- ventana MÁS CORTA — llave + correo de respaldo debe esperar menos, es
      -- la conducta que se quiere fomentar para recuperación de cuenta.
      -- Ventana más corta = corte MÁS RECIENTE, de ahí el MAX y no un MIN.
      -- Mastodon tiene ventana 0, así que su corte es "ahora" y nunca cuenta.
      --
      -- Sin identidades el MAX es NULL y la comparación no se cumple: una
      -- cuenta que no puede entrar tampoco puede estar en cuarentena.
      (SELECT count(*)::int FROM "User" u
        WHERE u."deletedAt" IS NULL
          AND u."createdAt" >= (
            SELECT MAX(CASE i.provider
              WHEN 'MASTODON' THEN ${cutMastodon}
              WHEN 'EMAIL'    THEN ${cutEmail}
              WHEN 'PASSKEY'  THEN ${cutPasskey}
            END)
            FROM "Identity" i WHERE i."userId" = u.id
          )
      ) AS cuarentena,
      -- Zona compartida, con el MISMO criterio que usa Cerca.
      --
      -- Antes solo miraba que la celda no fuera nula y no hubiera caducado.
      -- Pero hasActiveCell() en nearbyRoutes.js exige además que la celda
      -- tenga el FORMATO ACTUAL: las del geohash viejo (~5 km) se descartan y
      -- esas personas no aparecen en el mapa de nadie. Contarlas aquí decía
      -- que hay más gente compartiendo zona de la que Cerca puede mostrar.
      -- Replica isValidCell de geogrid.js COMPLETA: el patrón CELL_RE
      -- ("{latIdx}_{lonIdx}") **y** los límites de la cuadrícula. Solo el
      -- patrón dejaría pasar índices fuera de rango, que la app sí descarta.
      -- El split es seguro porque el patrón ya garantizó que son dígitos.
      (SELECT count(*)::int FROM "User"
        WHERE "nearbyCell" ~ '^[0-9]{1,4}_[0-9]{1,5}$'
          AND split_part("nearbyCell", '_', 1)::int < ${LAT_CELLS}
          AND split_part("nearbyCell", '_', 2)::int < ${LON_CELLS}
          AND "nearbyUpdatedAt" >= ${cercaCutoff}) AS "compartiendoZona",
      (SELECT count(*)::int FROM (SELECT "userId" FROM "Identity" GROUP BY "userId" HAVING count(*) > 1) x) AS "metodosMultiples",
      (SELECT count(*)::int FROM "Post" WHERE "hiddenAt" IS NOT NULL) AS "ocultoFeed",
      (SELECT count(*)::int FROM "ForumPost" WHERE "hiddenAt" IS NOT NULL) AS "ocultoForo"
  `;
  const fila = filas[0];
  return {
    cuentasEnCuarentena: fila.cuarentena,
    personasCompartiendoZona: fila.compartiendoZona,
    cuentasConMetodosMultiples: fila.metodosMultiples,
    contenidoOcultoVigente: { feed: fila.ocultoFeed, foro: fila.ocultoForo }
  };
}

// I. Subforos vivos (post en los últimos 30 días) contra muertos. Fijo en 30
// días — es una definición de producto, no depende del selector de ventana.
async function consultaSubforosVivos() {
  const filas = await prisma.$queryRaw`
    SELECT
      count(*) FILTER (WHERE ultimo >= now() - interval '30 days')::int AS vivos,
      count(*) FILTER (WHERE ultimo IS NULL OR ultimo < now() - interval '30 days')::int AS muertos
    FROM (
      SELECT s.id, MAX(fp."createdAt") AS ultimo
      FROM "SubForum" s
      LEFT JOIN "ForumPost" fp ON fp."subforumId" = s.id
      WHERE s."archivedAt" IS NULL
      GROUP BY s.id
    ) t
  `;
  return { vivos: filas[0].vivos, muertos: filas[0].muertos };
}

// J. Seguidores por subforo (desglose con supresión — Trampa 4)
async function consultaSeguidoresPorSubforo() {
  const filas = await prisma.$queryRaw`
    SELECT s.name AS nombre, count(f."userId")::int AS valor
    FROM "SubForum" s
    LEFT JOIN "SubForumFollow" f ON f."subforumId" = s.id
    WHERE s."archivedAt" IS NULL
    GROUP BY s.id, s.name
    ORDER BY valor DESC
  `;
  return suprimir(filas);
}

// K. Concentración de actividad: % de posts de foro (del periodo) en los 3
// subforos más activos. Solo se expone el ratio, no el desglose por nombre —
// no hace falta nombrar subforos chicos para responder "¿está muy concentrado?".
async function consultaConcentracion(desdeActualISO, hastaISO) {
  const filas = await prisma.$queryRaw`
    SELECT count(fp.id)::int AS valor
    FROM "SubForum" s
    LEFT JOIN "ForumPost" fp ON fp."subforumId" = s.id AND ${entreDiasMx('createdAt', 'fp', desdeActualISO, hastaISO)}
    WHERE s."archivedAt" IS NULL
    GROUP BY s.id
    ORDER BY valor DESC
  `;
  const total = filas.reduce((a, f) => a + f.valor, 0);
  const top3 = filas.slice(0, 3).reduce((a, f) => a + f.valor, 0);
  return { top3Pct: total > 0 ? Math.round((top3 / total) * 1000) / 10 : null, totalPosts: total };
}

// L. Tiempo de respuesta a un reporte: mediana y p90, NUNCA promedio — un solo
// caso olvidado semanas distorsiona el promedio y esconde que el resto va bien.
async function consultaTiempoRespuesta(desdeActualISO, hastaISO) {
  const filas = await prisma.$queryRaw`
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt"))) AS mediana_seg,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt"))) AS p90_seg,
      count(*)::int AS muestra
    FROM "Report"
    WHERE "resolvedAt" IS NOT NULL AND ${entreDiasMx('createdAt', null, desdeActualISO, hastaISO)}
  `;
  const f = filas[0];
  const aHoras = (seg) => (seg === null ? null : Math.round((Number(seg) / 3600) * 10) / 10);
  return { medianaHoras: aHoras(f.mediana_seg), p90Horas: aHoras(f.p90_seg), muestra: f.muestra };
}

// M. Reincidencia: cuentas con más de un reporte ACCIONADO en el periodo,
// atadas al autor real del contenido (o a la cuenta, si el reporte es sobre
// la cuenta misma). Nunca se listan los nombres, solo el conteo.
async function consultaReincidencia(desdeActualISO, hastaISO) {
  const enVentana = entreDiasMx('createdAt', 'r', desdeActualISO, hastaISO);
  const filas = await prisma.$queryRaw`
    WITH autores AS (
      SELECT p."authorId" AS "userId" FROM "Report" r JOIN "Post" p ON p.id = r."postId"
        WHERE r.status = 'ACCIONADO' AND r."postId" IS NOT NULL AND ${enVentana}
      UNION ALL
      SELECT c."authorId" FROM "Report" r JOIN "Comment" c ON c.id = r."commentId"
        WHERE r.status = 'ACCIONADO' AND r."commentId" IS NOT NULL AND ${enVentana}
      UNION ALL
      SELECT fp."authorId" FROM "Report" r JOIN "ForumPost" fp ON fp.id = r."forumPostId"
        WHERE r.status = 'ACCIONADO' AND r."forumPostId" IS NOT NULL AND ${enVentana}
      UNION ALL
      SELECT fc."authorId" FROM "Report" r JOIN "ForumComment" fc ON fc.id = r."forumCommentId"
        WHERE r.status = 'ACCIONADO' AND r."forumCommentId" IS NOT NULL AND ${enVentana}
      UNION ALL
      SELECT r."targetUserId" FROM "Report" r
        WHERE r.status = 'ACCIONADO' AND r."targetUserId" IS NOT NULL AND ${enVentana}
    )
    SELECT count(*)::int AS cuentas FROM (
      SELECT "userId" FROM autores GROUP BY "userId" HAVING count(*) > 1
    ) t
  `;
  return { cuentas: filas[0].cuentas };
}

// N. Carga por moderador — vive aparte porque su visibilidad depende del rol
// de quien pregunta (HU-PAN-004 CA5), a diferencia del resto de la ruta, que
// es ADMIN estricto.
async function consultaCargaPorModerador(desdeActualISO, hastaISO) {
  const filas = await prisma.$queryRaw`
    SELECT "moderatorId", count(*)::int AS valor
    FROM "ModerationAction"
    WHERE ${entreDiasMx('createdAt', null, desdeActualISO, hastaISO)}
    GROUP BY "moderatorId"
    ORDER BY valor DESC
  `;
  if (filas.length === 0) return [];
  const moderadores = await prisma.user.findMany({
    where: { id: { in: filas.map(f => f.moderatorId) } },
    select: { id: true, name: true, displayName: true, handle: true }
  });
  const porId = new Map(moderadores.map(m => [m.id, m]));
  return filas.map(f => ({
    moderatorId: f.moderatorId,
    nombre: porId.get(f.moderatorId)?.displayName || porId.get(f.moderatorId)?.name || `#${f.moderatorId}`,
    handle: porId.get(f.moderatorId)?.handle,
    valor: f.valor
  }));
}

// ---------- Cálculo del catálogo completo (sin caché) ----------

async function calcularCatalogo(dias) {
  const v = ventana(dias);

  const [
    simples, altasProveedor, feed, reacciones, foro, amistad, reportes,
    instantaneas, subforosVivos, seguidores, concentracion, tiempoRespuesta, reincidencia
  ] = await Promise.all([
    consultaSeriesSimples(v.desdeConsulta),
    consultaAltasPorProveedor(v.desdeConsulta),
    consultaFeedPorDia(v.desdeConsulta),
    consultaReaccionesPorDia(v.desdeConsulta),
    consultaForoPorDia(v.desdeConsulta),
    consultaAmistadPorDia(v.desdeConsulta),
    consultaReportesPorDia(v.desdeConsulta),
    consultaInstantaneas(),
    consultaSubforosVivos(),
    consultaSeguidoresPorSubforo(),
    consultaConcentracion(v.desdeActual, v.hasta),
    consultaTiempoRespuesta(v.desdeActual, v.hasta),
    consultaReincidencia(v.desdeActual, v.hasta)
  ]);

  const porFuente = (fuente) => simples.filter(f => f.fuente === fuente);

  // Amistad: tasa de aceptación del periodo actual (aproximada: de las
  // solicitudes CREADAS en la ventana, cuántas están ACEPTADAS ahora mismo —
  // no espera a que se resuelvan las de los últimos días, así que subestima
  // un poco las más recientes; es la misma limitación que cualquier tasa de
  // conversión medida antes de que termine la cohorte).
  const amistadFilas = amistad.filter(f => enRango(fmtDia(f.dia), v.desdeActual, v.hasta));
  const enviadasPeriodo = amistadFilas.reduce((a, f) => a + Number(f.valor), 0);
  const aceptadasPeriodo = amistadFilas.filter(f => f.sub === 'ACCEPTED').reduce((a, f) => a + Number(f.valor), 0);

  // Bloqueos: el mejor indicador temprano de acoso silencioso — ratio contra altas del mismo periodo
  const bloqueosTendencia = conTendencia(porFuente('bloqueos'), v);
  const altasTendencia = conTendencia(porFuente('altas'), v);

  return {
    dias,
    periodo: { desde: v.desdeActual, hasta: v.hasta },
    crecimiento: {
      altasPorDia: altasTendencia,
      altasPorProveedor: conTendenciaPorSubclave(altasProveedor, v),
      cuentasConMetodosMultiples: instantaneas.cuentasConMetodosMultiples,
      eliminacionesPorDia: conTendencia(porFuente('eliminaciones'), v),
      exportacionesPorDia: conTendencia(porFuente('exportaciones'), v),
      cuentasEnCuarentena: instantaneas.cuentasEnCuarentena
    },
    actividad: {
      postsPorDia: conTendencia(feed.filter(f => f.sub === 'post'), v),
      comentariosPorDia: conTendencia(feed.filter(f => f.sub === 'comment'), v),
      reaccionesPorDiaYTipo: conTendenciaPorSubclave(reacciones, v),
      foro: {
        postsPorDia: conTendencia(foro.filter(f => f.sub === 'forumPost'), v),
        comentariosPorDia: conTendencia(foro.filter(f => f.sub === 'forumComment'), v)
      },
      mensajesPorDia: conTendencia(porFuente('mensajes'), v),
      personasCompartiendoZona: instantaneas.personasCompartiendoZona,
      imagenesPorDia: conTendencia(porFuente('imagenes'), v),
      toquesPorDia: conTendencia(porFuente('toques'), v)
    },
    saludSocial: {
      amistad: {
        porDiaYEstado: conTendenciaPorSubclave(amistad, v),
        tasaAceptacionPeriodo: enviadasPeriodo > 0 ? Math.round((aceptadasPeriodo / enviadasPeriodo) * 1000) / 10 : null
      },
      bloqueosPorDia: bloqueosTendencia,
      ratioBloqueosAltas: altasTendencia.total > 0 ? Math.round((bloqueosTendencia.total / altasTendencia.total) * 1000) / 10 : null,
      contenidoOcultoVigente: instantaneas.contenidoOcultoVigente
    },
    foros: {
      subforosVivosVsMuertos: subforosVivos,
      seguidoresPorSubforo: seguidores,
      concentracionActividad: concentracion
    },
    moderacion: {
      reportesPorDiaMotivoEstado: conTendenciaPorSubclave(reportes, v),
      tiempoRespuesta,
      reincidencia,
      suspensionesNuevasPorDia: conTendencia(porFuente('suspensionesNuevas'), v),
      suspensionesLevantadasPorDia: conTendencia(porFuente('suspensionesLevantadas'), v)
    }
  };
}

// ---------- Caché en memoria del proceso (5-15 min) ----------
//
// Nadie decide distinto porque el conteo de posteos esté 10 minutos
// desactualizado. Un objeto con marca de tiempo por `dias` alcanza — nada de
// Redis, coherente con la aversión del proyecto a dependencias nuevas.
const cache = new Map(); // dias -> { calculadoEn: Date, datos }

async function obtenerIndicadores(dias) {
  const previo = cache.get(dias);
  if (previo && Date.now() - previo.calculadoEn.getTime() < TTL_CACHE_MS) {
    return { ...previo.datos, calculadoEn: previo.calculadoEn };
  }
  const datos = await calcularCatalogo(dias);
  const calculadoEn = new Date();
  cache.set(dias, { calculadoEn, datos });
  return { ...datos, calculadoEn };
}

// Carga por moderador — caché propia porque se sirve desde una ruta aparte
// (MOD y ADMIN, con recorte).
const cacheCarga = new Map(); // dias -> { calculadoEn, filas }

async function obtenerCargaModeracion(dias) {
  const previo = cacheCarga.get(dias);
  if (previo && Date.now() - previo.calculadoEn.getTime() < TTL_CACHE_MS) {
    return { filas: previo.filas, calculadoEn: previo.calculadoEn };
  }
  const v = ventana(dias);
  const filas = await consultaCargaPorModerador(v.desdeActual, v.hasta);
  const calculadoEn = new Date();
  cacheCarga.set(dias, { calculadoEn, filas });
  return { filas, calculadoEn };
}

// Recorte por rol (HU-PAN-004 CA5): el servidor decide qué se ve, nunca el
// cliente. MOD ve su propio número y el promedio del equipo; ADMIN ve el
// desglose completo por persona.
function recortarCargaPorRol({ filas, calculadoEn }, viewer) {
  if (viewer.role === 'ADMIN') {
    return { calculadoEn, desglose: filas };
  }
  const propio = filas.find(f => f.moderatorId === viewer.id)?.valor || 0;
  const promedioEquipo = filas.length > 0
    ? Math.round((filas.reduce((a, f) => a + f.valor, 0) / filas.length) * 10) / 10
    : 0;
  return { calculadoEn, propio, promedioEquipo };
}

// --- Tendencias de hashtags (ciclo 10D) ---
//
// Vive aquí y no en adminRoutes porque hereda las mismas reglas que el resto
// del panóptico: agrega por volumen, respeta la ventana en días de México
// (`ventana`, ver la Trampa 2 arriba) y no expone segmentos que representan a
// muy poca gente.
//
// El umbral es de CUENTAS DISTINTAS, no de posteos, y esa es la diferencia que
// importa: contar posteos deja que una sola persona publicando veinte veces
// fabrique una tendencia. Se reusa UMBRAL_SUPRESION porque el criterio es el
// mismo que en los demás desgloses — no mostrar lo que representa a poca gente.
async function obtenerTendencias(dias) {
  const { desdeActual, hasta } = ventana(dias);
  const filas = await prisma.$queryRaw`
    SELECT h."tag", h."displayTag",
           count(DISTINCT p."authorId")::int AS cuentas,
           count(*)::int                     AS posteos
    FROM "HashtagOnPost" hp
    JOIN "Hashtag" h ON h."id" = hp."hashtagId"
    JOIN "Post"    p ON p."id" = hp."postId"
    JOIN "User"    u ON u."id" = p."authorId"
    WHERE ${diaMx('createdAt', 'p')} BETWEEN ${desdeActual}::date AND ${hasta}::date
      -- Nada oculto por moderación alimenta una tendencia
      AND p."hiddenAt" IS NULL
      -- Ni el contenido de cuentas suspendidas o eliminadas
      AND u."deletedAt" IS NULL
      AND (u."suspendedUntil" IS NULL OR u."suspendedUntil" <= NOW())
      -- Ni las palabras del diccionario, aunque tengan filas viejas: agregar
      -- una palabra no borra el pasado, pero sí la saca de esta pantalla.
      AND NOT EXISTS (
        SELECT 1 FROM "PalabraDescartada" d WHERE d."palabra" = h."tag"
      )
    GROUP BY h."tag", h."displayTag"
    HAVING count(DISTINCT p."authorId") >= ${UMBRAL_SUPRESION}
    ORDER BY cuentas DESC, posteos DESC
    LIMIT 50
  `;
  return {
    dias,
    umbralCuentas: UMBRAL_SUPRESION,
    // Sin `authorId` en ninguna parte: la tendencia dice qué tema está activo,
    // nunca quién lo publicó.
    tendencias: filas
  };
}

module.exports = {
  DIAS_PERMITIDOS,
  UMBRAL_SUPRESION,
  obtenerIndicadores,
  obtenerCargaModeracion,
  recortarCargaPorRol,
  obtenerTendencias
};
