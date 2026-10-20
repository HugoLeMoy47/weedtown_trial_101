// Socket.IO para el chat en tiempo real.
// El socket solo EMPUJA eventos al cliente; el envío de mensajes entra por REST
// (así hereda auth, rate limit y validación de la API). Cada usuario autenticado
// se une a su sala personal `user:{id}` y ahí recibe los mensajes de todas sus
// conversaciones.
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { allowedOrigins } = require('./allowedOrigins');
const { log } = require('./logger');
const prisma = require('./prisma');
const { addSocket, removeSocket, evaluatePresence } = require('./presence');

let io = null;

function initChatSocket(server) {
  io = new Server(server, {
    cors: { origin: allowedOrigins },
    // El socket solo empuja eventos: el cliente nunca manda payloads propios
    // (el envío de mensajes entra por REST). El único dato que sube es el
    // handshake de auth, así que no hace falta el 1 MB de default — un techo
    // bajo es pura ganancia contra un cliente que intente saturar la conexión.
    maxHttpBufferSize: 20 * 1024
  });

  // Autenticación del handshake: mismo JWT de sesión que la API
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) throw new Error('sin token');
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload.userId;
      next();
    } catch {
      log('chat_socket_auth_fallida', { socketId: socket.id });
      next(new Error('No autenticado'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
    addSocket(socket.userId, socket.id);
    log('chat_socket_conectado', { userId: socket.userId, socketId: socket.id });

    // Consulta de presencia en vivo para el interlocutor del chat abierto
    // (reciprocidad estricta evaluada en evaluatePresence)
    socket.on('chat:query_presence', async ({ targetUserId }, callback) => {
      try {
        const targetId = Number(targetUserId);
        if (!targetId || typeof callback !== 'function') return;
        const [requester, target] = await Promise.all([
          prisma.user.findUnique({ where: { id: socket.userId }, select: { id: true, mostrarEnLinea: true } }),
          prisma.user.findUnique({ where: { id: targetId }, select: { id: true, mostrarEnLinea: true } })
        ]);
        const online = evaluatePresence(requester, target);
        callback({ userId: targetId, isOnline: online });
      } catch {
        if (typeof callback === 'function') callback({ isOnline: false });
      }
    });

    // Socket.IO ya reintenta la reconexión del lado del cliente con backoff
    // propio; del lado del servidor no hay estado que reconstruir más allá de
    // unirse a la sala, que vuelve a pasar solo en cada nueva conexión.
    socket.on('disconnect', (razon) => {
      removeSocket(socket.id);
      log('chat_socket_desconectado', { userId: socket.userId, socketId: socket.id, razon });
    });
  });

  return io;
}

// Empuja un evento a todas las sesiones abiertas de un usuario
function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

module.exports = { initChatSocket, emitToUser };
