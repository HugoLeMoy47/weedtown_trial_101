// Autorización de la consulta de presencia (ciclo 16C, hallazgo A-1).
//
// `chat:query_presence` nació en el ciclo de chat aceptando CUALQUIER
// `targetUserId`. Eso la volvía un oráculo: una sesión cualquiera recorría ids
// y sabía quién estaba en línea — incluidas personas que la bloquearon, cuentas
// suspendidas y cuentas borradas. Contradice la garantía del propio chat
// («con un bloqueo de por medio la persona no existe», chatRoutes.js) y la
// invariante de enumerabilidad del ciclo 16.
//
// REGLA: la presencia de B solo es consultable por A si
//   1. comparten una conversación (el chat abierto es la única superficie de
//      la UI que la pide),
//   2. no hay bloqueo entre ambos, en ninguna dirección,
//   3. B es una cuenta viva (ni borrada ni suspendida), y
//   4. la reciprocidad de `mostrarEnLinea` se cumple (evaluatePresence).
//
// TODA falla responde `false`, igual que "está desconectado": si "no tienes
// relación" se distinguiera de "está offline", el arreglo sería otro oráculo.
// Vive aparte de presence.js porque aquél es estado en memoria sin base de
// datos, y esto necesita consultarla — y para poder probarse sin un cliente
// de Socket.IO.
const prisma = require('./prisma');
const { isBlockedBetween } = require('./blocks');
const { evaluatePresence } = require('./presence');

/**
 * @param {number} solicitanteId quien pregunta (sale del JWT del socket)
 * @param {number} objetivoId quien es consultado (viene del cliente: no es de fiar)
 * @returns {Promise<boolean>}
 */
async function presenciaVisiblePara(solicitanteId, objetivoId) {
  const a = Number(solicitanteId);
  const b = Number(objetivoId);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0 || a === b) return false;

  const comparten = await prisma.chat.findFirst({
    where: { AND: [{ users: { some: { id: a } } }, { users: { some: { id: b } } }] },
    select: { id: true }
  });
  if (!comparten) return false;
  if (await isBlockedBetween(a, b)) return false;

  const ahora = new Date();
  const [solicitante, objetivo] = await Promise.all([
    prisma.user.findFirst({
      where: { id: a, deletedAt: null },
      select: { id: true, mostrarEnLinea: true }
    }),
    prisma.user.findFirst({
      where: {
        id: b,
        deletedAt: null,
        OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: ahora } }]
      },
      select: { id: true, mostrarEnLinea: true }
    })
  ]);
  return evaluatePresence(solicitante, objetivo);
}

/**
 * Tope de consultas por conexión: un cliente legítimo pregunta cada 15 s
 * (4/min). Sin tope, un socket autenticado podía martillar la base con dos
 * lecturas por evento. Ventana fija de un minuto por socket, en memoria.
 */
function crearLimitador({ max = 30, ventanaMs = 60 * 1000 } = {}) {
  let inicio = null;
  let usadas = 0;
  return function permitir(ahora = Date.now()) {
    if (inicio === null || ahora - inicio >= ventanaMs) {
      inicio = ahora;
      usadas = 0;
    }
    usadas += 1;
    return usadas <= max;
  };
}

module.exports = { presenciaVisiblePara, crearLimitador };
