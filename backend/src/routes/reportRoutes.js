// Reportar contenido y cuentas (HU-SEG-002).
//
// Reportar es un acto de la comunidad, no de la moderación: cualquier persona
// con sesión puede hacerlo, y quien reporta nunca se revela — ni a la persona
// reportada ni en la cola. Solo el equipo de moderación ve los reportes.
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const prisma = require('../lib/prisma');
const { requireAuth } = require('../middlewares/requireAuth');
const { esMotivoValido, esObjetivoValido, OBJETIVOS, MOTIVOS } = require('../lib/moderation');
const { log } = require('../lib/logger');

const MAX_DETALLE = 500;

// Anti-abuso: reportar en ráfaga es una forma de acoso (inundar la cola de
// alguien) y de ruido para la moderación.
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Has enviado muchos reportes en poco tiempo. Intenta más tarde.' }
});

// GET /api/reports/motivos — catálogo para pintar el formulario
router.get('/motivos', (req, res) => res.json({ motivos: MOTIVOS }));

// POST /api/reports { targetType, targetId, reason, detail? }
router.post('/', requireAuth, reportLimiter, async (req, res) => {
  const { targetType, reason } = req.body;
  const targetId = Number(req.body.targetId);
  const detail = typeof req.body.detail === 'string' ? req.body.detail.trim() : '';

  if (!esObjetivoValido(targetType)) {
    return res.status(400).json({ error: 'Tipo de contenido no reportable' });
  }
  if (!targetId) return res.status(400).json({ error: 'targetId requerido' });
  if (!esMotivoValido(reason)) {
    return res.status(400).json({ error: `Motivo inválido. Usa: ${MOTIVOS.join(', ')}` });
  }
  if (detail.length > MAX_DETALLE) {
    return res.status(400).json({ error: `El detalle no puede superar ${MAX_DETALLE} caracteres` });
  }

  const { campo, modelo, autor } = OBJETIVOS[targetType];

  try {
    // El objeto tiene que existir. La columna del autor cambia por tipo: un
    // subforo responde por creatorId y una cuenta por sí misma.
    const objetivo = await prisma[modelo].findUnique({
      where: { id: targetId },
      select: { id: true, ...(autor ? { [autor]: true } : {}) }
    });
    if (!objetivo) return res.status(404).json({ error: 'No se encontró lo que intentas reportar' });

    // Reportarse a uno mismo no tiene sentido y ensucia la cola
    const propio = autor ? objetivo[autor] === req.user.id : targetId === req.user.id;
    if (propio) return res.status(400).json({ error: 'No puedes reportar tu propio contenido' });

    // Idempotente: reportar dos veces lo mismo no duplica la cola. Se actualiza
    // el motivo por si la persona se equivocó al elegirlo.
    const existente = await prisma.report.findFirst({
      where: { reporterId: req.user.id, [campo]: targetId },
      select: { id: true, status: true }
    });
    if (existente) {
      if (existente.status === 'PENDIENTE') {
        await prisma.report.update({
          where: { id: existente.id },
          data: { reason, detail: detail || null }
        });
      }
      return res.json({ reported: true, duplicado: true });
    }

    await prisma.report.create({
      data: {
        reporterId: req.user.id,
        targetType,
        reason,
        detail: detail || null,
        [campo]: targetId
      }
    });
    log('reporte_creado', { targetType, targetId, reason, requestId: req.id });
    res.json({ reported: true, duplicado: false });
  } catch (e) {
    console.error('Error al crear el reporte:', e);
    res.status(500).json({ error: 'No se pudo enviar el reporte' });
  }
});

// GET /api/reports/mine — mis reportes y en qué acabaron.
// Se devuelve el estado pero NUNCA quién lo resolvió.
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const reports = await prisma.report.findMany({
      where: { reporterId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, targetType: true, reason: true, status: true,
        createdAt: true, resolvedAt: true
      }
    });
    res.json({ reports });
  } catch (e) {
    console.error('Error al listar mis reportes:', e);
    res.status(500).json({ error: 'Error al obtener tus reportes' });
  }
});

module.exports = router;
