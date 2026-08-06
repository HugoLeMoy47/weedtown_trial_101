// HU-CTA-002: atribución de altas sin migración. El endpoint es puramente
// observacional (escribe una línea en logger.js, no guarda nada en la base),
// así que estas pruebas verifican lo único observable por HTTP: que exige
// sesión, que nunca truena con entradas raras, y que responde igual sin
// importar si el `ref` es válido — el descarte de un `ref` no reconocido es
// silencioso, no un error.
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup } = suite('Atribucion', 'wtattr');

  await cleanup();
  try {
    const user = await mkUser('user');
    const tok = token(user.id);

    console.log('\n  — requiere sesión —');
    const rSinSesion = await call('POST', '/api/auth/attribution', { body: { ref: 'post' } });
    check('sin token responde 401', rSinSesion.status === 401);

    console.log('\n  — ref válido —');
    for (const ref of ['post', 'perfil', 'directo']) {
      const r = await call('POST', '/api/auth/attribution', { tok, body: { ref } });
      check(`ref="${ref}" responde 204`, r.status === 204);
    }

    console.log('\n  — ref no reconocido se descarta en silencio, no truena —');
    const rRefInvalido = await call('POST', '/api/auth/attribution', { tok, body: { ref: 'algo-inventado' } });
    check('ref inválido no da error (mismo 204)', rRefInvalido.status === 204);

    const rSinRef = await call('POST', '/api/auth/attribution', { tok, body: {} });
    check('sin ref tampoco da error', rSinRef.status === 204);

    console.log('\n  — pid solo se acepta como entero positivo —');
    const rPidValido = await call('POST', '/api/auth/attribution', { tok, body: { ref: 'post', pid: 42 } });
    check('pid entero positivo: 204', rPidValido.status === 204);

    for (const pid of [-1, 0, 1.5, 'no-es-numero', '42', null]) {
      const r = await call('POST', '/api/auth/attribution', { tok, body: { ref: 'post', pid } });
      check(`pid=${JSON.stringify(pid)} no rompe el endpoint (204)`, r.status === 204, `status=${r.status}`);
    }
  } finally {
    await cleanup();
  }

  return results;
};
