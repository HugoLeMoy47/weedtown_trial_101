// Worker de Cloudflare para la ficha de previsualización de /p/:id
// (HU-SHR-002, ciclo 7B).
//
// ¿POR QUÉ EXISTE ESTE ARCHIVO? (Trampa T7 del plan — léelo antes de
// "simplificar" esto de vuelta a solo `assets` en wrangler.jsonc)
// ---------------------------------------------------------------------
// Sin él, weedtown.social sirve el mismo index.html para cualquier ruta
// (comportamiento SPA normal, correcto para /feed, /login, /auth/callback…).
// Para /p/:id eso significa que un enlace pegado en WhatsApp, Telegram,
// Facebook o X se ve como texto plano: esos rastreadores NO ejecutan
// JavaScript, así que nunca llegan a ver lo que React pintaría después. No
// hay forma de arreglar esto desde React (`react-helmet`/`useEffect` se ven
// perfectos en el navegador y no existen para el rastreador).
//
// Este Worker intercepta SOLO /p/:id: le pide la ficha al backend, inyecta
// meta tags Open Graph/Twitter Card en el <head> del index.html real (con
// HTMLRewriter, en streaming, sin cargar el documento completo en memoria) y
// sirve eso en lugar del index.html genérico. Todo lo demás — /feed, /login,
// /auth/callback, cualquier archivo estático — pasa de largo a
// `env.ASSETS.fetch()`, que es EXACTAMENTE lo que Workers Static Assets
// hacía antes de que este archivo existiera. El fallback de SPA
// (`not_found_handling`) sigue viviendo en wrangler.jsonc, intacto.
//
// Si alguien quita `main` de wrangler.jsonc y deja solo `assets`, las fichas
// desaparecen SIN QUE NADA FALLE NI AVISE: /p/:id vuelve a servir el
// index.html genérico, indistinguible de un error de configuración menor.
// Ese silencio es la trampa — por eso esta nota vive también en
// wrangler.jsonc y en frontend/README.md, no solo aquí.

const UNA_HORA_MS = 60 * 60 * 1000;
const UN_DIA_MS = 24 * UNA_HORA_MS;
const TIMEOUT_BACKEND_MS = 1500;
const CACHED_AT_HEADER = 'X-Wt-Cached-At';

const RUTA_POST = /^\/p\/(\d+)\/?$/;

// URL del backend: CONFIGURABLE, nunca incrustada (criterio 8 de
// HU-SHR-002). Vive en `vars.PREVIEW_API_URL` de wrangler.jsonc; en
// producción apunta a weedtown-api.onrender.com, en `wrangler dev` local cae
// al backend de desarrollo. Se puede sobreescribir sin tocar código:
// `wrangler dev --var PREVIEW_API_URL:http://localhost:4010`.
function urlBackend(env) {
  return (env.PREVIEW_API_URL || 'http://localhost:4000').replace(/\/$/, '');
}

// ---------- Ficha genérica (fallback de WeedTown, sin datos de ningún posteo) ----------

function fichaGenerica(url) {
  return {
    titulo: 'WeedTown',
    descripcion: 'La red social de la comunidad cannábica de México. Un espacio seguro, con respeto y sin estigma.',
    imagen: `${url.origin}/campaign/placeholder-default.png`,
    imagenAlt: 'WeedTown — la red social de la comunidad cannábica de México',
    tieneImagen: false
  };
}

// ---------- Pedirle la ficha al backend, con timeout duro (Trampa T2) ----------
//
// Tres resultados posibles, y la distinción entre los dos últimos es la que
// gobierna la última fila de la tabla de caché: un 404 EXPLÍCITO del backend
// (el posteo no existe, es privado, o está oculto) no es lo mismo que un
// fallo de red o un timeout (T8: el backend probablemente está dormido).
async function pedirFicha(id, env) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_BACKEND_MS);
  try {
    const res = await fetch(`${urlBackend(env)}/api/posts/${id}/preview`, { signal: controller.signal });
    if (res.status === 404) return { estado: 'no_encontrado' };
    if (!res.ok) return { estado: 'fallo' };
    return { estado: 'ok', ficha: await res.json() };
  } catch {
    // AbortError (timeout) o error de red: mismo tratamiento — no es un 404.
    return { estado: 'fallo' };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- Inyección de meta tags (Trampa T1, la más grave de este ciclo) ----------
//
// NOTA DE IMPLEMENTACIÓN (esto salió distinto de lo planeado — el plan pedía
// "HTMLRewriter con setAttribute" y el código manda sobre el plan):
//
// El diseño original era en DOS pasos — inyectar un esqueleto vacío con
// `head.append(html, {html:true})` y, en un segundo handler registrado sobre
// `meta[data-wt]`, rellenar cada uno con `element.setAttribute()` (que
// escapa el valor por su cuenta). Probado en vivo con `wrangler dev`, ese
// segundo paso NUNCA se dispara: el contenido insertado por `append` no se
// vuelve a pasar por los selectores de ESTE MISMO `HTMLRewriter` — el <head>
// resultante se queda con `data-wt="titulo"` y `content=""` sin rellenar.
// No es un matiz menor: es exactamente el tipo de cosa que "se ve bien" en
// el código y falla en silencio, así que quedó documentado en vez de
// enviarse así.
//
// La alternativa real y segura: escapar los valores A MANO y armar la
// etiqueta completa YA rellena en un solo `append`. Sigue sin haber una sola
// concatenación sin escapar: `escaparAtributo` corre sobre cada valor ANTES
// de entrar al template, nunca al revés.
//
// SEGUNDO HALLAZGO en la misma prueba: `titulo` NO se re-escapa aquí a
// propósito. `preview.js` en el backend ya lo escapa (es criterio de
// aceptación explícito de HU-SHR-001, verificado en
// backend/tests/preview.test.js) — volver a pasarlo por `escaparAtributo`
// lo rompe dos veces: un `&quot;` ya escapado se vuelve `&amp;quot;`, y ESO
// es lo que se ve, literal, en la ficha ("&quot;" en vez de una comilla).
// `descripcion` es un string fijo que este mismo proyecto controla, sin
// datos de ningún posteo — tampoco necesita esta capa.
// `imagen` SÍ se escapa: es una URL que viene de `Post.image`, y la validación
// del backend (`IMAGE_URL_RE`, en postRoutes.js) solo exige "sin espacios" —
// `"`, `<`, `>` pasan esa regex sin problema, así que aquí es donde de verdad
// hace falta la defensa. `imagenAlt` y `url` se escapan por consistencia
// (developer-controlled, pero cuesta cero y evita sorpresas si el manifiesto
// de campaña algún día trae una comilla).
function escaparAtributo(valor) {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function construirMetaTags(datos) {
  const titulo = datos.titulo;
  const descripcion = datos.descripcion;
  const imagen = escaparAtributo(datos.imagen);
  const imagenAlt = escaparAtributo(datos.imagenAlt);
  const ogUrl = escaparAtributo(datos.url);
  return `
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="${descripcion}">
<meta property="og:image" content="${imagen}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${imagenAlt}">
<meta property="og:url" content="${ogUrl}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="WeedTown">
<meta property="og:locale" content="es_MX">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${titulo}">
<meta name="twitter:description" content="${descripcion}">
<meta name="twitter:image" content="${imagen}">
`;
}

class InyectarMeta {
  constructor(datos) {
    this.datos = datos;
  }
  element(head) {
    // {html:true} es seguro AQUÍ porque construirMetaTags ya escapó cada
    // valor dinámico antes de interpolarlo — nunca al revés.
    head.append(construirMetaTags(this.datos), { html: true });
  }
}

// og:image:width/height quedan fijos en 1200x630 (el formato primario de la
// campaña, D2 del plan) también cuando la imagen es propia del posteo, que
// puede tener otras proporciones. Es una imprecisión aceptada: las redes
// usan esas dos etiquetas como sugerencia de layout, no como verdad
// absoluta, y siguen inspeccionando el archivo real antes de mostrarlo.
function datosMeta(ficha, url, id) {
  const generica = fichaGenerica(url);
  return {
    titulo: ficha.titulo || generica.titulo,
    descripcion: ficha.descripcion || generica.descripcion,
    imagen: ficha.imagen || generica.imagen,
    imagenAlt: ficha.imagenAlt || generica.imagenAlt,
    // Canónica y sin los parámetros con que haya llegado (criterio 3): se
    // arma con el origen real de la petición + la ruta limpia, nunca con
    // `url.href` tal cual llegó.
    url: `${url.origin}/p/${id}`
  };
}

async function armarHtmlConMeta(env, url, datos) {
  const indexRes = await env.ASSETS.fetch(new URL('/index.html', url));
  const transformado = new HTMLRewriter()
    .on('head', new InyectarMeta(datos))
    .transform(indexRes);
  const headers = new Headers(transformado.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(transformado.body, { status: 200, headers });
}

// ---------- La tabla de caché resistente (Trampa T8, la más costosa del ciclo) ----------
//
// Render (plan gratuito) apaga el backend a los ~15 min de inactividad y
// tarda 30-60s en despertar — muy por encima del timeout de 1.5s de
// cualquier rastreador. Sin esto, todo enlace compartido tras un rato de
// calma mostraría la ficha genérica, con un síntoma intermitente e
// imposible de reproducir en pruebas.
//
//   fresca (<1h)  → se sirve tal cual, no se toca el backend
//   rancia (<24h) → se sirve tal cual IGUAL, y se refresca aparte
//                   (ctx.waitUntil): si el refresco falla, nadie lo nota,
//                   porque el cliente ya recibió la rancia
//   sin caché     → se intenta construir; si el backend falla o tarda, cae
//                   a la genérica (sin guardarla: el próximo intento
//                   reintenta solo)
//   backend 404   → invalida cualquier caché vieja y sirve la genérica,
//                   para que un posteo borrado/oculto no sobreviva 24h
//
// El límite aceptado (documentado en el plan, no se resuelve aquí): un
// enlace que NUNCA se expandió antes cae en la genérica si el backend está
// dormido en ese primer intento — hace falta que alguien lo abra una vez
// para que quede cacheado.
//
// Verificado en vivo con `wrangler dev` acortando temporalmente estas dos
// constantes (1s/24s en vez de 1h/24h): las cinco filas de la tabla se
// comportan tal cual arriba — caché fresca sin tocar backend, caché rancia
// servida al instante con refresco aparte que sí actualiza la caché, 404
// explícito que invalida y no revive. Un matiz de `wrangler dev` local (NO
// necesariamente de producción, no se pudo confirmar contra el edge real):
// el tiempo que tarda en responder el cliente cuando se dispara
// `ctx.waitUntil()` pareció incluir parte del trabajo en segundo plano, en
// vez de devolver la rancia con latencia cero — el CONTENIDO servido siempre
// fue el correcto (la rancia, no la recién refrescada), solo la latencia
// observada localmente no fue tan baja como debería ser en el edge real.
async function servirFichaDePost(id, env, ctx, url) {
  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/p/${id}`, { method: 'GET' });
  const cacheada = await cache.match(cacheKey);

  if (cacheada) {
    const cacheadaEn = Number(cacheada.headers.get(CACHED_AT_HEADER)) || 0;
    const edadMs = Date.now() - cacheadaEn;
    if (edadMs < UNA_HORA_MS) {
      return cacheada;
    }
    if (edadMs < UN_DIA_MS) {
      ctx.waitUntil(refrescarEnSegundoPlano(id, env, cache, cacheKey, url));
      return cacheada;
    }
    // >= 24h: se guardó con max-age=86400, así que en la práctica la Cache
    // API ya la habrá evictado sola. Si por lo que sea sigue aquí, se cae al
    // camino de "sin caché" de abajo, que es lo correcto para algo de un
    // día de antigüedad.
  }

  const resultado = await pedirFicha(id, env);

  if (resultado.estado === 'no_encontrado') {
    ctx.waitUntil(cache.delete(cacheKey));
    return armarHtmlConMeta(env, url, datosMeta(fichaGenerica(url), url, id));
  }
  if (resultado.estado === 'fallo') {
    return armarHtmlConMeta(env, url, datosMeta(fichaGenerica(url), url, id));
  }

  const respuesta = await armarHtmlConMeta(env, url, datosMeta(resultado.ficha, url, id));
  respuesta.headers.set('Cache-Control', 'public, max-age=86400');
  respuesta.headers.set(CACHED_AT_HEADER, String(Date.now()));
  ctx.waitUntil(cache.put(cacheKey, respuesta.clone()));
  return respuesta;
}

async function refrescarEnSegundoPlano(id, env, cache, cacheKey, url) {
  const resultado = await pedirFicha(id, env);
  if (resultado.estado === 'no_encontrado') {
    await cache.delete(cacheKey);
    return;
  }
  if (resultado.estado === 'fallo') return; // sigue fallando: se deja la rancia como está

  const respuesta = await armarHtmlConMeta(env, url, datosMeta(resultado.ficha, url, id));
  respuesta.headers.set('Cache-Control', 'public, max-age=86400');
  respuesta.headers.set(CACHED_AT_HEADER, String(Date.now()));
  await cache.put(cacheKey, respuesta);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const match = request.method === 'GET' ? RUTA_POST.exec(url.pathname) : null;

    // Todo lo que no sea GET /p/:id pasa de largo — MISMO comportamiento y
    // MISMA latencia que Workers Static Assets sin este archivo (criterio 7:
    // verificado con wrangler dev, no asumido). Nada de detectar User-Agent
    // (criterio 1): las meta tags son inocuas para un navegador, y
    // sniffear UA para decidir qué servir es frágil y se considera cloaking.
    if (!match) {
      return env.ASSETS.fetch(request);
    }

    const id = match[1];
    try {
      return await servirFichaDePost(id, env, ctx, url);
    } catch (e) {
      // Trampa T4: cualquier fallo responde 200 con el SPA, nunca un error.
      // Esto es la red de seguridad para lo verdaderamente inesperado (la
      // Cache API o HTMLRewriter truenan) — los fallos previstos (backend
      // caído, 404, timeout) ya se resuelven arriba con la ficha genérica.
      console.error(`Error armando la ficha de /p/${id}, sirviendo el SPA sin meta tags:`, e);
      return env.ASSETS.fetch(request);
    }
  }
};
