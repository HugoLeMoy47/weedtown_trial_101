// Amistad entre personas (HU-AMI-001). Solicitud + aceptación mutua y
// simétrica — no hay una tabla de "conocidos": esa etiqueta se deriva
// (cualquier persona visible que no es amigo ni bloqueado).
const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const { requireAuth, requireEstablished } = require('../middlewares/requireAuth');
const { isBlockedBetween } = require('../lib/blocks');
const { findRequestBetween } = require('../lib/friends');
const { log } = require('../lib/logger');

const publicSelect = { id: true, handle: true, displayName: true, name: true, avatar: true };

// POST /api/friends/request/:userId — enviar solicitud (o aceptarla de una vez
// si la otra persona ya te la había mandado a ti: pedirle lo mismo que ella ya
// te ofreció no debería quedar en un candado esperando que alguien más mueva).
//
// requireEstablished: mandar una solicitud es contacto directo hacia una
// persona concreta, mismo criterio que el toque de Cerca y abrir un chat
// nuevo (HU-SEG-006) — una cuenta recién creada no puede usarlo todavía.
router.post('/request/:userId', requireAuth, requireEstablished, async (req, res) => {
  const targetId = Number(req.params.userId);
  if (!targetId) return res.status(400).json({ error: 'userId inválido' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'No puedes agregarte a ti mismo' });
  try {
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: publicSelect });
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (await isBlockedBetween(req.user.id, targetId)) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const existente = await findRequestBetween(req.user.id, targetId);

    if (existente?.status === 'ACCEPTED') {
      return res.status(409).json({ error: 'Ya son amigos' });
    }

    if (existente?.status === 'PENDING') {
      if (existente.requesterId === req.user.id) {
        return res.status(409).json({ error: 'Ya le mandaste una solicitud' });
      }
      // La otra persona ya te la había mandado a ti: aceptarla en vez de
      // dejar dos solicitudes cruzadas sin resolver.
      const aceptada = await prisma.friendRequest.update({
        where: { id: existente.id },
        data: { status: 'ACCEPTED', respondedAt: new Date() }
      });
      await prisma.notification.create({
        data: { type: 'FRIEND_ACCEPTED', recipientId: existente.requesterId, actorId: req.user.id }
      });
      log('amistad_aceptada', { por: 'solicitud_cruzada', a: req.user.id, b: targetId, requestId: req.id });
      return res.json({ status: 'accepted', friendRequest: aceptada, user: target });
    }

    // Sin fila previa, o una anterior RECHAZADA en esta misma dirección
    // (el @@unique es por dirección: se reintenta con un upsert en vez de un
    // create, que chocaría contra esa fila vieja).
    const solicitud = await prisma.friendRequest.upsert({
      where: { requesterId_addresseeId: { requesterId: req.user.id, addresseeId: targetId } },
      update: { status: 'PENDING', respondedAt: null },
      create: { requesterId: req.user.id, addresseeId: targetId }
    });
    await prisma.notification.create({
      data: { type: 'FRIEND_REQUEST', recipientId: targetId, actorId: req.user.id }
    });
    log('amistad_solicitada', { requesterId: req.user.id, addresseeId: targetId, requestId: req.id });
    res.json({ status: 'pending', friendRequest: solicitud, user: target });
  } catch (e) {
    console.error('Error al enviar solicitud de amistad:', e);
    res.status(500).json({ error: 'No se pudo enviar la solicitud' });
  }
});

// POST /api/friends/accept/:requestId — aceptar una solicitud que ME mandaron
router.post('/accept/:requestId', requireAuth, async (req, res) => {
  const id = Number(req.params.requestId);
  if (!id) return res.status(400).json({ error: 'ID de solicitud inválido' });
  try {
    const solicitud = await prisma.friendRequest.findUnique({ where: { id } });
    if (!solicitud || solicitud.addresseeId !== req.user.id) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }
    if (solicitud.status !== 'PENDING') {
      return res.status(409).json({ error: 'Esta solicitud ya no está pendiente' });
    }
    const aceptada = await prisma.friendRequest.update({
      where: { id },
      data: { status: 'ACCEPTED', respondedAt: new Date() }
    });
    await prisma.notification.create({
      data: { type: 'FRIEND_ACCEPTED', recipientId: solicitud.requesterId, actorId: req.user.id }
    });
    log('amistad_aceptada', { por: 'aceptar_directo', a: solicitud.requesterId, b: req.user.id, requestId: req.id });
    res.json({ status: 'accepted', friendRequest: aceptada });
  } catch (e) {
    console.error('Error al aceptar solicitud de amistad:', e);
    res.status(500).json({ error: 'No se pudo aceptar la solicitud' });
  }
});

// POST /api/friends/reject/:requestId — rechazar una solicitud que ME mandaron.
// Sin notificación de vuelta: rechazar en silencio es más amable que mandar un
// aviso de rechazo, mismo espíritu que el resto de las acciones de discreción.
router.post('/reject/:requestId', requireAuth, async (req, res) => {
  const id = Number(req.params.requestId);
  if (!id) return res.status(400).json({ error: 'ID de solicitud inválido' });
  try {
    const solicitud = await prisma.friendRequest.findUnique({ where: { id } });
    if (!solicitud || solicitud.addresseeId !== req.user.id) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }
    if (solicitud.status !== 'PENDING') {
      return res.status(409).json({ error: 'Esta solicitud ya no está pendiente' });
    }
    await prisma.friendRequest.update({
      where: { id },
      data: { status: 'REJECTED', respondedAt: new Date() }
    });
    res.json({ status: 'rejected' });
  } catch (e) {
    console.error('Error al rechazar solicitud de amistad:', e);
    res.status(500).json({ error: 'No se pudo rechazar la solicitud' });
  }
});

// DELETE /api/friends/:userId — deshace la amistad, o cancela cualquier
// solicitud propia pendiente con esa persona. Idempotente: si no había nada,
// igual responde 200 (nada que deshacer no es un error).
router.delete('/:userId', requireAuth, async (req, res) => {
  const targetId = Number(req.params.userId);
  if (!targetId) return res.status(400).json({ error: 'userId inválido' });
  try {
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { requesterId: req.user.id, addresseeId: targetId },
          { requesterId: targetId, addresseeId: req.user.id }
        ]
      }
    });
    res.json({ status: 'none', userId: targetId });
  } catch (e) {
    console.error('Error al deshacer la amistad:', e);
    res.status(500).json({ error: 'No se pudo deshacer la amistad' });
  }
});

// GET /api/friends — mis amigos
router.get('/', requireAuth, async (req, res) => {
  try {
    const filas = await prisma.friendRequest.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: req.user.id }, { addresseeId: req.user.id }] },
      orderBy: { respondedAt: 'desc' },
      include: {
        requester: { select: publicSelect },
        addressee: { select: publicSelect }
      }
    });
    const amigos = filas.map(f => ({
      user: f.requesterId === req.user.id ? f.addressee : f.requester,
      amigosDesde: f.respondedAt
    }));
    res.json({ friends: amigos });
  } catch (e) {
    console.error('Error al listar amigos:', e);
    res.status(500).json({ error: 'Error al obtener tus amigos' });
  }
});

// GET /api/friends/requests — solicitudes pendientes, recibidas y enviadas
router.get('/requests', requireAuth, async (req, res) => {
  try {
    const [recibidas, enviadas] = await Promise.all([
      prisma.friendRequest.findMany({
        where: { addresseeId: req.user.id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        include: { requester: { select: publicSelect } }
      }),
      prisma.friendRequest.findMany({
        where: { requesterId: req.user.id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        include: { addressee: { select: publicSelect } }
      })
    ]);
    res.json({
      recibidas: recibidas.map(r => ({ id: r.id, user: r.requester, createdAt: r.createdAt })),
      enviadas: enviadas.map(r => ({ id: r.id, user: r.addressee, createdAt: r.createdAt }))
    });
  } catch (e) {
    console.error('Error al listar solicitudes de amistad:', e);
    res.status(500).json({ error: 'Error al obtener tus solicitudes' });
  }
});

module.exports = router;
