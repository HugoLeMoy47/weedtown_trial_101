// Panel de moderación y gestión de la red (HU-SEG-003 y HU-SEG-005).
//
// El portón vive AQUÍ, no en el punto de montaje: así la protección viaja con el
// router y no depende de que quien lo monte se acuerde de añadir middlewares.
//
// Principios que sigue todo este archivo:
//   · Ocultar es reversible y queda en la bitácora. No hay borrado definitivo.
//   · A la persona moderada se le avisa con el motivo, nunca con quién reportó.
//   · Quien reporta jamás aparece en la cola.
const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const storage = require('../lib/storage');
const mailer = require('../lib/mailer');
const { requireAuth, requireRole } = require('../middlewares/requireAuth');
const {
  MOTIVOS, MOTIVO_TEXTO, OBJETIVOS, OCULTABLES,
  esMotivoValido, registrar, avisar
} = require('../lib/moderation');
const {
  DIAS_PERMITIDOS, obtenerIndicadores, obtenerCargaModeracion, recortarCargaPorRol
} = require('../lib/indicadores');

// Sesión válida + rol de moderación para TODA la superficie de admin
router.use(requireAuth, requireRole('MOD', 'ADMIN'));

const PAGE_SIZE = 20;
const MAX_NOTA = 500;
const MAX_DIAS_SUSPENSION = 365;

const autorPublico = { select: { id: true, name: true, displayName: true, avatar: true, handle: true } };

// ---------- Cola de revisión ----------

// El contenido reportado viaja con el reporte para que moderar no exija abrir
// otra pantalla. Quien reportó NO se incluye: la cola nunca lo revela.
const reporteInclude = {
  post: { select: { id: true, content: true, image: true, createdAt: true, hiddenAt: true, author: autorPublico } },
  comment: { select: { id: true, content: true, image: true, createdAt: true, hiddenAt: true, postId: true, author: autorPublico } },
  forumPost: { select: { id: true, title: true, content: true, image: true, createdAt: true, hiddenAt: true, author: autorPublico, subforum: { select: { slug: true, name: true } } } },
  forumComment: { select: { id: true, content: true, image: true, createdAt: true, hiddenAt: true, postId: true, author: autorPublico } },
  targetUser: { select: { id: true, name: true, displayName: true, avatar: true, handle: true, bio: true, createdAt: true, suspendedUntil: true } },
  subforum: { select: { id: true, name: true, slug: true, description: true, archivedAt: true, creator: autorPublico } }
};

// De un reporte al objeto reportado y su autor (para el historial y el aviso)
function objetivoDelReporte(r) {
  switch (r.targetType) {
    case 'POST': return { obj: r.post, autor: r.post?.author, id: r.postId };
    case 'COMMENT': return { obj: r.comment, autor: r.comment?.author, id: r.commentId };
    case 'FORUM_POST': return { obj: r.forumPost, autor: r.forumPost?.author, id: r.forumPostId };
    case 'FORUM_COMMENT': return { obj: r.forumComment, autor: r.forumComment?.author, id: r.forumCommentId };
    case 'USER': return { obj: r.targetUser, autor: r.targetUser, id: r.targetUserId };
    case 'SUBFORUM': return { obj: r.subforum, autor: r.subforum?.creator, id: r.subforumId };
    default: return { obj: null, autor: null, id: null };
  }
}

// GET /api/admin/reports?status=PENDIENTE&reason=&page=1
router.get('/reports', async (req, res) => {
  const status = ['PENDIENTE', 'ACCIONADO', 'DESCARTADO'].includes(req.query.status)
    ? req.query.status : 'PENDIENTE';
  const reason = esMotivoValido(req.query.reason) ? req.query.reason : null;
  const page = Math.max(1, parseInt(req.query.page) || 1);

  try {
    const where = { status, ...(reason && { reason }) };
    const [reportes, total] = await Promise.all([
      prisma.report.findMany({
        where,
        orderBy: { createdAt: 'asc' }, // lo más viejo primero: nadie se queda esperando
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: reporteInclude
      }),
      prisma.report.count({ where })
    ]);

    // Historial de la cuenta señalada: cuántas veces la han reportado y si ya
    // fue moderada. Es el contexto que separa un incidente de un patrón.
    const autores = [...new Set(reportes.map(r => objetivoDelReporte(r).autor?.id).filter(Boolean))];
    const conteoPorAutor = await Promise.all(autores.map(async (id) => ({
      id,
      reportes: await prisma.report.count({
        where: {
          OR: [
            { targetUserId: id },
            { post: { authorId: id } },
            { comment: { authorId: id } },
            { forumPost: { authorId: id } },
            { forumComment: { authorId: id } }
          ]
        }
      }),
      acciones: await prisma.moderationAction.count({
        where: { type: { in: ['OCULTAR', 'SUSPENDER'] }, targetType: 'USER', targetId: id }
      })
    })));
    const porAutor = new Map(conteoPorAutor.map(c => [c.id, c]));

    const serializados = reportes.map(r => {
      const { obj, autor, id } = objetivoDelReporte(r);
      return {
        id: r.id,
        targetType: r.targetType,
        targetId: id,
        reason: r.reason,
        reasonText: MOTIVO_TEXTO[r.reason],
        detail: r.detail,
        status: r.status,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
        resolution: r.resolution,
        contenido: obj || null,       // null = el contenido ya no existe
        autor: autor || null,
        historialAutor: autor ? porAutor.get(autor.id) || null : null
      };
    });

    res.json({ reports: serializados, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total });
  } catch (e) {
    console.error('Error al listar la cola de moderación:', e);
    res.status(500).json({ error: 'Error al obtener la cola' });
  }
});

// Marca como ACCIONADO todos los reportes pendientes que apuntan a un objeto:
// actuar sobre el contenido resuelve la cola sin que el MOD lo haga a mano.
async function resolverReportesDe(targetType, targetId, moderatorId, resolution) {
  const { campo } = OBJETIVOS[targetType];
  await prisma.report.updateMany({
    where: { [campo]: targetId, status: 'PENDIENTE' },
    data: { status: 'ACCIONADO', resolvedById: moderatorId, resolvedAt: new Date(), resolution }
  });
}

// POST /api/admin/reports/:id/descartar { note? } — el reporte no procede
router.post('/reports/:id/descartar', async (req, res) => {
  const id = Number(req.params.id);
  const note = (req.body?.note || '').trim().slice(0, MAX_NOTA) || null;
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const reporte = await prisma.report.findUnique({
      where: { id },
      select: {
        id: true, status: true, targetType: true,
        postId: true, commentId: true, forumPostId: true,
        forumCommentId: true, targetUserId: true, subforumId: true
      }
    });
    if (!reporte) return res.status(404).json({ error: 'Reporte no encontrado' });
    if (reporte.status !== 'PENDIENTE') {
      return res.status(409).json({ error: 'Ese reporte ya estaba resuelto' });
    }
    await prisma.report.update({
      where: { id },
      data: { status: 'DESCARTADO', resolvedById: req.user.id, resolvedAt: new Date(), resolution: note }
    });
    // La bitácora apunta al objeto reportado, no al id del reporte: así el
    // historial de una cuenta incluye también los reportes que no procedieron.
    await registrar({
      moderatorId: req.user.id, type: 'DESCARTAR_REPORTE',
      targetType: reporte.targetType,
      targetId: reporte[OBJETIVOS[reporte.targetType].campo],
      note
    });
    res.json({ ok: true, status: 'DESCARTADO' });
  } catch (e) {
    console.error('Error al descartar el reporte:', e);
    res.status(500).json({ error: 'No se pudo descartar el reporte' });
  }
});

// ---------- Ocultar y mostrar contenido ----------

const MODELO_POR_TIPO = {
  POST: 'post',
  COMMENT: 'comment',
  FORUM_POST: 'forumPost',
  FORUM_COMMENT: 'forumComment'
};

// POST /api/admin/content/:type/:id/ocultar { reason, note? }
router.post('/content/:type/:id/ocultar', async (req, res) => {
  const type = String(req.params.type).toUpperCase();
  const id = Number(req.params.id);
  const { reason } = req.body || {};
  const note = (req.body?.note || '').trim().slice(0, MAX_NOTA) || null;

  if (!OCULTABLES.includes(type)) return res.status(400).json({ error: 'Ese tipo de contenido no se puede ocultar' });
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  if (!esMotivoValido(reason)) return res.status(400).json({ error: `Motivo inválido. Usa: ${MOTIVOS.join(', ')}` });

  const modelo = MODELO_POR_TIPO[type];
  try {
    const actual = await prisma[modelo].findUnique({ where: { id }, select: { id: true, authorId: true, hiddenAt: true } });
    if (!actual) return res.status(404).json({ error: 'Contenido no encontrado' });
    if (actual.hiddenAt) return res.status(409).json({ error: 'Ese contenido ya estaba oculto' });

    await prisma[modelo].update({
      where: { id },
      data: { hiddenAt: new Date(), hiddenById: req.user.id, hiddenReason: reason }
    });

    await resolverReportesDe(type, id, req.user.id, note);
    await registrar({ moderatorId: req.user.id, type: 'OCULTAR', targetType: type, targetId: id, reason, note });
    await avisar({
      recipientId: actual.authorId,
      moderatorId: req.user.id,
      type: 'CONTENIDO_OCULTO',
      reason
    });

    res.json({ ok: true, hidden: true });
  } catch (e) {
    console.error('Error al ocultar contenido:', e);
    res.status(500).json({ error: 'No se pudo ocultar el contenido' });
  }
});

// POST /api/admin/content/:type/:id/mostrar — revertir
router.post('/content/:type/:id/mostrar', async (req, res) => {
  const type = String(req.params.type).toUpperCase();
  const id = Number(req.params.id);
  const note = (req.body?.note || '').trim().slice(0, MAX_NOTA) || null;

  if (!OCULTABLES.includes(type)) return res.status(400).json({ error: 'Tipo de contenido inválido' });
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  const modelo = MODELO_POR_TIPO[type];
  try {
    const actual = await prisma[modelo].findUnique({ where: { id }, select: { id: true, hiddenAt: true } });
    if (!actual) return res.status(404).json({ error: 'Contenido no encontrado' });
    if (!actual.hiddenAt) return res.status(409).json({ error: 'Ese contenido no estaba oculto' });

    await prisma[modelo].update({
      where: { id },
      data: { hiddenAt: null, hiddenById: null, hiddenReason: null }
    });
    await registrar({ moderatorId: req.user.id, type: 'MOSTRAR', targetType: type, targetId: id, note });
    res.json({ ok: true, hidden: false });
  } catch (e) {
    console.error('Error al mostrar contenido:', e);
    res.status(500).json({ error: 'No se pudo restaurar el contenido' });
  }
});

// ---------- Suspender cuentas ----------

// POST /api/admin/users/:id/suspender { days, reason, note? }
router.post('/users/:id/suspender', async (req, res) => {
  const id = Number(req.params.id);
  const days = Number(req.body?.days);
  const { reason } = req.body || {};
  const note = (req.body?.note || '').trim().slice(0, MAX_NOTA) || null;

  if (!id) return res.status(400).json({ error: 'ID inválido' });
  if (!Number.isInteger(days) || days < 1 || days > MAX_DIAS_SUSPENSION) {
    return res.status(400).json({ error: `La suspensión debe ser de 1 a ${MAX_DIAS_SUSPENSION} días` });
  }
  if (!esMotivoValido(reason)) return res.status(400).json({ error: `Motivo inválido. Usa: ${MOTIVOS.join(', ')}` });
  if (id === req.user.id) return res.status(400).json({ error: 'No puedes suspenderte a ti' });

  try {
    const objetivo = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!objetivo) return res.status(404).json({ error: 'Usuario no encontrado' });
    // Un MOD no puede suspender a otro MOD ni a un ADMIN: eso lo decide un ADMIN
    if (objetivo.role !== 'USER' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Solo un ADMIN puede suspender a una cuenta con rol' });
    }

    const hasta = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await prisma.user.update({
      where: { id },
      data: { suspendedUntil: hasta, suspendedById: req.user.id, suspendedReason: reason }
    });

    await resolverReportesDe('USER', id, req.user.id, note);
    await registrar({ moderatorId: req.user.id, type: 'SUSPENDER', targetType: 'USER', targetId: id, reason, note });
    await avisar({ recipientId: id, moderatorId: req.user.id, type: 'CUENTA_SUSPENDIDA', reason });

    res.json({ ok: true, suspendedUntil: hasta });
  } catch (e) {
    console.error('Error al suspender la cuenta:', e);
    res.status(500).json({ error: 'No se pudo suspender la cuenta' });
  }
});

// POST /api/admin/users/:id/levantar — quitar la suspensión antes de tiempo
router.post('/users/:id/levantar', async (req, res) => {
  const id = Number(req.params.id);
  const note = (req.body?.note || '').trim().slice(0, MAX_NOTA) || null;
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const objetivo = await prisma.user.findUnique({ where: { id }, select: { id: true, suspendedUntil: true } });
    if (!objetivo) return res.status(404).json({ error: 'Usuario no encontrado' });
    await prisma.user.update({
      where: { id },
      data: { suspendedUntil: null, suspendedById: null, suspendedReason: null }
    });
    await registrar({ moderatorId: req.user.id, type: 'LEVANTAR_SUSPENSION', targetType: 'USER', targetId: id, note });
    res.json({ ok: true, suspendedUntil: null });
  } catch (e) {
    console.error('Error al levantar la suspensión:', e);
    res.status(500).json({ error: 'No se pudo levantar la suspensión' });
  }
});

// ---------- Gestión de subforos ----------

// POST /api/admin/subforums/:id/archivar — solo lectura: no admite posts nuevos
router.post('/subforums/:id/archivar', async (req, res) => {
  const id = Number(req.params.id);
  const note = (req.body?.note || '').trim().slice(0, MAX_NOTA) || null;
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const sub = await prisma.subForum.findUnique({ where: { id }, select: { id: true, archivedAt: true } });
    if (!sub) return res.status(404).json({ error: 'Subforo no encontrado' });
    if (sub.archivedAt) return res.status(409).json({ error: 'Ese subforo ya estaba archivado' });

    await prisma.subForum.update({
      where: { id },
      data: { archivedAt: new Date(), archivedById: req.user.id }
    });
    await resolverReportesDe('SUBFORUM', id, req.user.id, note);
    await registrar({ moderatorId: req.user.id, type: 'ARCHIVAR_SUBFORO', targetType: 'SUBFORUM', targetId: id, note });
    res.json({ ok: true, archived: true });
  } catch (e) {
    console.error('Error al archivar el subforo:', e);
    res.status(500).json({ error: 'No se pudo archivar el subforo' });
  }
});

// POST /api/admin/subforums/:id/restaurar
router.post('/subforums/:id/restaurar', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const sub = await prisma.subForum.findUnique({ where: { id }, select: { id: true, archivedAt: true } });
    if (!sub) return res.status(404).json({ error: 'Subforo no encontrado' });
    if (!sub.archivedAt) return res.status(409).json({ error: 'Ese subforo no estaba archivado' });

    await prisma.subForum.update({ where: { id }, data: { archivedAt: null, archivedById: null } });
    await registrar({ moderatorId: req.user.id, type: 'RESTAURAR_SUBFORO', targetType: 'SUBFORUM', targetId: id });
    res.json({ ok: true, archived: false });
  } catch (e) {
    console.error('Error al restaurar el subforo:', e);
    res.status(500).json({ error: 'No se pudo restaurar el subforo' });
  }
});

// PUT /api/admin/subforums/:id { name?, description? } — renombrar.
// El slug NO cambia: los enlaces que la comunidad ya compartió siguen sirviendo.
router.put('/subforums/:id', async (req, res) => {
  const id = Number(req.params.id);
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
  const description = req.body?.description !== undefined
    ? (String(req.body.description).trim() || null) : undefined;

  if (!id) return res.status(400).json({ error: 'ID inválido' });
  if (name !== undefined && (name.length < 3 || name.length > 40)) {
    return res.status(400).json({ error: 'El nombre debe tener entre 3 y 40 caracteres' });
  }
  if (description && description.length > 300) {
    return res.status(400).json({ error: 'La descripción no puede superar 300 caracteres' });
  }
  try {
    const sub = await prisma.subForum.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!sub) return res.status(404).json({ error: 'Subforo no encontrado' });
    if (name && name !== sub.name) {
      const choca = await prisma.subForum.findFirst({ where: { name, id: { not: id } }, select: { id: true } });
      if (choca) return res.status(409).json({ error: 'Ya existe un subforo con ese nombre' });
    }

    const actualizado = await prisma.subForum.update({
      where: { id },
      data: { ...(name !== undefined && { name }), ...(description !== undefined && { description }) },
      select: { id: true, name: true, slug: true, description: true, archivedAt: true }
    });
    await registrar({
      moderatorId: req.user.id, type: 'RENOMBRAR_SUBFORO', targetType: 'SUBFORUM', targetId: id,
      note: name && name !== sub.name ? `"${sub.name}" → "${name}"` : 'descripción'
    });
    res.json(actualizado);
  } catch (e) {
    console.error('Error al renombrar el subforo:', e);
    res.status(500).json({ error: 'No se pudo actualizar el subforo' });
  }
});

// ---------- Panorama y bitácora ----------

// GET /api/admin/stats — lo que necesita saber quien abre el panel
router.get('/stats', async (req, res) => {
  try {
    const [pendientes, accionados, descartados, suspendidos, ocultosFeed, ocultosForo, subforosArchivados, usuarios] =
      await Promise.all([
        prisma.report.count({ where: { status: 'PENDIENTE' } }),
        prisma.report.count({ where: { status: 'ACCIONADO' } }),
        prisma.report.count({ where: { status: 'DESCARTADO' } }),
        prisma.user.count({ where: { suspendedUntil: { gt: new Date() } } }),
        prisma.post.count({ where: { hiddenAt: { not: null } } }),
        prisma.forumPost.count({ where: { hiddenAt: { not: null } } }),
        prisma.subForum.count({ where: { archivedAt: { not: null } } }),
        prisma.user.count()
      ]);
    res.json({
      reportes: { pendientes, accionados, descartados },
      suspendidos,
      ocultos: { feed: ocultosFeed, foro: ocultosForo },
      subforosArchivados,
      usuarios
    });
  } catch (e) {
    console.error('Error al obtener las estadísticas:', e);
    res.status(500).json({ error: 'Error al obtener las estadísticas' });
  }
});

// `req.query.dias` contra la lista blanca. Sin valor → default 30. Con
// cualquier valor presente que no sea EXACTAMENTE uno de los permitidos →
// inválido — incluida entrada no numérica ("DROP TABLE...", etc.), que
// `Number()` convierte a NaN y que un `Number(x) || 30` de un solo paso
// dejaría pasar en silencio como si fuera el default, en vez de rechazarla.
function diasValidados(query) {
  if (query === undefined) return 30;
  const n = Number(query);
  return DIAS_PERMITIDOS.includes(n) ? n : null;
}

// GET /api/admin/indicadores?dias=30 — panóptico (HU-PAN-001/004).
//
// Solo ADMIN, a propósito (Trampa 4 del ciclo 6): esto no va en /stats, que es
// MOD y hoy es rápido — meter aquí diez consultas agregadas lo volvería lento
// y expondría tendencias de toda la red a todo el equipo de moderación.
router.get('/indicadores', requireRole('ADMIN'), async (req, res) => {
  const dias = diasValidados(req.query.dias);
  if (dias === null) {
    return res.status(400).json({ error: `dias debe ser uno de: ${DIAS_PERMITIDOS.join(', ')}` });
  }
  try {
    const datos = await obtenerIndicadores(dias);
    res.json(datos);
  } catch (e) {
    console.error('Error al calcular los indicadores:', e);
    res.status(500).json({ error: 'No se pudieron calcular los indicadores' });
  }
});

// GET /api/admin/indicadores/carga-moderacion?dias=30 — la única pieza del
// panóptico que SÍ ve un MOD (hereda el requireRole('MOD','ADMIN') del
// router, arriba). El recorte por rol pasa en el servidor (recortarCargaPorRol),
// nunca ocultando en el cliente: un MOD solo recibe su propio número y el
// promedio del equipo, nunca el desglose por persona — eso es ADMIN.
router.get('/indicadores/carga-moderacion', async (req, res) => {
  const dias = diasValidados(req.query.dias);
  if (dias === null) {
    return res.status(400).json({ error: `dias debe ser uno de: ${DIAS_PERMITIDOS.join(', ')}` });
  }
  try {
    const carga = await obtenerCargaModeracion(dias);
    res.json(recortarCargaPorRol(carga, req.user));
  } catch (e) {
    console.error('Error al calcular la carga de moderación:', e);
    res.status(500).json({ error: 'No se pudo calcular la carga de moderación' });
  }
});

// GET /api/admin/salud-tecnica — HU-PAN-003: lo que /health YA reporta,
// re-expuesto dentro de /admin (ADMIN, a diferencia de /health que es
// público) más el enlace a observabilidad externa. No persiste nada en
// Postgres — historial de errores/latencia/uptime es infraestructura, se
// resuelve conectando un log drain al servicio externo, no aquí.
router.get('/salud-tecnica', requireRole('ADMIN'), async (req, res) => {
  const estado = {
    db: 'ok',
    storage: storage.driver,
    mailer: mailer.driver,
    uptimeSegundos: Math.round(process.uptime()),
    observabilityUrl: process.env.OBSERVABILITY_URL || null
  };
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    estado.db = 'error';
  }
  res.json(estado);
});

// GET /api/admin/log?page=1 — bitácora. Es lo que hace auditable al panel:
// aquí sí se ve qué moderador hizo qué, porque es de consumo interno.
router.get('/log', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  try {
    const [acciones, total] = await Promise.all([
      prisma.moderationAction.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { moderator: autorPublico }
      }),
      prisma.moderationAction.count()
    ]);
    res.json({ acciones, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total });
  } catch (e) {
    console.error('Error al obtener la bitácora:', e);
    res.status(500).json({ error: 'Error al obtener la bitácora' });
  }
});

// ---------- Roles (solo ADMIN) ----------

// PUT /api/admin/users/:id/rol { role } — el primer ADMIN se crea con el script
// `npm run rol` del backend; de ahí en adelante se gestiona desde aquí.
router.put('/users/:id/rol', requireRole('ADMIN'), async (req, res) => {
  const id = Number(req.params.id);
  const { role } = req.body || {};
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  if (!['USER', 'MOD', 'ADMIN'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido. Usa USER, MOD o ADMIN' });
  }
  if (id === req.user.id) return res.status(400).json({ error: 'No puedes cambiar tu propio rol' });
  try {
    const objetivo = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!objetivo) return res.status(404).json({ error: 'Usuario no encontrado' });
    const actualizado = await prisma.user.update({
      where: { id }, data: { role },
      select: { id: true, name: true, handle: true, role: true }
    });
    res.json(actualizado);
  } catch (e) {
    console.error('Error al cambiar el rol:', e);
    res.status(500).json({ error: 'No se pudo cambiar el rol' });
  }
});

// GET /api/admin/users?q= — buscar cuentas para moderar
router.get('/users', async (req, res) => {
  const q = (req.query.q || '').trim();
  try {
    const users = await prisma.user.findMany({
      where: q.length >= 2 ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
          { handle: { contains: q, mode: 'insensitive' } }
        ]
      } : { suspendedUntil: { gt: new Date() } },
      select: {
        id: true, name: true, displayName: true, avatar: true, handle: true,
        role: true, suspendedUntil: true, suspendedReason: true, createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 25
    });
    res.json({ users });
  } catch (e) {
    console.error('Error al buscar cuentas:', e);
    res.status(500).json({ error: 'Error al buscar cuentas' });
  }
});

module.exports = router;
