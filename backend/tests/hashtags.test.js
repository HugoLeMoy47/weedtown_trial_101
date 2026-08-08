// Ciclo 9C: los hashtags conservan su grafía, y las palabras vacías no entran
// al índice.
//
// Son dos problemas distintos y las pruebas los mantienen separados a
// propósito: uno es de PRESENTACIÓN (agrupar en minúsculas está bien, mostrar
// en minúsculas no) y el otro es de HIGIENE DEL ÍNDICE (que en la Ola 2 va a
// alimentar agrupación y tendencias). Lo único que comparten es que ninguno
// puede tocar el texto del posteo — de ahí la prueba que lo verifica letra por
// letra.
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup, prisma } = suite('Hashtags', 'wthtag');

  // Las filas de Hashtag son globales (no cuelgan de un usuario), así que
  // `cleanup()` de lib.js no las alcanza: se limpian aquí, por nombre.
  const TAGS_DE_PRUEBA = [
    'wthtagrolarenlatarde', 'wthtagrolar', 'wthtagcultivo', 'wthtagdiseño',
    'de', 'segun', 'según', 'ni', 'del'
  ];
  const limpiarTags = async () => {
    const filas = await prisma.hashtag.findMany({
      where: { tag: { in: TAGS_DE_PRUEBA } },
      select: { id: true }
    });
    const ids = filas.map(f => f.id);
    if (!ids.length) return;
    await prisma.hashtagOnPost.deleteMany({ where: { hashtagId: { in: ids } } });
    await prisma.hashtag.deleteMany({ where: { id: { in: ids } } });
  };

  await cleanup();
  await limpiarTags();
  try {
    const ana = await mkUser('ana');
    const beto = await mkUser('beto');
    const tAna = token(ana.id);
    const tBeto = token(beto.id);

    const tagsDe = (r) => (r.data.hashtags || []).map(h => h.hashtag);
    const llaves = (r) => tagsDe(r).map(h => h.tag).sort();

    console.log('\n  — Tarea 1: la grafía sobrevive, la llave se agrupa en minúsculas —');
    let r = await call('POST', '/api/posts', {
      tok: tAna,
      body: { content: 'a rolar', hashtags: ['WtHtagRolarEnLaTarde'] }
    });
    check('crear posteo con hashtag en camello → 200', r.status === 200, `(fue ${r.status})`);
    const camello = tagsDe(r)[0];
    check('la llave va en minúsculas', camello?.tag === 'wthtagrolarenlatarde', `tag="${camello?.tag}"`);
    check('la grafía se conserva tal cual se escribió', camello?.displayTag === 'WtHtagRolarEnLaTarde', `displayTag="${camello?.displayTag}"`);
    check('la API manda AMBOS campos (uno para agrupar, otro para pintar)', Boolean(camello?.tag && camello?.displayTag));

    console.log('\n  — El "#" inicial se acepta y no entra ni a la llave ni a la grafía —');
    r = await call('POST', '/api/posts', {
      tok: tAna,
      body: { content: 'con gato', hashtags: ['#WtHtagCultivo'] }
    });
    check('llave sin "#"', tagsDe(r)[0]?.tag === 'wthtagcultivo', tagsDe(r)[0]?.tag);
    check('grafía sin "#" y con sus mayúsculas', tagsDe(r)[0]?.displayTag === 'WtHtagCultivo', tagsDe(r)[0]?.displayTag);

    console.log('\n  — #Rolar y #rolar son EL MISMO tag: una sola fila, no dos —');
    const rMayus = await call('POST', '/api/posts', { tok: tAna, body: { content: 'uno', hashtags: ['WtHtagRolar'] } });
    const rMinus = await call('POST', '/api/posts', { tok: tBeto, body: { content: 'dos', hashtags: ['wthtagrolar'] } });
    check('los dos posteos apuntan a la misma llave', tagsDe(rMayus)[0]?.tag === 'wthtagrolar' && tagsDe(rMinus)[0]?.tag === 'wthtagrolar');
    check('y al mismo id de fila', tagsDe(rMayus)[0]?.id === tagsDe(rMinus)[0]?.id, `${tagsDe(rMayus)[0]?.id} vs ${tagsDe(rMinus)[0]?.id}`);
    const filasRolar = await prisma.hashtag.count({ where: { tag: 'wthtagrolar' } });
    check('existe UNA sola fila en Hashtag (no se duplicó)', filasRolar === 1, `(hay ${filasRolar})`);

    console.log('\n  — Gana la PRIMERA grafía vista: la segunda no la sobreescribe —');
    check('el segundo posteo hereda la grafía del primero', tagsDe(rMinus)[0]?.displayTag === 'WtHtagRolar', tagsDe(rMinus)[0]?.displayTag);
    const filaRolar = await prisma.hashtag.findUnique({ where: { tag: 'wthtagrolar' } });
    check('y en la base tampoco cambió', filaRolar?.displayTag === 'WtHtagRolar', filaRolar?.displayTag);

    console.log('\n  — Dentro de un mismo posteo también gana la primera, y no se duplica —');
    r = await call('POST', '/api/posts', {
      tok: tAna,
      body: { content: 'repetido', hashtags: ['WtHtagRolar', 'WTHTAGROLAR', 'wthtagrolar'] }
    });
    check('las tres formas colapsan en un solo tag', tagsDe(r).length === 1, `(vinieron ${tagsDe(r).length})`);

    console.log('\n  — La grafía respeta acentos y ñ: la llave NO se desacentúa —');
    r = await call('POST', '/api/posts', { tok: tAna, body: { content: 'ñ', hashtags: ['WtHtagDiseño'] } });
    check('la ñ sobrevive en la grafía', tagsDe(r)[0]?.displayTag === 'WtHtagDiseño', tagsDe(r)[0]?.displayTag);
    check('y la llave es solo minúsculas, con la ñ intacta', tagsDe(r)[0]?.tag === 'wthtagdiseño', tagsDe(r)[0]?.tag);

    console.log('\n  — Tarea 2: el diccionario de descarte —');
    const CONTENIDO_CON_VACIAS = 'esto habla #de cultivo y #ni modo';
    r = await call('POST', '/api/posts', {
      tok: tAna,
      body: { content: CONTENIDO_CON_VACIAS, hashtags: ['de', 'WtHtagCultivo', 'ni'] }
    });
    check('el posteo se crea igual (descartar un tag no es un error)', r.status === 200, `(fue ${r.status})`);
    check('solo sobrevive el tag con contenido', llaves(r).join(',') === 'wthtagcultivo', llaves(r).join(','));
    check('"de" no generó fila en Hashtag', (await prisma.hashtag.count({ where: { tag: 'de' } })) === 0);
    check('"ni" (agregada por mí, no por el PO) tampoco', (await prisma.hashtag.count({ where: { tag: 'ni' } })) === 0);

    console.log('\n  — EL TEXTO DEL POSTEO NO SE TOCA NUNCA —');
    check(
      'el contenido vuelve idéntico, con sus "#de" y "#ni" adentro',
      r.data.content === CONTENIDO_CON_VACIAS,
      `esperado="${CONTENIDO_CON_VACIAS}" · vino="${r.data.content}"`
    );
    const enBase = await prisma.post.findUnique({ where: { id: r.data.id }, select: { content: true } });
    check('y en la base tampoco se modificó', enBase.content === CONTENIDO_CON_VACIAS, enBase.content);

    console.log('\n  — El descarte ignora acentos al COMPARAR, sin desacentuar lo que guarda —');
    r = await call('POST', '/api/posts', { tok: tAna, body: { content: 'x', hashtags: ['según', 'Segun', 'SEGÚN'] } });
    check('ni "según" ni "segun" ni "SEGÚN" entran al índice', tagsDe(r).length === 0, JSON.stringify(llaves(r)));
    check('ninguna dejó fila', (await prisma.hashtag.count({ where: { tag: { in: ['según', 'segun'] } } })) === 0);

    console.log('\n  — Un posteo cuyos hashtags son TODOS palabras vacías se publica sin tags —');
    r = await call('POST', '/api/posts', { tok: tAna, body: { content: 'puras vacías', hashtags: ['de', 'la', 'que', 'del'] } });
    check('se crea con 200 y con cero tags', r.status === 200 && tagsDe(r).length === 0, `(status ${r.status}, tags ${tagsDe(r).length})`);

    console.log('\n  — Editar un posteo sigue las mismas dos reglas —');
    const rEditar = await call('POST', '/api/posts', { tok: tAna, body: { content: 'antes', hashtags: ['WtHtagCultivo'] } });
    r = await call('PUT', `/api/posts/${rEditar.data.id}`, {
      tok: tAna,
      body: { content: 'después', hashtags: ['de', 'WTHTAGROLARENLATARDE'] }
    });
    check('al editar también se descarta la palabra vacía', llaves(r).join(',') === 'wthtagrolarenlatarde', llaves(r).join(','));
    check(
      'al editar NO se pisa la grafía que ya tenía el tag (sigue ganando la primera)',
      tagsDe(r)[0]?.displayTag === 'WtHtagRolarEnLaTarde',
      tagsDe(r)[0]?.displayTag
    );

    console.log('\n  — El feed devuelve los dos campos, no solo la llave —');
    r = await call('GET', '/api/posts', { tok: tAna });
    const conTags = (r.data.posts || []).find(p => (p.hashtags || []).length > 0);
    check(
      'un posteo del feed trae tag y displayTag',
      Boolean(conTags?.hashtags[0]?.hashtag?.tag && conTags?.hashtags[0]?.hashtag?.displayTag),
      JSON.stringify(conTags?.hashtags[0]?.hashtag)
    );

    console.log('\n  — Los topes de siempre siguen vigentes —');
    const largo = 'w'.repeat(31);
    r = await call('POST', '/api/posts', { tok: tAna, body: { content: 'largo', hashtags: [largo, 'WtHtagCultivo'] } });
    check('un tag de más de 30 caracteres se ignora', llaves(r).join(',') === 'wthtagcultivo', llaves(r).join(','));
  } finally {
    await limpiarTags();
    await cleanup();
  }

  return results;
};
