// Contenido repetitivo y spam de enlaces (P1-8 del plan de remediación).
// Complementa los rate limits por IP y la cuarentena de altas nuevas: esos
// frenan CUÁNTO se puede publicar, esto frena qué tan repetitivo o cargado de
// enlaces es cada publicación.
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup } = suite('AntiSpam', 'wtspam');

  await cleanup();
  try {
    const ana = await mkUser('ana');
    const tAna = token(ana.id);

    console.log('\n  — Spam de enlaces —');
    const muchosEnlaces = Array.from({ length: 6 }, (_, i) => `https://ejemplo.com/${i}`).join(' ');
    let r = await call('POST', '/api/posts', { tok: tAna, body: { content: muchosEnlaces } });
    check('un post con más de 5 enlaces se rechaza → 400', r.status === 400, `(fue ${r.status})`);

    const pocosEnlaces = 'mira esto https://ejemplo.com/1 y esto https://ejemplo.com/2';
    r = await call('POST', '/api/posts', { tok: tAna, body: { content: pocosEnlaces } });
    check('un post con pocos enlaces sí pasa', r.status === 200, `(fue ${r.status})`);

    console.log('\n  — Contenido repetido en ráfaga —');
    const marca = `contenido de prueba ${Date.now()}`;
    r = await call('POST', '/api/posts', { tok: tAna, body: { content: marca } });
    check('la primera vez se publica sin problema', r.status === 200, `(fue ${r.status})`);

    r = await call('POST', '/api/posts', { tok: tAna, body: { content: marca } });
    check('repetir EXACTAMENTE el mismo texto en seguida → 429', r.status === 429, `(fue ${r.status})`);

    r = await call('POST', '/api/posts', { tok: tAna, body: { content: `${marca} (variación)` } });
    check('un texto distinto no se bloquea', r.status === 200, `(fue ${r.status})`);

    console.log('\n  — Mismo criterio en el foro —');
    const beto = await mkUser('beto');
    const tBeto = token(beto.id);
    r = await call('POST', '/api/forum/subforums', {
      tok: tBeto, body: { name: `wtspam sub ${Date.now()}`, description: 'sub de prueba' }
    });
    const slug = r.data.subforum?.slug || r.data.slug;

    r = await call('POST', `/api/forum/subforums/${slug}/posts`, {
      tok: tBeto, body: { title: 'post normal', content: muchosEnlaces }
    });
    check('post de foro con demasiados enlaces → 400', r.status === 400, `(fue ${r.status})`);

    const marcaForo = `foro repetido ${Date.now()}`;
    r = await call('POST', `/api/forum/subforums/${slug}/posts`, {
      tok: tBeto, body: { title: 'uno', content: marcaForo }
    });
    check('primer post del foro pasa', r.status === 200, `(fue ${r.status})`);
    r = await call('POST', `/api/forum/subforums/${slug}/posts`, {
      tok: tBeto, body: { title: 'dos', content: marcaForo }
    });
    check('repetir el mismo contenido en el foro → 429', r.status === 429, `(fue ${r.status})`);
  } finally {
    await cleanup();
  }

  return results;
};
