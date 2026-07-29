// Prueba de humo: no cubre reglas de negocio (para eso están las demás 12
// suites) — solo confirma que el entorno está sano: el proceso levanta,
// habla con la base, aplica migraciones al día y un ida-y-vuelta de
// escritura/lectura básico funciona. Pensada para correr sola y rápido
// (`npm run test:smoke`) antes de una tanda completa, o como primer chequeo
// en un entorno nuevo.
const { suite, BASE } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup } = suite('Humo', 'wtsmoke');

  await cleanup();
  try {
    let r = await fetch(`${BASE}/health`);
    const salud = await r.json();
    check('/health responde ok con la BD arriba', r.status === 200 && salud.db === 'ok', `(${JSON.stringify(salud)})`);

    const ana = await mkUser('ana');
    const tAna = token(ana.id);

    r = await call('GET', '/api/auth/me', { tok: tAna });
    check('la sesión de una cuenta recién sembrada funciona', r.status === 200 && r.data.handle === ana.handle);

    const marca = `humo-${Date.now()}`;
    r = await call('POST', '/api/posts', { tok: tAna, body: { content: marca } });
    check('se puede crear un post', r.status === 200 && !!r.data.id, `(fue ${r.status})`);
    const postId = r.data.id;

    r = await call('GET', `/api/posts/search?q=${encodeURIComponent(marca)}`);
    check('el post recién creado se puede leer de vuelta', r.status === 200 && r.data.results?.some(p => p.id === postId));
  } finally {
    await cleanup();
  }

  return results;
};
