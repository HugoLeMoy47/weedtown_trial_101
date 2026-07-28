// Reportes y cola de moderación (HU-SEG-002 y HU-SEG-005).
//
// Cubre las cuatro decisiones de producto que definen esta función:
//   1. Ocultar es reversible y el contenido sigue existiendo.
//   2. Se avisa a la persona moderada con el motivo, sin revelar al moderador
//      ni a quien reportó.
//   3. Suspender frena la escritura pero no la lectura, y caduca sola.
//   4. El chat privado no es reportable.
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Moderación', 'wtmod');

  await cleanup();
  try {
    const ana = await mkUser('ana');          // reporta
    const beto = await mkUser('beto');        // publica lo reportado
    const mod = await mkUser('mod', { role: 'MOD' });
    const mod2 = await mkUser('mod2', { role: 'MOD' });
    const admin = await mkUser('admin', { role: 'ADMIN' });
    const tAna = token(ana.id), tBeto = token(beto.id), tMod = token(mod.id), tAdmin = token(admin.id);

    const post = await prisma.post.create({ data: { content: 'wtmod post de beto', authorId: beto.id } });

    console.log('\n  — Reportar —');
    let r = await call('POST', '/api/reports', { tok: tAna, body: { targetType: 'POST', targetId: post.id, reason: 'ACOSO', detail: 'me insultó' } });
    check('cualquiera con sesión puede reportar → 200', r.status === 200, `(fue ${r.status})`);

    r = await call('POST', '/api/reports', { tok: tAna, body: { targetType: 'POST', targetId: post.id, reason: 'SPAM' } });
    check('reportar dos veces no duplica la cola', r.status === 200 && r.data.duplicado === true);
    const cuantos = await prisma.report.count({ where: { postId: post.id } });
    check('sigue habiendo un solo reporte', cuantos === 1, `(hay ${cuantos})`);

    r = await call('POST', '/api/reports', { tok: tBeto, body: { targetType: 'POST', targetId: post.id, reason: 'SPAM' } });
    check('no puedes reportar tu propio contenido → 400', r.status === 400, `(fue ${r.status})`);

    r = await call('POST', '/api/reports', { tok: tAna, body: { targetType: 'CHAT', targetId: 1, reason: 'ACOSO' } });
    check('el chat privado NO es reportable → 400', r.status === 400, `(fue ${r.status})`);

    r = await call('POST', '/api/reports', { tok: tAna, body: { targetType: 'POST', targetId: post.id, reason: 'INVENTADO' } });
    check('un motivo fuera del catálogo → 400', r.status === 400, `(fue ${r.status})`);

    r = await call('POST', '/api/reports', { body: { targetType: 'POST', targetId: post.id, reason: 'SPAM' } });
    check('reportar sin sesión → 401', r.status === 401, `(fue ${r.status})`);

    console.log('\n  — La cola solo la ve la moderación —');
    r = await call('GET', '/api/admin/reports', { tok: tAna });
    check('un USER no ve la cola → 403', r.status === 403, `(fue ${r.status})`);
    r = await call('GET', '/api/admin/reports', { tok: tMod });
    check('un MOD sí la ve → 200', r.status === 200, `(fue ${r.status})`);

    const enCola = r.data.reports.find(x => x.targetId === post.id);
    check('el reporte aparece con su contenido en contexto', Boolean(enCola?.contenido?.content));
    check('la cola trae el motivo en texto legible', Boolean(enCola?.reasonText));
    check('la cola NO revela quién reportó',
      !JSON.stringify(enCola).includes('reporter') && !JSON.stringify(enCola).includes(String(ana.id)));

    console.log('\n  — Ocultar es reversible —');
    r = await call('POST', `/api/admin/content/POST/${post.id}/ocultar`, { tok: tMod, body: { reason: 'ACOSO', note: 'nota interna' } });
    check('el MOD oculta el contenido → 200', r.status === 200, `(fue ${r.status})`);

    const oculto = await prisma.post.findUnique({ where: { id: post.id }, select: { hiddenAt: true, hiddenById: true, content: true } });
    check('el contenido NO se borró: sigue en la base', oculto.content === 'wtmod post de beto');
    check('quedó registrado quién lo ocultó', oculto.hiddenById === mod.id);

    r = await call('GET', '/api/posts', { tok: tAna });
    check('desaparece del feed de la comunidad', !r.data.posts.some(p => p.id === post.id));
    r = await call('GET', '/api/posts', { tok: tBeto });
    check('desaparece también para su autor', !r.data.posts.some(p => p.id === post.id));
    r = await call('GET', '/api/posts/search?q=wtmod', { tok: tAna });
    check('tampoco sale en la búsqueda', !r.data.results.some(p => p.id === post.id));

    const reporteResuelto = await prisma.report.findFirst({ where: { postId: post.id } });
    check('actuar resuelve el reporte solo', reporteResuelto.status === 'ACCIONADO');
    check('queda registrado qué moderador lo resolvió', reporteResuelto.resolvedById === mod.id);

    const bitacora = await prisma.moderationAction.findFirst({ where: { type: 'OCULTAR', targetId: post.id } });
    check('la acción quedó en la bitácora', Boolean(bitacora) && bitacora.moderatorId === mod.id);

    console.log('\n  — Se avisa con el motivo, sin decir quién —');
    r = await call('GET', '/api/notifications', { tok: tBeto });
    const aviso = r.data.notifications.find(n => n.type === 'CONTENIDO_OCULTO');
    check('a su autor le llega la notificación', Boolean(aviso));
    check('la notificación lleva el motivo', aviso?.reason === 'ACOSO' && Boolean(aviso?.reasonText));
    check('la notificación NO revela al moderador', aviso?.actor === null);

    r = await call('POST', `/api/admin/content/POST/${post.id}/ocultar`, { tok: tMod, body: { reason: 'SPAM' } });
    check('ocultar lo ya oculto → 409', r.status === 409, `(fue ${r.status})`);

    r = await call('POST', `/api/admin/content/POST/${post.id}/mostrar`, { tok: tMod });
    check('el MOD lo restaura → 200', r.status === 200, `(fue ${r.status})`);
    r = await call('GET', '/api/posts', { tok: tAna });
    check('vuelve al feed', r.data.posts.some(p => p.id === post.id));

    console.log('\n  — Suspender frena escribir, no leer —');
    r = await call('POST', `/api/admin/users/${beto.id}/suspender`, { tok: tMod, body: { days: 7, reason: 'ACOSO' } });
    check('el MOD suspende → 200', r.status === 200, `(fue ${r.status})`);

    r = await call('POST', '/api/posts', { tok: tBeto, body: { content: 'intento publicar' } });
    check('la cuenta suspendida no puede publicar → 403', r.status === 403, `(fue ${r.status})`);
    check('el 403 explica hasta cuándo y por qué', Boolean(r.data?.suspendedUntil) && Boolean(r.data?.reasonText));

    r = await call('POST', `/api/posts/${post.id}/comment`, { tok: tBeto, body: { content: 'comento' } });
    check('tampoco puede comentar → 403', r.status === 403, `(fue ${r.status})`);
    r = await call('POST', '/api/chat/conversations', { tok: tBeto, body: { userId: ana.id } });
    check('tampoco puede abrir chat → 403', r.status === 403, `(fue ${r.status})`);

    r = await call('GET', '/api/posts', { tok: tBeto });
    check('pero SÍ puede seguir leyendo el feed → 200', r.status === 200, `(fue ${r.status})`);

    r = await call('GET', '/api/auth/me', { tok: tBeto });
    check('la sesión informa de la suspensión', Boolean(r.data.suspendedUntil) && r.data.suspendedReason === 'ACOSO');

    r = await call('POST', `/api/admin/users/${beto.id}/levantar`, { tok: tMod });
    check('el MOD la levanta → 200', r.status === 200, `(fue ${r.status})`);
    r = await call('POST', '/api/posts', { tok: tBeto, body: { content: 'wtmod ya puedo publicar' } });
    check('y vuelve a poder publicar → 200', r.status === 200, `(fue ${r.status})`);

    // Una suspensión vencida no debe frenar nada: caduca sola
    await prisma.user.update({
      where: { id: beto.id },
      data: { suspendedUntil: new Date(Date.now() - 1000), suspendedReason: 'SPAM' }
    });
    r = await call('POST', '/api/posts', { tok: tBeto, body: { content: 'wtmod tras vencer' } });
    check('una suspensión vencida ya no frena: caduca sola', r.status === 200, `(fue ${r.status})`);
    await prisma.user.update({ where: { id: beto.id }, data: { suspendedUntil: null, suspendedReason: null } });

    console.log('\n  — Jerarquía de roles —');
    r = await call('POST', `/api/admin/users/${mod.id}/suspender`, { tok: tMod, body: { days: 1, reason: 'SPAM' } });
    check('nadie puede suspenderse a sí mismo → 400', r.status === 400, `(fue ${r.status})`);
    r = await call('POST', `/api/admin/users/${mod2.id}/suspender`, { tok: tMod, body: { days: 1, reason: 'SPAM' } });
    check('un MOD no puede suspender a otro MOD → 403', r.status === 403, `(fue ${r.status})`);
    r = await call('POST', `/api/admin/users/${mod2.id}/suspender`, { tok: tAdmin, body: { days: 1, reason: 'SPAM' } });
    check('un ADMIN sí puede → 200', r.status === 200, `(fue ${r.status})`);
    await call('POST', `/api/admin/users/${mod2.id}/levantar`, { tok: tAdmin });

    r = await call('PUT', `/api/admin/users/${beto.id}/rol`, { tok: tMod, body: { role: 'MOD' } });
    check('un MOD no puede repartir roles → 403', r.status === 403, `(fue ${r.status})`);
    r = await call('PUT', `/api/admin/users/${beto.id}/rol`, { tok: tAdmin, body: { role: 'MOD' } });
    check('un ADMIN sí → 200', r.status === 200, `(fue ${r.status})`);
    await call('PUT', `/api/admin/users/${beto.id}/rol`, { tok: tAdmin, body: { role: 'USER' } });

    console.log('\n  — Subforos —');
    const sub = await prisma.subForum.create({ data: { name: 'wtmod zona', slug: 'wtmod-zona', creatorId: beto.id } });
    r = await call('POST', '/api/reports', { tok: tAna, body: { targetType: 'SUBFORUM', targetId: sub.id, reason: 'ILEGAL' } });
    check('se puede reportar un subforo → 200', r.status === 200, `(fue ${r.status})`);

    r = await call('POST', `/api/admin/subforums/${sub.id}/archivar`, { tok: tMod });
    check('el MOD lo archiva → 200', r.status === 200, `(fue ${r.status})`);
    r = await call('GET', '/api/forum/subforums', { tok: tAna });
    check('sale del directorio', !r.data.subforums.some(s => s.id === sub.id));
    r = await call('POST', `/api/forum/subforums/${sub.slug}/posts`, { tok: tAna, body: { title: 'intento', content: 'x' } });
    check('ya no admite posts nuevos → 403', r.status === 403, `(fue ${r.status})`);
    r = await call('GET', `/api/forum/subforums/${sub.slug}`, { tok: tAna });
    check('pero se sigue pudiendo leer → 200', r.status === 200, `(fue ${r.status})`);

    r = await call('PUT', `/api/admin/subforums/${sub.id}`, { tok: tMod, body: { name: 'wtmod renombrado' } });
    check('el MOD lo renombra → 200', r.status === 200, `(fue ${r.status})`);
    check('el slug NO cambia: los enlaces compartidos siguen sirviendo', r.data?.slug === 'wtmod-zona');

    r = await call('POST', `/api/admin/subforums/${sub.id}/restaurar`, { tok: tMod });
    check('y lo restaura → 200', r.status === 200, `(fue ${r.status})`);

    console.log('\n  — Descartar y trazabilidad —');
    const post2 = await prisma.post.create({ data: { content: 'wtmod segundo', authorId: beto.id } });
    await call('POST', '/api/reports', { tok: tAna, body: { targetType: 'POST', targetId: post2.id, reason: 'SPAM' } });
    const rep2 = await prisma.report.findFirst({ where: { postId: post2.id } });

    r = await call('POST', `/api/admin/reports/${rep2.id}/descartar`, { tok: tMod, body: { note: 'no procede' } });
    check('descartar un reporte → 200', r.status === 200, `(fue ${r.status})`);
    r = await call('POST', `/api/admin/reports/${rep2.id}/descartar`, { tok: tMod });
    check('descartar dos veces → 409', r.status === 409, `(fue ${r.status})`);
    const sigueVisible = await call('GET', '/api/posts', { tok: tAna });
    check('descartar no toca el contenido', sigueVisible.data.posts.some(p => p.id === post2.id));

    r = await call('GET', '/api/admin/log', { tok: tMod });
    check('la bitácora lista las acciones → 200', r.status === 200 && r.data.acciones.length > 0);
    check('la bitácora sí identifica al moderador (es de uso interno)',
      Boolean(r.data.acciones[0]?.moderator?.name));

    r = await call('GET', '/api/admin/stats', { tok: tMod });
    check('las estadísticas responden → 200', r.status === 200 && typeof r.data.reportes.pendientes === 'number');

    r = await call('GET', '/api/reports/mine', { tok: tAna });
    check('quien reporta ve en qué acabaron sus reportes', r.status === 200 && r.data.reports.length > 0);
    check('pero no ve quién los resolvió', !JSON.stringify(r.data.reports).includes('resolvedBy'));
  } finally {
    await cleanup();
  }

  return results;
};
