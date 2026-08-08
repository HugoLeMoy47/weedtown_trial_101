// HU-SHR-004 (ciclo 9A): GET /api/forum/subforums/:slug/preview, la ficha
// Open Graph de un subforo que consume el Worker de Cloudflare en nombre de un
// rastreador anónimo.
//
// La suite hermana es preview.test.js (posteos). Lo que se prueba aquí y no
// allá es lo que cambia en un recurso PÚBLICO POR DISEÑO: que el creador no
// salga NUNCA (ni con sesión), y que un subforo archivado responda el 404 de
// "no existe" en vez de seguir expandiéndose en WhatsApp para siempre.
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('PreviewSubforo', 'wtpsub');

  await cleanup();
  try {
    const ana = await mkUser('ana');
    const tAna = token(ana.id);

    const crearSubforo = (extra) => prisma.subForum.create({
      data: { creatorId: ana.id, ...extra }
    });

    console.log('\n  — Subforo público: 200 con los campos esperados —');
    const sub = await crearSubforo({
      name: 'wtpsub Cultivo casero',
      slug: 'wtpsub-cultivo-casero',
      description: 'Todo sobre cultivar en casa: sustratos, luz, riego y cosecha.'
    });
    let r = await call('GET', `/api/forum/subforums/${sub.slug}/preview`);
    check('subforo activo → 200', r.status === 200, `(fue ${r.status})`);
    check('trae Cache-Control explícito', /max-age/.test(r.headers.get('cache-control') || ''), r.headers.get('cache-control'));
    check('titulo es el nombre del subforo', r.data.titulo === 'wtpsub Cultivo casero', r.data.titulo);
    check('descripcion es la del subforo', r.data.descripcion === 'Todo sobre cultivar en casa: sustratos, luz, riego y cosecha.', r.data.descripcion);
    check('imagen es una URL absoluta (placeholder de campaña)', /^https?:\/\//.test(r.data.imagen), r.data.imagen);
    check('imagenAlt viene poblado', typeof r.data.imagenAlt === 'string' && r.data.imagenAlt.length > 0);
    check('tieneImagen es false (no hay imagen propia por subforo en este ciclo)', r.data.tieneImagen === false);

    console.log('\n  — La regla que importa: NUNCA el creador, en ninguna forma —');
    const cuerpo = JSON.stringify(r.data).toLowerCase();
    check(
      'la respuesta solo trae los 5 campos de la ficha — ni creator, ni id, ni _count',
      Object.keys(r.data).sort().join(',') === ['descripcion', 'imagen', 'imagenAlt', 'tieneImagen', 'titulo'].join(','),
      Object.keys(r.data).join(',')
    );
    check('no aparece la palabra "creator" en ninguna parte del JSON', !cuerpo.includes('creator'));
    check('no se filtra el nombre de quien lo creó', !cuerpo.includes(ana.name.toLowerCase()));
    check('no se filtra su handle', !cuerpo.includes(ana.handle.toLowerCase()));

    console.log('\n  — Con sesión responde EXACTAMENTE lo mismo: la ruta no mira req.user —');
    const rConSesion = await call('GET', `/api/forum/subforums/${sub.slug}/preview`, { tok: tAna });
    check(
      'misma respuesta con y sin sesión (nada de creatorSelect aquí)',
      rConSesion.status === 200 && JSON.stringify(rConSesion.data) === JSON.stringify(r.data)
    );

    console.log('\n  — Subforo ARCHIVADO: 404 idéntico al de "no existe" —');
    const archivado = await crearSubforo({
      name: 'wtpsub Subforo archivado',
      slug: 'wtpsub-archivado',
      description: 'ya no se usa',
      archivedAt: new Date()
    });
    const rArchivado = await call('GET', `/api/forum/subforums/${archivado.slug}/preview`);
    const rInexistente = await call('GET', '/api/forum/subforums/wtpsub-no-existe-jamas/preview');
    check('archivado → 404', rArchivado.status === 404, `(fue ${rArchivado.status})`);
    check('inexistente → 404', rInexistente.status === 404, `(fue ${rInexistente.status})`);
    check(
      'los dos 404 son indistinguibles: nada revela que el archivado existe',
      JSON.stringify(rArchivado.data) === JSON.stringify(rInexistente.data),
      `${JSON.stringify(rArchivado.data)} vs ${JSON.stringify(rInexistente.data)}`
    );
    const rArchivadoConSesion = await call('GET', `/api/forum/subforums/${archivado.slug}/preview`, { tok: tAna });
    check('ni siquiera quien lo creó ve la ficha del archivado', rArchivadoConSesion.status === 404, `(fue ${rArchivadoConSesion.status})`);
    // El subforo archivado SIGUE siendo consultable por enlace directo (es
    // producto, no un descuido: archivar no borra la conversación). Lo que se
    // corta es su FICHA, que es el enlace que se propaga solo.
    const rDetalleArchivado = await call('GET', `/api/forum/subforums/${archivado.slug}`);
    check('pero el detalle normal del archivado sigue respondiendo 200 (no se cambió eso)', rDetalleArchivado.status === 200, `(fue ${rDetalleArchivado.status})`);

    console.log('\n  — Sin descripción: no sale un og:description vacío —');
    const sinDesc = await crearSubforo({ name: 'wtpsub Sin descripcion', slug: 'wtpsub-sin-descripcion', description: null });
    r = await call('GET', `/api/forum/subforums/${sinDesc.slug}/preview`);
    check('descripcion cae a la invitación fija', r.status === 200 && typeof r.data.descripcion === 'string' && r.data.descripcion.includes('WeedTown'), r.data.descripcion);

    console.log('\n  — Descripción larga: se corta en palabra completa —');
    const larga = 'palabra '.repeat(50).trim(); // 399 caracteres
    const descLarga = await crearSubforo({ name: 'wtpsub Descripcion larga', slug: 'wtpsub-descripcion-larga', description: larga });
    r = await call('GET', `/api/forum/subforums/${descLarga.slug}/preview`);
    check('descripcion se corta a ~160 (con margen por la elipsis)', r.data.descripcion.length <= 162, `(${r.data.descripcion.length})`);
    check('termina en elipsis (se cortó)', r.data.descripcion.endsWith('…'), r.data.descripcion);
    check('cortó en palabra completa, no a la mitad', larga.startsWith(r.data.descripcion.slice(0, -1)));

    console.log('\n  — HU-SEC-001: este endpoint es JSON, no escapa HTML —');
    // El escapado se hace en frontend/src/worker.js, que es quien emite HTML.
    // La prueba de que la inyección sale INERTE vive allá (worker.test.js),
    // contra quien de verdad la neutraliza. Aquí se prueba lo contrario: que
    // este archivo NO se meta a escapar, porque dos escapados son un doble
    // escapado visible (la regresión del 7B).
    const inyeccion = await crearSubforo({
      name: 'wtpsub "><script>alert(1)</script>',
      slug: 'wtpsub-inyeccion',
      description: 'Ron & cola "><script>alert(2)</script>'
    });
    r = await call('GET', `/api/forum/subforums/${inyeccion.slug}/preview`);
    check('el nombre llega TAL CUAL, sin escapar', r.data.titulo === 'wtpsub "><script>alert(1)</script>', r.data.titulo);
    check('la descripción también, y el "&" llega literal (no &amp;)', r.data.descripcion === 'Ron & cola "><script>alert(2)</script>', r.data.descripcion);

    console.log('\n  — Slugs raros: 404, nunca 500 —');
    for (const slug of ['MAYUSCULAS', 'con espacios', 'con-acento-ñ', 'wtpsub-cultivo-casero-que-no-es']) {
      const rr = await call('GET', `/api/forum/subforums/${encodeURIComponent(slug)}/preview`);
      check(`slug "${slug}" → 404 (no 500)`, rr.status === 404, `(fue ${rr.status})`);
    }
  } finally {
    await cleanup();
  }

  return results;
};
