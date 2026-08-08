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
  recursoSubforo
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
// son DOS rutas del SPA (App.jsx) y solo la primera lleva ficha. Estas pruebas
// son las que fallan si alguien afloja RUTA_SUBFORO a `.+`.
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

  test('LA TRAMPA: /forum/:slug/post/:id NO se intercepta — es otro ciclo', () => {
    expect(get('/forum/cultivo-casero/post/42')).toBeNull();
    expect(get('/forum/cultivo-casero/post/42/')).toBeNull();
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
