// Pruebas para el sistema de chat 1 a 1, confirmaciones de lectura, reciprocidad y notificaciones.
const { suite } = require('./lib');
const { evaluatePresence, addSocket, removeSocket } = require('../src/lib/presence');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Chat', 'wtcht');

  await cleanup();
  try {
    console.log('\n  — Unitario: Presencia en memoria y reciprocidad estricta —');
    addSocket(9001, 'socket-9001-a');
    check('usuario con socket activo está en línea', (() => {
      const { isOnline } = require('../src/lib/presence');
      return isOnline(9001) === true;
    })());

    check('presencia con ambos en mostrarEnLinea=true es true', (() => {
      return evaluatePresence(
        { id: 9002, mostrarEnLinea: true },
        { id: 9001, mostrarEnLinea: true }
      ) === true;
    })());

    check('reciprocidad: si el solicitante oculta su presencia, no ve al otro en línea', (() => {
      return evaluatePresence(
        { id: 9002, mostrarEnLinea: false },
        { id: 9001, mostrarEnLinea: true }
      ) === false;
    })());

    check('reciprocidad: si el objetivo oculta su presencia, el solicitante no lo ve', (() => {
      return evaluatePresence(
        { id: 9002, mostrarEnLinea: true },
        { id: 9001, mostrarEnLinea: false }
      ) === false;
    })());

    removeSocket('socket-9001-a');
    check('al desconectar el socket, el usuario pasa a desconectado', (() => {
      const { isOnline } = require('../src/lib/presence');
      return isOnline(9001) === false;
    })());

    console.log('\n  — Integración: Apertura de chat y restricciones —');
    // Creamos dos usuarios con cuenta Mastodon (sin cuarentena)
    const ana = await mkUser('ana');
    const beto = await mkUser('beto');
    const tAna = token(ana.id);
    const tBeto = token(beto.id);

    // Ana abre conversación con Beto
    let r = await call('POST', '/api/chat/conversations', {
      tok: tAna,
      body: { userId: beto.id }
    });
    check('Ana abre conversación con Beto (200)', r.status === 200 && r.data?.id > 0);
    const chatId = r.data.id;

    // Abrir de nuevo la misma conversación devuelve el mismo chatId sin duplicar
    let r2 = await call('POST', '/api/chat/conversations', {
      tok: tBeto,
      body: { userId: ana.id }
    });
    check('Beto recupera la misma conversación sin duplicar', r2.status === 200 && r2.data.id === chatId);

    // No se puede abrir chat consigo mismo
    let rAuto = await call('POST', '/api/chat/conversations', {
      tok: tAna,
      body: { userId: ana.id }
    });
    check('rechaza abrir chat consigo mismo (400)', rAuto.status === 400);

    console.log('\n  — Integración: Envío de mensajes y límites —');
    // Mensaje vacío
    let rVacio = await call('POST', `/api/chat/conversations/${chatId}/messages`, {
      tok: tAna,
      body: { content: '   ' }
    });
    check('rechaza mensaje vacío (400)', rVacio.status === 400);

    // Mensaje > 1000 caracteres
    let rLargo = await call('POST', `/api/chat/conversations/${chatId}/messages`, {
      tok: tAna,
      body: { content: 'x'.repeat(1001) }
    });
    check('rechaza mensaje superior a 1000 caracteres (400)', rLargo.status === 400);

    // Ana envía mensaje legítimo
    let rMsg = await call('POST', `/api/chat/conversations/${chatId}/messages`, {
      tok: tAna,
      body: { content: 'Hola Beto, probando el chat 🌿' }
    });
    check('mensaje enviado con éxito (200)', rMsg.status === 200 && rMsg.data.id > 0);
    const msgId = rMsg.data.id;

    console.log('\n  — Integración: Conteo de no leídos y notificaciones —');
    // Beto consulta sus conversaciones: debe tener unreadCount = 1
    let rConvBeto = await call('GET', '/api/chat/conversations', { tok: tBeto });
    check('Beto ve 1 mensaje no leído en la conversación', (() => {
      const conv = rConvBeto.data?.conversations?.find(c => c.id === chatId);
      return conv && conv.unreadCount === 1;
    })());

    // Ana consulta sus conversaciones: unreadCount = 0 para ella (ella lo envió)
    let rConvAna = await call('GET', '/api/chat/conversations', { tok: tAna });
    check('Ana ve 0 no leídos (ella envió el último)', (() => {
      const conv = rConvAna.data?.conversations?.find(c => c.id === chatId);
      return conv && conv.unreadCount === 0;
    })());

    // Verificar que existe notificación in-app para Beto
    const notifBeto = await prisma.notification.findFirst({
      where: { recipientId: beto.id, chatId, type: 'CHAT_MESSAGE', readAt: null }
    });
    check('Beto tiene notificación in-app CHAT_MESSAGE sin leer', Boolean(notifBeto));

    console.log('\n  — Integración: Marcar como leído (/read) y reciprocidad —');
    // Beto marca la conversación como leída
    let rRead = await call('POST', `/api/chat/conversations/${chatId}/read`, { tok: tBeto });
    check('POST /read responde 200', rRead.status === 200 && rRead.data.ok === true);

    // Comprobar que en BD el mensaje tiene readAt
    const msgEnBd = await prisma.message.findUnique({ where: { id: msgId } });
    check('el mensaje tiene readAt en base de datos', Boolean(msgEnBd.readAt));

    // Comprobar que la notificación in-app para Beto quedó marcada como leída
    const notifBetoDespues = await prisma.notification.findFirst({
      where: { id: notifBeto.id }
    });
    check('la notificación in-app asociada quedó marcada como leída', Boolean(notifBetoDespues.readAt));

    // Ana consulta los mensajes: como ambos tienen confirmacionesLectura=true por default, ve readAt
    let rMsgsAna = await call('GET', `/api/chat/conversations/${chatId}/messages`, { tok: tAna });
    check('Ana ve el readAt del mensaje leído (ambos con visto activado)', (() => {
      const m = rMsgsAna.data?.messages?.find(x => x.id === msgId);
      return m && m.readAt !== null;
    })());

    console.log('\n  — Integración: Reciprocidad estricta con confirmacionesLectura=false —');
    // Beto apaga confirmacionesLectura en su perfil
    await call('PUT', '/api/profile/me', {
      tok: tBeto,
      body: { confirmacionesLectura: false }
    });

    // Ana vuelve a consultar los mensajes: ahora readAt debe ser null para ella
    let rMsgsAnaSinVisto = await call('GET', `/api/chat/conversations/${chatId}/messages`, { tok: tAna });
    check('reciprocidad: Ana ya NO ve readAt si Beto apagó su visto', (() => {
      const m = rMsgsAnaSinVisto.data?.messages?.find(x => x.id === msgId);
      return m && m.readAt === null;
    })());

    // Beto consulta los mensajes: él tampoco debe ver readAt (reciprocidad estricta)
    let rMsgsBetoSinVisto = await call('GET', `/api/chat/conversations/${chatId}/messages`, { tok: tBeto });
    check('reciprocidad: Beto tampoco ve readAt porque apagó su visto', (() => {
      const m = rMsgsBetoSinVisto.data?.messages?.find(x => x.id === msgId);
      return m && m.readAt === null;
    })());

    console.log('\n  — Integración: Bloqueo mutuo en chat —');
    // Ana bloquea a Beto
    await call('POST', `/api/users/${beto.id}/block`, { tok: tAna });

    // Intentar leer la conversación responde 404
    let rBloqLectura = await call('GET', `/api/chat/conversations/${chatId}/messages`, { tok: tBeto });
    check('con bloqueo, obtener mensajes responde 404', rBloqLectura.status === 404);

    // Intentar enviar mensaje responde 404
    let rBloqEnvio = await call('POST', `/api/chat/conversations/${chatId}/messages`, {
      tok: tBeto,
      body: { content: '¿Estás ahí?' }
    });
    check('con bloqueo, enviar mensaje responde 404', rBloqEnvio.status === 404);

    // La conversación desaparece del listado para ambos
    let rListaAna = await call('GET', '/api/chat/conversations', { tok: tAna });
    let rListaBeto = await call('GET', '/api/chat/conversations', { tok: tBeto });
    check('conversación no aparece en listado tras bloqueo', (() => {
      const enAna = rListaAna.data?.conversations?.some(c => c.id === chatId);
      const enBeto = rListaBeto.data?.conversations?.some(c => c.id === chatId);
      return !enAna && !enBeto;
    })());

  } finally {
    await cleanup();
  }
  return results;
};
