// Socket.IO para el chat en tiempo real.
// El socket solo EMPUJA eventos al cliente; el envío de mensajes entra por REST
// (así hereda auth, rate limit y validación de la API). Cada usuario autenticado
// se une a su sala personal `user:{id}` y ahí recibe los mensajes de todas sus
// conversaciones.
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { allowedOrigins } = require('./allowedOrigins');
const { log } = require('./logger');
const { addSocket, removeSocket } = require('./presence');
const { presenciaVisiblePara, crearLimitador } = require('./presenciaAutorizada');

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

    // Consulta de presencia en vivo para el interlocutor del chat abierto.
    // El `targetUserId` lo manda el cliente y no es de fiar: la autorización
    // (chat compartido, sin bloqueo, cuenta viva, reciprocidad) vive en
    // `presenciaVisiblePara`, y toda negativa responde igual que "desconectado"
    // (ciclo 16C, A-1). Con tope por conexión.
    const permitirConsulta = crearLimitador();
    socket.on('chat:query_presence', async (payload, callback) => {
      if (typeof callback !== 'function') return;
      try {
        if (!permitirConsulta()) return callback({ isOnline: false });
        const targetId = Number(payload?.targetUserId);
        const online = await presenciaVisiblePara(socket.userId, targetId);
        callback({ userId: targetId, isOnline: online });
      } catch {
        callback({ isOnline: false });
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
