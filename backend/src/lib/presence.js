// Presencia en tiempo real para el chat (Ciclo Chat).
//
// EN MEMORIA, CERO ESCRITURAS A BD:
// Registrar conexiones y desconexiones en Postgres saturaría la base y además
// crearía una bitácora forense de actividad al segundo que contradice la
// privacidad del producto. La presencia es un estado efímero del proceso: si
// el servidor se reinicia, los clientes se reconectan en segundos y el mapa se
// reconstruye solo.
//
// RECIPROCIDAD ESTRICTA:
// La función evaluatePresence comprueba que AMBAS partes tengan encendido
// `mostrarEnLinea`. Si quien pregunta lo tiene apagado, recibe `false` (no ve
// a nadie en línea); si quien es consultado lo tiene apagado, quien pregunta
// recibe `false` (no delata su presencia).

const userSockets = new Map(); // userId (Number) -> Set<socketId>
const socketToUser = new Map(); // socketId (String) -> userId (Number)

function addSocket(userId, socketId) {
  const uid = Number(userId);
  if (!uid) return;
  socketToUser.set(socketId, uid);
  if (!userSockets.has(uid)) {
    userSockets.set(uid, new Set());
  }
  userSockets.get(uid).add(socketId);
}

function removeSocket(socketId) {
  const uid = socketToUser.get(socketId);
  if (!uid) return null;
  socketToUser.delete(socketId);
  const set = userSockets.get(uid);
  if (set) {
    set.delete(socketId);
    if (set.size === 0) {
      userSockets.delete(uid);
      return { userId: uid, wentOffline: true };
    }
  }
  return { userId: uid, wentOffline: false };
}

function isOnline(userId) {
  const uid = Number(userId);
  return Boolean(userSockets.has(uid) && userSockets.get(uid).size > 0);
}

/**
 * Resuelve si un usuario se muestra "en línea" para otro aplicando reciprocidad.
 * @param {Object} requester - Usuario que está viendo el chat ({ id, mostrarEnLinea })
 * @param {Object} target - Usuario del otro lado ({ id, mostrarEnLinea })
 * @returns {Boolean}
 */
function evaluatePresence(requester, target) {
  if (!requester || !target) return false;
  if (requester.mostrarEnLinea === false) return false;
  if (target.mostrarEnLinea === false) return false;
  return isOnline(target.id);
}

module.exports = {
  addSocket,
  removeSocket,
  isOnline,
  evaluatePresence
};
