// Chat 1 a 1: conversaciones y mensajes.
// El envío entra por REST (auth + rate limit + validación) y la entrega en vivo
// sale por Socket.IO hacia la sala personal del destinatario (src/lib/chatSocket).
const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const { requireAuth } = require('../middlewares/requireAuth');
const { emitToUser } = require('../lib/chatSocket');

const MAX_MESSAGE_LENGTH = 1000;
const MESSAGES_PAGE_SIZE = 50;

const participantSelect = { id: true, name: true, displayName: true, avatar: true, acct: true };

// Forma pública de una conversación para el usuario actual: el "otro" participante + último mensaje
function serializeChat(chat, currentUserId) {
  const other = chat.users.find(u => u.id !== currentUserId) || chat.users[0] || null;
  const lastMessage = chat.messages?.[0] || null;
  return {
    id: chat.id,
    with: other,
    lastMessage: lastMessage
      ? { id: lastMessage.id, content: lastMessage.content, senderId: lastMessage.senderId, createdAt: lastMessage.createdAt }
      : null,
    createdAt: chat.createdAt
  };
}

// Verifica que la conversación exista y que el usuario sea participante
async function findChatForUser(chatId, userId) {
  if (!chatId) return null;
  return prisma.chat.findFirst({
    where: { id: chatId, users: { some: { id: userId } } },
    include: { users: { select: participantSelect } }
  });
}

// GET /api/chat/users?q= — buscar con quién conversar (datos públicos, sin PII)
router.get('/users', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ users: [] });
  try {
    const users = await prisma.user.findMany({
      where: {
        id: { not: req.user.id },
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
          { acct: { contains: q, mode: 'insensitive' } }
        ]
      },
      select: participantSelect,
      take: 10
    });
    res.json({ users });
  } catch (e) {
    console.error('Error al buscar usuarios:', e);
    res.status(500).json({ error: 'Error al buscar usuarios' });
  }
});

// GET /api/chat/conversations — mis conversaciones, la de actividad más reciente primero
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const chats = await prisma.chat.findMany({
      where: { users: { some: { id: req.user.id } } },
      include: {
        users: { select: participantSelect },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });
    const serialized = chats
      .map(c => serializeChat(c, req.user.id))
      .sort((a, b) => {
        const ta = new Date(a.lastMessage?.createdAt || a.createdAt).getTime();
        const tb = new Date(b.lastMessage?.createdAt || b.createdAt).getTime();
        return tb - ta;
      });
    res.json({ conversations: serialized });
  } catch (e) {
    console.error('Error al listar conversaciones:', e);
    res.status(500).json({ error: 'Error al obtener las conversaciones' });
  }
});

// POST /api/chat/conversations { userId } — abrir (o recuperar) la conversación 1 a 1 con alguien
router.post('/conversations', requireAuth, async (req, res) => {
  const otherId = Number(req.body.userId);
  if (!otherId) return res.status(400).json({ error: 'userId requerido' });
  if (otherId === req.user.id) return res.status(400).json({ error: 'No puedes abrir un chat contigo' });
  try {
    const other = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
    if (!other) return res.status(404).json({ error: 'Usuario no encontrado' });

    let chat = await prisma.chat.findFirst({
      where: {
        AND: [
          { users: { some: { id: req.user.id } } },
          { users: { some: { id: otherId } } }
        ]
      },
      include: {
        users: { select: participantSelect },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });
    if (!chat) {
      chat = await prisma.chat.create({
        data: { users: { connect: [{ id: req.user.id }, { id: otherId }] } },
        include: {
          users: { select: participantSelect },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 }
        }
      });
    }
    res.json(serializeChat(chat, req.user.id));
  } catch (e) {
    console.error('Error al abrir conversación:', e);
    res.status(500).json({ error: 'Error al abrir la conversación' });
  }
});

// GET /api/chat/conversations/:id/messages?before= — mensajes (los 50 más recientes; before= para historial)
router.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  const chatId = Number(req.params.id);
  const before = req.query.before ? Number(req.query.before) : null;
  try {
    const chat = await findChatForUser(chatId, req.user.id);
    if (!chat) return res.status(404).json({ error: 'Conversación no encontrada' });

    const messages = await prisma.message.findMany({
      where: { chatId, ...(before && { id: { lt: before } }) },
      orderBy: { id: 'desc' },
      take: MESSAGES_PAGE_SIZE,
      include: { sender: { select: { id: true, name: true, avatar: true } } }
    });
    messages.reverse(); // cronológico ascendente para pintar el hilo
    res.json({ messages, hasMore: messages.length === MESSAGES_PAGE_SIZE });
  } catch (e) {
    console.error('Error al listar mensajes:', e);
    res.status(500).json({ error: 'Error al obtener los mensajes' });
  }
});

// POST /api/chat/conversations/:id/messages { content } — enviar; entrega en vivo por socket
router.post('/conversations/:id/messages', requireAuth, async (req, res) => {
  const chatId = Number(req.params.id);
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  if (!content) return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
  if (content.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `El mensaje no puede superar ${MAX_MESSAGE_LENGTH} caracteres` });
  }
  try {
    const chat = await findChatForUser(chatId, req.user.id);
    if (!chat) return res.status(404).json({ error: 'Conversación no encontrada' });

    const message = await prisma.message.create({
      data: { chatId, senderId: req.user.id, content },
      include: { sender: { select: { id: true, name: true, avatar: true } } }
    });

    // Entrega en vivo a todos los participantes (incluidas otras sesiones del emisor)
    for (const user of chat.users) {
      emitToUser(user.id, 'chat:message', { chatId, message });
    }
    res.json(message);
  } catch (e) {
    console.error('Error al enviar mensaje:', e);
    res.status(500).json({ error: 'Error al enviar el mensaje' });
  }
});

module.exports = router;
