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
import { escaparAtributo, construirMetaTags, datosMeta, fichaGenerica } from './worker';

const URL_BASE = new URL('https://weedtown.social/p/1');

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
    expect(datosMeta(ficha, URL_BASE, 1).dimensionesConocidas).toBe(false);
  });

  test('dimensionesConocidas es true con imagen de campaña (o la genérica)', () => {
    const ficha = { titulo: 't', descripcion: 'd', imagen: 'https://x.test/campania.jpg', imagenAlt: 'alt', tieneImagen: false };
    expect(datosMeta(ficha, URL_BASE, 1).dimensionesConocidas).toBe(true);
    expect(datosMeta(fichaGenerica(URL_BASE), URL_BASE, 1).dimensionesConocidas).toBe(true);
  });

  test('url es canónica: origen + /p/:id, sin querystring', () => {
    const conQuery = new URL('https://weedtown.social/p/42?utm_source=whatsapp');
    const ficha = { titulo: 't', descripcion: 'd', imagen: 'https://x.test/a.jpg', imagenAlt: 'alt', tieneImagen: false };
    expect(datosMeta(ficha, conQuery, 42).url).toBe('https://weedtown.social/p/42');
  });
});
