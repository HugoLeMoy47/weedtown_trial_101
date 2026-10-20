// HU-SEC-001 (ciclo 7D): la prueba de que una inyección en el título sale
// inerte vivía en el repo equivocado (backend/tests/preview.test.js, que ya
// no escapa nada — ver HU-SEC-001). Esta es la que de verdad protege algo:
// corre contra las funciones del Worker que emiten HTML.
//
// Deliberadamente NO levanta `wrangler dev` ni usa HTMLRewriter: prueba
// `construirMetaTags`/`datosMeta`/`escaparAtributo`, que son funciones puras
// (string -> string) y ya son el punto exacto donde se decide qué llega
// escapado al <head> — lo que `head.append(html, {html:true})` hace con ese
// string después es comportamiento estándar de parseo de HTML, no algo que
// este proyecto controle ni necesite reprobar. La verificación de punta a
// punta contra el HTML real servido por el Worker se hizo a mano con
// `wrangler dev` + curl (ver frontend/README.md).
import {
  escaparAtributo,
  construirMetaTags,
  datosMeta,
  fichaGenerica,
  recursoDeLaPeticion,
  recursoPost,
  recursoSubforo,
  recursoHilo,
  fichaDeHilo,
  recursoPerfil,
  fichaEtiquetas,
  recursoEtiquetas
} from './worker';

const URL_BASE = new URL('https://weedtown.social/p/1');
const POST_1 = recursoPost('1');

// `recursoDeLaPeticion` solo lee `.method`, así que un objeto plano alcanza —
// no hace falta un Request de verdad (no existe en jsdom sin polyfill).
const get = (ruta) => recursoDeLaPeticion({ method: 'GET' }, new URL(`https://weedtown.social${ruta}`));

describe('escaparAtributo', () => {
  test('escapa las cinco entidades relevantes para un atributo HTML', () => {
    expect(escaparAtributo(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  test('un valor sin caracteres especiales sale igual', () => {
    expect(escaparAtributo('posteo normal')).toBe('posteo normal');
  });
});

describe('construirMetaTags — HU-SEC-001: escapa TODO lo que interpola, sin excepciones', () => {
  test('un título con inyección de HTML sale inerte (Trampa T1)', () => {
    const payload = '"><script>alert(1)</script>';
    const html = construirMetaTags({
      titulo: payload,
      descripcion: 'descripción normal',
      imagen: 'https://ejemplo.test/img.jpg',
      imagenAlt: 'alt normal',
      url: 'https://weedtown.social/p/1',
      dimensionesConocidas: true
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('"><');
    expect(html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('un "&" legítimo sale escapado UNA sola vez, no dos (regresión del doble escapado del 7B)', () => {
    const html = construirMetaTags({
      titulo: 'Ron & cola',
      descripcion: 'descripción normal',
      imagen: 'https://ejemplo.test/img.jpg',
      imagenAlt: 'alt normal',
      url: 'https://weedtown.social/p/1',
      dimensionesConocidas: true
    });

    expect(html).toContain('Ron &amp; cola');
    expect(html).not.toContain('&amp;amp;');
  });

  test('descripcion, imagen, imagenAlt y url TAMBIÉN se escapan — sin excepción "porque son fijos"', () => {
    const html = construirMetaTags({
      titulo: 'titulo normal',
      descripcion: 'invitación con "comillas" & cositas',
      imagen: 'https://evil.test/x.jpg"><script>alert(2)</script>',
      imagenAlt: 'alt con "comillas"',
      url: 'https://weedtown.social/p/1?ref="><script>',
      dimensionesConocidas: true
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('invitación con &quot;comillas&quot; &amp; cositas');
    expect(html).toContain('https://evil.test/x.jpg&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(html).toContain('alt con &quot;comillas&quot;');
  });

  test('og:image:width/height solo aparecen cuando dimensionesConocidas es true (Tarea 3.1)', () => {
    const datosConDimensiones = { titulo: 't', descripcion: 'd', imagen: 'https://x.test/a.jpg', imagenAlt: 'alt', url: 'https://weedtown.social/p/1', dimensionesConocidas: true };
    const datosSinDimensiones = { ...datosConDimensiones, dimensionesConocidas: false };

    expect(construirMetaTags(datosConDimensiones)).toContain('og:image:width');
    expect(construirMetaTags(datosConDimensiones)).toContain('og:image:height');
    expect(construirMetaTags(datosSinDimensiones)).not.toContain('og:image:width');
    expect(construirMetaTags(datosSinDimensiones)).not.toContain('og:image:height');
  });
});

describe('datosMeta', () => {
  test('dimensionesConocidas es false cuando la ficha trae imagen propia del posteo', () => {
    const ficha = { titulo: 't', descripcion: 'd', imagen: 'https://x.test/propia.jpg', imagenAlt: null, tieneImagen: true };
    expect(datosMeta(ficha, URL_BASE, POST_1).dimensionesConocidas).toBe(false);
  });

  test('dimensionesConocidas es true con imagen de campaña (o la genérica)', () => {
    const ficha = { titulo: 't', descripcion: 'd', imagen: 'https://x.test/campania.jpg', imagenAlt: 'alt', tieneImagen: false };
    expect(datosMeta(ficha, URL_BASE, POST_1).dimensionesConocidas).toBe(true);
    expect(datosMeta(fichaGenerica(URL_BASE), URL_BASE, POST_1).dimensionesConocidas).toBe(true);
  });

  test('url es canónica: origen + /p/:id, sin querystring', () => {
    const conQuery = new URL('https://weedtown.social/p/42?utm_source=whatsapp');
    const ficha = { titulo: 't', descripcion: 'd', imagen: 'https://x.test/a.jpg', imagenAlt: 'alt', tieneImagen: false };
    expect(datosMeta(ficha, conQuery, recursoPost('42')).url).toBe('https://weedtown.social/p/42');
  });

  test('un subforo también trae url canónica y og:type website (ciclo 9A)', () => {
    const conQuery = new URL('https://weedtown.social/forum/cultivo-casero?utm_source=whatsapp');
    const ficha = { titulo: 'Cultivo casero', descripcion: 'd', imagen: 'https://x.test/a.jpg', imagenAlt: 'alt', tieneImagen: false };
    const datos = datosMeta(ficha, conQuery, recursoSubforo('cultivo-casero'));

    expect(datos.url).toBe('https://weedtown.social/forum/cultivo-casero');
    expect(datos.tipo).toBe('website');
    expect(construirMetaTags(datos)).toContain('<meta property="og:type" content="website">');
  });

  test('un posteo sigue siendo og:type article (no se movió por el 9A)', () => {
    const ficha = { titulo: 't', descripcion: 'd', imagen: 'https://x.test/a.jpg', imagenAlt: 'alt', tieneImagen: false };
    const html = construirMetaTags(datosMeta(ficha, URL_BASE, POST_1));
    expect(html).toContain('<meta property="og:type" content="article">');
  });
});

// ---------------------------------------------------------------------------
// Ciclo 9A: la trampa de este ciclo. `/forum/:slug` y `/forum/:slug/post/:id`
// son DOS rutas del SPA (App.jsx). Hasta el 17 solo la primera llevaba ficha;
// desde el 18 cada una tiene la suya. Estas pruebas son las que fallan si
// alguien afloja RUTA_SUBFORO a `.+` (el subforo se tragaría al hilo).
describe('recursoDeLaPeticion — qué rutas se interceptan y cuáles NO', () => {
  test('/forum/:slug sí se intercepta', () => {
    expect(get('/forum/cultivo-casero')).toEqual({
      ruta: '/forum/cultivo-casero',
      api: '/api/forum/subforums/cultivo-casero/preview',
      tipoOg: 'website'
    });
  });

  test('/forum/:slug con barra final también', () => {
    expect(get('/forum/cultivo-casero/').ruta).toBe('/forum/cultivo-casero');
  });

  test('LA TRAMPA: /forum/:slug/post/:id es un HILO, no un subforo de slug "cultivo-casero/post/42"', () => {
    const r = get('/forum/cultivo-casero/post/42');
    expect(r.ruta).toBe('/forum/cultivo-casero/post/42');
    expect(r.api).toBe('/api/forum/subforums/cultivo-casero/preview');
    expect(get('/forum/cultivo-casero/post/42/').ruta).toBe('/forum/cultivo-casero/post/42');
  });

  test('lo que NO es exactamente un hilo pasa de largo', () => {
    for (const ruta of [
      '/forum/cultivo-casero/post/abc',
      '/forum/cultivo-casero/post/',
      '/forum/cultivo-casero/post/42/comentarios',
      '/forum/cultivo-casero/post/1234567890', // 10 dígitos: tope contra claves de caché inventadas
      '/forum/cultivo-casero/otra/42'
    ]) {
      expect(get(ruta)).toBeNull();
    }
  });

  test('el directorio /forum tampoco (no hay slug que pedirle al backend)', () => {
    expect(get('/forum')).toBeNull();
    expect(get('/forum/')).toBeNull();
  });

  test('/p/:id sigue interceptándose igual que antes', () => {
    expect(get('/p/42')).toEqual({ ruta: '/p/42', api: '/api/posts/42/preview', tipoOg: 'article' });
    expect(get('/p/42/').ruta).toBe('/p/42');
  });

  test('el resto del SPA y los estáticos pasan de largo', () => {
    for (const ruta of ['/', '/feed', '/login', '/auth/callback', '/static/js/main.abc123.js', '/p/abc', '/profile/alguien']) {
      expect(get(ruta)).toBeNull();
    }
  });

  test('el querystring no cambia la decisión ni entra a la ruta canónica', () => {
    const r = recursoDeLaPeticion({ method: 'GET' }, new URL('https://weedtown.social/forum/cultivo?utm_source=whatsapp'));
    expect(r.ruta).toBe('/forum/cultivo');
  });

  test('solo GET: un POST a la misma ruta pasa de largo', () => {
    const url = new URL('https://weedtown.social/forum/cultivo');
    expect(recursoDeLaPeticion({ method: 'POST' }, url)).toBeNull();
    expect(recursoDeLaPeticion({ method: 'HEAD' }, url)).toBeNull();
  });
});

describe('HU-SEC-001 en la ficha de subforo — la prueba que de verdad protege esto', () => {
  test('un nombre de subforo con inyección sale INERTE en el HTML final', () => {
    const payload = '"><script>alert(1)</script>';
    const ficha = {
      titulo: payload,
      descripcion: `descripción del subforo ${payload}`,
      imagen: 'https://weedtown.social/campaign/placeholder-default.png',
      imagenAlt: 'alt de campaña',
      tieneImagen: false
    };
    const html = construirMetaTags(
      datosMeta(ficha, new URL('https://weedtown.social/forum/x'), recursoSubforo('x'))
    );

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('"><');
    expect(html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('un slug con inyección tampoco escapa por og:url — es dato del cliente, no del backend', () => {
    // El slug viene del PATHNAME de la petición, no de la base: cualquiera
    // puede pedir /forum/<lo-que-sea>. Si el backend responde 404 (lo normal
    // aquí) se sirve la ficha genérica, pero `og:url` se arma igual con lo que
    // llegó — y por eso también pasa por escaparAtributo.
    const url = new URL('https://weedtown.social/forum/x');
    const html = construirMetaTags(datosMeta(fichaGenerica(url), url, recursoSubforo('"><script>alert(1)</script>')));

    expect(html).not.toContain('<script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

// ---------------------------------------------------------------------------
// Ciclo 11B: la ficha de perfil. Dos cosas que solo existen aquí — el
// `noindex` por perfil y una caché más corta — y la misma trampa de regex del
// 9A aplicada a `/@handle`.
describe('recursoPerfil y la ruta /@handle (ciclo 11B)', () => {
  test('/@handle sí se intercepta', () => {
    expect(get('/@luna')).toEqual({
      ruta: '/@luna',
      api: '/api/profile/handle/luna/preview',
      tipoOg: 'profile',
      frescoMs: 10 * 60 * 1000,
      maxMs: 60 * 60 * 1000,
      edgeCacheControl: 'public, max-age=3600',
      indexableSinFicha: false
    });
  });

  // La misma trampa del 9A: si alguien afloja la regex a `.+`, esto falla.
  test('una ruta MÁS PROFUNDA bajo /@ no se intercepta', () => {
    expect(get('/@luna/loquesea')).toBeNull();
    expect(get('/@luna/posts/3')).toBeNull();
  });

  test('lo que no cumple el formato del handle no se intercepta', () => {
    expect(get('/@lu')).toBeNull();                    // muy corto
    expect(get('/@' + 'a'.repeat(21))).toBeNull();     // muy largo
    expect(get('/@_luna')).toBeNull();                 // no empieza con letra o número
    expect(get('/@luna-mala')).toBeNull();
    expect(get('/@')).toBeNull();
  });

  test('las rutas que ya existían siguen sin verse afectadas', () => {
    expect(get('/feed')).toBeNull();
    expect(get('/perfil/7')).toBeNull();
    expect(get('/profile')).toBeNull();
  });

  test('la caché de un perfil es más corta que la de un posteo: se puede APAGAR', () => {
    const perfil = recursoPerfil('luna');
    expect(perfil.frescoMs).toBeLessThan(60 * 60 * 1000);
    expect(perfil.maxMs).toBeLessThan(24 * 60 * 60 * 1000);
    // Un posteo no trae TTL propio y cae en los de siempre.
    expect(recursoPost('1').frescoMs).toBeUndefined();
  });
});

describe('noindex por perfil (ciclo 11B)', () => {
  const url = new URL('https://weedtown.social/@luna');
  const PERFIL = recursoPerfil('luna');
  const fichaRica = { titulo: 'Luna (@luna)', descripcion: 'd', imagen: 'https://x.test/a.jpg', imagenAlt: 'alt', tieneImagen: false, indexable: true };
  const fichaGen = { titulo: 'WeedTown', descripcion: 'd', imagen: 'https://x.test/a.jpg', imagenAlt: 'alt', tieneImagen: false, indexable: false };

  test('un perfil público NO lleva noindex', () => {
    expect(construirMetaTags(datosMeta(fichaRica, url, PERFIL))).not.toContain('noindex');
  });

  test('un perfil no público SÍ lleva noindex', () => {
    expect(construirMetaTags(datosMeta(fichaGen, url, PERFIL))).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  // Falla cerrado: si el backend está dormido no sabemos si el perfil es
  // público, y suponer que sí indexaría un perfil privado.
  test('sin ficha (backend caído) un perfil cae en noindex', () => {
    expect(construirMetaTags(datosMeta(fichaGenerica(url), url, PERFIL))).toContain('noindex');
  });

  test('posteos y subforos NO ganan noindex por este cambio', () => {
    const ficha = { titulo: 't', descripcion: 'd', imagen: 'https://x.test/a.jpg', imagenAlt: 'alt', tieneImagen: false };
    expect(construirMetaTags(datosMeta(ficha, URL_BASE, POST_1))).not.toContain('noindex');
    const u = new URL('https://weedtown.social/forum/cultivo');
    expect(construirMetaTags(datosMeta(fichaGenerica(u), u, recursoSubforo('cultivo')))).not.toContain('noindex');
  });

  test('og:type de un perfil es "profile" y la url es canónica', () => {
    const datos = datosMeta(fichaRica, new URL('https://weedtown.social/@luna?utm_source=whatsapp'), PERFIL);
    expect(datos.tipo).toBe('profile');
    expect(datos.url).toBe('https://weedtown.social/@luna');
  });
});

describe('Estudio de Etiquetado PE420 (/etiquetas y etkt420.weedtown.social)', () => {
  test('intercepta /etiquetas en weedtown.social como ficha estática website', () => {
    expect(get('/etiquetas')).toEqual({
      ruta: '/etiquetas',
      api: null,
      tipoOg: 'website',
      estatica: true
    });
  });

  test('intercepta la raíz de etkt420.weedtown.social pero deja pasar los bundles estáticos', () => {
    const raizSub = recursoDeLaPeticion({ method: 'GET' }, new URL('https://etkt420.weedtown.social/'));
    expect(raizSub).toEqual({
      ruta: '/',
      api: null,
      tipoOg: 'website',
      estatica: true
    });

    const bundleSub = recursoDeLaPeticion({ method: 'GET' }, new URL('https://etkt420.weedtown.social/assets/index-123.js'));
    expect(bundleSub).toBeNull();
  });

  test('fichaEtiquetas usa la imagen de campaña 1200x630 (concepto-07-v1.jpg) y metadatos completos', () => {
    const url = new URL('https://etkt420.weedtown.social/');
    const ficha = fichaEtiquetas(url);
    expect(ficha.titulo).toContain('Estudio de Etiquetado Artesanal');
    expect(ficha.imagen).toBe('https://etkt420.weedtown.social/campaign/concepto-07-v1.jpg');
    expect(ficha.tieneImagen).toBe(false);

    const html = construirMetaTags(datosMeta(ficha, url, recursoEtiquetas('/')));
    expect(html).toContain('content="https://etkt420.weedtown.social/campaign/concepto-07-v1.jpg"');
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="630"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('name="twitter:image:alt"');
  });
});



// ---------------------------------------------------------------------------
// Ciclo 18: la ficha de un hilo. El foro es solo para quien tiene sesión, así
// que la tarjeta pública NO puede llevar nada del hilo.
describe('Ficha de un hilo del foro (ciclo 18)', () => {
  const subforo = {
    titulo: 'Cultivo casero',
    descripcion: 'Texto institucional del subforo',
    imagen: 'https://weedtown.social/campaign/concepto-01-v1.jpg',
    imagenAlt: 'alt',
    tieneImagen: false
  };

  test('el Worker le pide la ficha al SUBFORO: el id del hilo nunca viaja al backend', () => {
    const r = recursoHilo('cultivo-casero', '42');
    expect(r.api).toBe('/api/forum/subforums/cultivo-casero/preview');
    expect(r.api).not.toContain('42');
  });

  test('el titular es «Conversación en <subforo>» y la descripción es fija', () => {
    const f = fichaDeHilo(subforo);
    expect(f.titulo).toBe('Conversación en Cultivo casero');
    expect(f.descripcion).toContain('Cultivo casero');
    expect(f.descripcion).not.toContain('Texto institucional');
    expect(f.imagen).toBe(subforo.imagen);
  });

  test('es idéntica para cualquier id: no es un verificador de hilos', () => {
    const a = fichaDeHilo(subforo);
    const b = fichaDeHilo(subforo);
    expect(a).toEqual(b);
    expect(JSON.stringify(recursoHilo('x', '1').api)).toBe(JSON.stringify(recursoHilo('x', '99999').api));
  });

  test('og:url es la del hilo, limpia de querystring', () => {
    const u = new URL('https://weedtown.social/forum/cultivo-casero/post/42?utm_source=whatsapp');
    const datos = datosMeta(fichaDeHilo(subforo), u, recursoHilo('cultivo-casero', '42'));
    expect(datos.url).toBe('https://weedtown.social/forum/cultivo-casero/post/42');
    expect(datos.titulo).toBe('Conversación en Cultivo casero');
  });

  test('es contenido tras login: lleva noindex, con ficha y sin ella', () => {
    const u = new URL('https://weedtown.social/forum/cultivo-casero/post/42');
    const hilo = recursoHilo('cultivo-casero', '42');
    expect(construirMetaTags(datosMeta(fichaDeHilo(subforo), u, hilo))).toContain('noindex');
    expect(construirMetaTags(datosMeta(fichaGenerica(u), u, hilo))).toContain('noindex');
  });

  test('sin ficha del subforo (404 o backend caído) no inventa un titular', () => {
    expect(fichaDeHilo(null)).toBeNull();
    expect(fichaDeHilo({})).toEqual({});
  });

  test('un nombre de subforo con HTML sale inerte en la etiqueta', () => {
    const u = new URL('https://weedtown.social/forum/x/post/1');
    const f = fichaDeHilo({ ...subforo, titulo: '"><script>alert(1)</script>' });
    const html = construirMetaTags(datosMeta(f, u, recursoHilo('x', '1')));
    expect(html).not.toContain('<script>');
  });

  test('la ficha del subforo y la del posteo no cambian', () => {
    expect(get('/forum/cultivo-casero')).toEqual({
      ruta: '/forum/cultivo-casero',
      api: '/api/forum/subforums/cultivo-casero/preview',
      tipoOg: 'website'
    });
    expect(get('/p/42').tipoOg).toBe('article');
  });
});
