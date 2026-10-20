// Medición agregada de actividad (ciclo 19A).
//
// QUÉ RESPONDE: ¿cuántas personas distintas usaron WeedTown cada día? Hasta el
// 18 «activa» solo contaba ESCRITURAS (posteos, reacciones, mensajes). Quien
// entra a leer y se va no existía en ninguna cifra, y sin eso no se puede saber
// si la gente regresa o no — que es la pregunta de fondo de la retención. La
// Ola 5 cometió el mismo error con las invitaciones (decidir sobre una medida
// que no existe) y lo corrigió con `ConteoAtribucion`; esto es el mismo patrón.
//
// QUÉ GUARDA, y es el límite que no se cruza:
//   · `User.ultimaActividadDia`: SOLO una fecha, sin hora, que se SOBRESCRIBE.
//     Es el último día en que la persona hizo cualquier petición autenticada.
//     No hay historia: ayer deja de saberse en cuanto hoy se registra.
//   · `ConteoActividad`: un número por día. Sin identidades.
// Con esas dos cosas sale una serie de personas activas por día, y NO sale una
// bitácora de cuándo estuvo cada quien. Es la misma línea que trazó
// `presence.js` («cero escrituras a BD… crearía una bitácora forense de
// actividad al segundo que contradice la privacidad del producto»), y es lo
// que permite sostener lo que dicen los Términos: no hay historiales de
// navegación persistentes. Lo que cambia es que ahora existe esa fecha, y por
// eso se declara en los Términos (ver el borrador del ciclo 19).
//
// POR QUÉ NO UNA ESCRITURA POR PETICIÓN. Un mapa en memoria por proceso
// (`userId → día`) decide si hoy ya se contó a esa persona; solo la primera
// petición del día toca la base. El mapa se vacía al cambiar el día, así que
// su tamaño máximo es el de las personas activas de un día.
//
// POR QUÉ NO SE DOBLE-CUENTA. El mapa es solo una optimización: la garantía
// vive en el WHERE del UPDATE (`ultimaActividadDia IS NULL OR < hoy`). Si el
// proceso se reinicia, o hay dos instancias, la persona vuelve a pasar por la
// base una vez, el UPDATE no encuentra nada que cambiar y el contador no sube.
// Una persona suma 1 por día sin importar cuántos procesos la vean.
//
// NUNCA LANZA y no se espera: una medición no puede tumbar ni retrasar una
// petición (mismo criterio 5 de HU-CTA-002 que `atribucion.js`).
const prisma = require('./prisma');
const { diaMexicoISO } = require('./diaMexico');
const { log } = require('./logger');

let diaDelMapa = null;
const yaContadas = new Map(); // userId -> 'YYYY-MM-DD'

/**
 * Cuenta a `userId` como activa hoy, a lo sumo una vez por día.
 * @param {number} userId
 * @param {{ahora?: Date}} [opciones] `ahora` solo para pruebas
 * @returns {Promise<boolean>} true si ESTA llamada subió el contador (útil en pruebas)
 */
async function registrarActividad(userId, { ahora = new Date() } = {}) {
  try {
    const uid = Number(userId);
    if (!Number.isInteger(uid) || uid <= 0) return false;

    const dia = diaMexicoISO(ahora);
    if (diaDelMapa !== dia) {
      yaContadas.clear();
      diaDelMapa = dia;
    }
    if (yaContadas.get(uid) === dia) return false;
    // Se marca ANTES de ir a la base: dos peticiones simultáneas de la misma
    // persona no deben lanzar dos consultas.
    yaContadas.set(uid, dia);

    // Una sola sentencia atómica: el UPDATE solo afecta a quien aún no estaba
    // contada hoy, y el contador sube por exactamente las filas que cambiaron.
    const filas = await prisma.$queryRaw`
      WITH cambiadas AS (
        UPDATE "User"
        SET "ultimaActividadDia" = ${dia}::date
        WHERE "id" = ${uid}
          AND "deletedAt" IS NULL
          AND ("ultimaActividadDia" IS NULL OR "ultimaActividadDia" < ${dia}::date)
        RETURNING 1
      ), subida AS (
        INSERT INTO "ConteoActividad" ("dia", "conteo")
        SELECT ${dia}::date, count(*)::int FROM cambiadas HAVING count(*) > 0
        ON CONFLICT ("dia") DO UPDATE SET "conteo" = "ConteoActividad"."conteo" + EXCLUDED."conteo"
        RETURNING 1
      )
      SELECT count(*)::int AS subio FROM subida
    `;
    return Number(filas?.[0]?.subio) > 0;
  } catch (e) {
    // Que falle la medición no puede costarle nada a quien hace la petición.
    // Se desmarca para que la siguiente petición lo reintente.
    try { yaContadas.delete(Number(userId)); } catch { /* nada que hacer */ }
    log('actividad_error', { mensaje: e?.message });
    return false;
  }
}

/** Solo para pruebas: olvida lo que el proceso ya contó. */
function _vaciarMemoria() {
  yaContadas.clear();
  diaDelMapa = null;
}

module.exports = { registrarActividad, _vaciarMemoria };
