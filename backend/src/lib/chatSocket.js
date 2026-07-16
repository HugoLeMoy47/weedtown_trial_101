// Socket.IO para el chat en tiempo real.
// El socket solo EMPUJA eventos al cliente; el envío de mensajes entra por REST
// (así hereda auth, rate limit y validación de la API). Cada usuario autenticado
// se une a su sala personal `user:{id}` y ahí recibe los mensajes de todas sus
// conversaciones.
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { allowedOrigins } = require('./allowedOrigins');

let io = null;

function initChatSocket(server) {
  io = new Server(server, {
    cors: { origin: allowedOrigins }
  });

  // Autenticación del handshake: mismo JWT de sesión que la API
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('No autenticado'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload.userId;
      next();
    } catch {
      next(new Error('No autenticado'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
  });

  return io;
}

// Empuja un evento a todas las sesiones abiertas de un usuario
function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

module.exports = { initChatSocket, emitToUser };
