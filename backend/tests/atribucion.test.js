// HU-CTA-002 / HU-ATR-001: atribución de altas sin migración. El endpoint es
// puramente observacional (escribe una línea en logger.js con solo `ref`, no
// guarda nada en la base), así que estas pruebas verifican lo único
// observable por HTTP: que exige sesión, que nunca truena con entradas
// raras, que un `ref` no reconocido se descarta en silencio, y que el
// limitador propio (5/15min, HU-ATR-001) corta antes que el general.
//
// El presupuesto de peticiones de este archivo está pensado a propósito
// para terminar justo en el límite: 6 llamadas en total, la última cae fuera
// del cupo. No agregues más peticiones antes de esa sin correr el resto.
const { suite } = require('./lib');

module.exports = async function run() {
  const { results, check, call, token, mkUser, cleanup } = suite('Atribucion', 'wtattr');

  await cleanup();
  try {
    const user = await mkUser('user');
    const tok = token(user.id);

    console.log('\n  — requiere sesión (se conserva tal cual, HU-ATR-001 CA4) —');
    const rSinSesion = await call('POST', '/api/auth/attribution', { body: { ref: 'post' } });
    check('sin token responde 401', rSinSesion.status === 401); // 1/5

    console.log('\n  — ref no reconocido o ausente se descarta en silencio, no truena —');
    const rRefInvalido = await call('POST', '/api/auth/attribution', { tok, body: { ref: 'algo-inventado' } });
    check('ref inválido no da error (204)', rRefInvalido.status === 204); // 2/5

    const rSinRef = await call('POST', '/api/auth/attribution', { tok, body: {} });
    check('sin ref tampoco da error (204)', rSinRef.status === 204); // 3/5

    console.log('\n  — ref válido —');
    const rPost = await call('POST', '/api/auth/attribution', { tok, body: { ref: 'post' } });
    check('ref="post" responde 204', rPost.status === 204); // 4/5

    const rPerfil = await call('POST', '/api/auth/attribution', { tok, body: { ref: 'perfil' } });
    check('ref="perfil" responde 204', rPerfil.status === 204); // 5/5 — cupo agotado

    console.log('\n  — limitador propio (HU-ATR-001): corta antes que el apiLimiter general —');
    const rLimitado = await call('POST', '/api/auth/attribution', { tok, body: { ref: 'directo' } });
    check(
      'la 6ª petición en la ventana responde 429 aunque el ref sea válido',
      rLimitado.status === 429,
      `(fue ${rLimitado.status})`
    );
  } finally {
    await cleanup();
  }

  return results;
};
