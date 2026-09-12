// Chat 1 a 1: conversaciones y mensajes.
// El envío entra por REST (auth + rate limit + validación) y la entrega en vivo
// sale por Socket.IO hacia la sala personal del destinatario (src/lib/chatSocket).
const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const { requireAuth, requireNotSuspended, estaEstablecida } = require('../middlewares/requireAuth');
const { emitToUser } = require('../lib/chatSocket');
const { blockedWith, isBlockedBetween } = require('../lib/blocks');
const { crearNotificacion } = require('../lib/notifications');

const MAX_MESSAGE_LENGTH = 1000;
const MESSAGES_PAGE_SIZE = 50;

const participantSelect = {
  id: true, name: true, displayName: true, avatar: true, handle: true,
  confirmacionesLectura: true, mostrarEnLinea: true
};

// Forma pública de una conversación para el usuario actual: el "otro" participante + último mensaje
function serializeChat(chat, currentUserId, unreadCount = 0) {
  const other = chat.users.find(u => u.id !== currentUserId) || chat.users[0] || null;
  const currentUser = chat.users.find(u => u.id === currentUserId);
  const lastMessage = chat.messages?.[0] || null;

  let serializedLastMessage = null;
  if (lastMessage) {
    // Reciprocidad en visto para el último mensaje:
    const showRead = Boolean(
      currentUser?.confirmacionesLectura !== false &&
      other?.confirmacionesLectura !== false
    );
    serializedLastMessage = {
      id: lastMessage.id,
      content: lastMessage.content,
      senderId: lastMessage.senderId,
      createdAt: lastMessage.createdAt,
      readAt: showRead ? lastMessage.readAt : null
    };
  }

  return {
    id: chat.id,
    with: other ? {
      id: other.id,
      name: other.name,
      displayName: other.displayName,
      avatar: other.avatar,
      handle: other.handle
    } : null,
    unreadCount,
    lastMessage: serializedLastMessage,
    createdAt: chat.createdAt
  };
}

// Verifica que la conversación exista, que el usuario sea participante y que no
// haya un bloqueo de por medio. Un chat con alguien bloqueado se comporta como
// inexistente (404) para leer y para escribir — es el único punto por el que
// pasan ambas operaciones, así que el filtro vive aquí.
async function findChatForUser(chatId, userId) {
  if (!chatId) return null;
  const hidden = await blockedWith(userId);
  return prisma.chat.findFirst({
    where: {
      id: chatId,
      AND: [
        { users: { some: { id: userId } } },
        ...(hidden.length ? [{ users: { none: { id: { in: hidden } } } }] : [])
      ]
    },
    include: { users: { select: participantSelect } }
  });
}

// GET /api/chat/users?q= — buscar con quién conversar (datos públicos, sin PII)
router.get('/users', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ users: [] });
  try {
    const hidden = await blockedWith(req.user.id);
    const users = await prisma.user.findMany({
      where: {
        id: { notIn: [req.user.id, ...hidden] },
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
          { handle: { contains: q, mode: 'insensitive' } }
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
    const hidden = await blockedWith(req.user.id);
    const chats = await prisma.chat.findMany({
      where: {
        AND: [
          { users: { some: { id: req.user.id } } },
          ...(hidden.length ? [{ users: { none: { id: { in: hidden } } } }] : [])
        ]
      },
      include: {
        users: { select: participantSelect },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });

    const chatIds = chats.map(c => c.id);
    // Conteo eficiente de mensajes no leídos por chat
    const unreadCounts = await prisma.message.groupBy({
      by: ['chatId'],
      where: {
        chatId: { in: chatIds },
        senderId: { not: req.user.id },
        readAt: null
      },
      _count: true
    });
    const unreadMap = new Map(unreadCounts.map(u => [u.chatId, u._count]));

    const serialized = chats
      .map(c => serializeChat(c, req.user.id, unreadMap.get(c.id) || 0))
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
router.post('/conversations', requireAuth, requireNotSuspended, async (req, res) => {
  const otherId = Number(req.body.userId);
  if (!otherId) return res.status(400).json({ error: 'userId requerido' });
  if (otherId === req.user.id) return res.status(400).json({ error: 'No puedes abrir un chat contigo' });
  try {
    const other = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
    if (!other) return res.status(404).json({ error: 'Usuario no encontrado' });
    // Con un bloqueo de por medio la persona no existe para efectos del chat:
    // misma respuesta que un id inexistente, para no delatar el bloqueo.
    if (await isBlockedBetween(req.user.id, otherId)) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

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
      // Solo la conversación NUEVA pasa por la cuarentena de altas recientes
      // (HU-SEG-006, ver requireAuth.js): recuperar una que ya existía no es
      // "alcanzar a alguien por primera vez".
      const estado = await estaEstablecida(req.user.id);
      if (!estado.ok) {
        return res.status(403).json({
          error: 'Tu cuenta es muy nueva para abrir conversaciones nuevas. Es una protección de la comunidad, no un castigo.',
          disponibleEn: estado.disponibleEn
        });
      }
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

    const other = chat.users.find(u => u.id !== req.user.id);
    const currentUser = chat.users.find(u => u.id === req.user.id);
    const showRead = Boolean(
      currentUser?.confirmacionesLectura !== false &&
      other?.confirmacionesLectura !== false
    );

    const serializedMessages = messages.map(m => ({
      ...m,
      readAt: showRead ? m.readAt : null
    }));

    res.json({ messages: serializedMessages, hasMore: messages.length === MESSAGES_PAGE_SIZE });
  } catch (e) {
    console.error('Error al listar mensajes:', e);
    res.status(500).json({ error: 'Error al obtener los mensajes' });
  }
});

// POST /api/chat/conversations/:id/read — marcar mensajes y notificaciones como leídos
router.post('/conversations/:id/read', requireAuth, async (req, res) => {
  const chatId = Number(req.params.id);
  try {
    const chat = await findChatForUser(chatId, req.user.id);
    if (!chat) return res.status(404).json({ error: 'Conversación no encontrada' });

    const now = new Date();
    // 1. Marcar mensajes de la otra persona como leídos
    await prisma.message.updateMany({
      where: { chatId, senderId: { not: req.user.id }, readAt: null },
      data: { readAt: now }
    });

    // 2. Marcar notificaciones in-app de este chat como leídas
    await prisma.notification.updateMany({
      where: { recipientId: req.user.id, chatId, readAt: null },
      data: { readAt: now }
    });

    // 3. Avisar en tiempo real a todas las sesiones de ambos participantes
    const other = chat.users.find(u => u.id !== req.user.id);
    const currentUser = chat.users.find(u => u.id === req.user.id);
    const showRead = Boolean(
      currentUser?.confirmacionesLectura !== false &&
      other?.confirmacionesLectura !== false
    );

    for (const user of chat.users) {
      emitToUser(user.id, 'chat:read', {
        chatId,
        readerId: req.user.id,
        readAt: showRead ? now : null
      });
    }

    res.json({ ok: true, readAt: now });
  } catch (e) {
    console.error('Error al marcar conversación como leída:', e);
    res.status(500).json({ error: 'Error al marcar como leída' });
  }
});

// POST /api/chat/conversations/:id/messages { content } — enviar; entrega en vivo por socket
router.post('/conversations/:id/messages', requireAuth, requireNotSuspended, async (req, res) => {
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

    // Notificación in-app para quien no está viendo el chat en ese momento: el
    // socket solo entrega a sesiones conectadas AHORA, así que sin esto un
    // mensaje mandado mientras la otra persona está fuera de /chat se pierde
    // sin dejar rastro. Se colapsa: si ya hay una notificación sin leer de esta
    // misma conversación, no se apila una nueva por cada mensaje — una ráfaga
    // de mensajes solo debe verse como "tienes un mensaje nuevo", no como diez.
    const destinatarios = chat.users.filter(u => u.id !== req.user.id);
    await Promise.all(destinatarios.map(async (u) => {
      const yaHayNoLeida = await prisma.notification.findFirst({
        where: { type: 'CHAT_MESSAGE', chatId, recipientId: u.id, actorId: req.user.id, readAt: null },
        select: { id: true }
      });
      if (yaHayNoLeida) return;
      await crearNotificacion({
        type: 'CHAT_MESSAGE',
        recipientId: u.id,
        actorId: req.user.id,
        chatId,
        actorName: req.user.name
      });
    }));

    res.json(message);
  } catch (e) {
    console.error('Error al enviar mensaje:', e);
    res.status(500).json({ error: 'Error al enviar el mensaje' });
  }
});

module.exports = router;
