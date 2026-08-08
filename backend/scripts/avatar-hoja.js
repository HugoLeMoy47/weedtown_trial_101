// Hoja de contactos del catálogo de avatares.
//
// Para qué: antes de redibujar las piezas (brief `wt2`) hace falta VER lo que
// hay — cada pieza aislada, cada paleta, y una muestra del rango real. En la
// app los avatares aparecen a 32-40 px sueltos, que es justo el tamaño en el
// que no se puede juzgar nada.
//
// No toca código de producto: usa solo la API pública de src/lib/avatar.js
// (`render` y `catalogo`), así que sirve igual cuando el catálogo sea wt2.
//
//   node scripts/avatar-hoja.js            → escribe scripts/avatar-hoja.html
//   node scripts/avatar-hoja.js otra.html  → escribe donde le digas
const fs = require('fs');
const path = require('path');
const avatar = require('../src/lib/avatar');

const cat = avatar.catalogo();
const CLAVES = cat.ranuras.map(r => r.clave);
// Combo de referencia: Persona / Corto / Abiertos / Sonrisa / Ninguno / Terracota.
// Todas las variaciones se muestran contra esta base para que la única
// diferencia visible sea la pieza que se está mirando.
const BASE_REF = { base: 0, pelo: 0, ojos: 0, boca: 0, acc: 0, pal: 0 };

const semillaDe = (piezas) => [cat.version].concat(CLAVES.map(c => piezas[c] ?? 0)).join('-');

function variando(clave, indice) {
  return semillaDe({ ...BASE_REF, [clave]: indice });
}

function celda(semilla, etiqueta, nota = '') {
  const svg = avatar.render(semilla);
  if (!svg) return '';
  return `<figure class="celda">
    <div class="art">${svg}</div>
    <figcaption>${etiqueta}${nota ? `<span class="nota">${nota}</span>` : ''}<code>${semilla}</code></figcaption>
  </figure>`;
}

// --- Sección 1: cada pieza de cada ranura, aislada contra el combo de referencia
const secciones = cat.ranuras.map(ranura => {
  const celdas = ranura.opciones.map((nombre, i) => {
    // Dato real y útil para el rediseño: varias bases ignoran el peinado.
    const nota = ranura.clave === 'pelo' ? '' : '';
    return celda(variando(ranura.clave, i), nombre, nota);
  }).join('\n');
  return `<section>
    <h2>${ranura.etiqueta} <span class="cuenta">${ranura.opciones.length} piezas</span></h2>
    <div class="rejilla">${celdas}</div>
  </section>`;
}).join('\n');

// --- Sección 2: una misma cara en las 6 paletas, para juzgar el color aparte de la forma
const paletas = cat.ranuras.find(r => r.clave === 'pal');
const franjaPaletas = paletas.opciones
  .map((n, i) => celda(semillaDe({ ...BASE_REF, base: 1, pal: i }), n))
  .join('\n');

// --- Sección 3: muestra determinista del rango real (misma cada corrida, para comparar antes/después)
const muestra = [];
let s = 7;
const rnd = (max) => { s = (s * 1103515245 + 12345) % 2147483648; return s % max; };
for (let k = 0; k < 48; k++) {
  const piezas = {};
  cat.ranuras.forEach(r => { piezas[r.clave] = rnd(r.opciones.length); });
  muestra.push(celda(semillaDe(piezas), `#${k + 1}`));
}

const total = cat.ranuras.reduce((acc, r) => acc * r.opciones.length, 1);

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hoja de contactos — avatares ${cat.version}</title>
<style>
  :root { --bg:#f4f4ef; --raised:#fff; --ink:#1b1f19; --muted:#545c50; --line:#d9dcd0; --accent:#4f6b34; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#14170f; --raised:#1c2018; --ink:#e8eae2; --muted:#9ba394; --line:#2d332a; --accent:#9dc072; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .page { max-width:1100px; margin:0 auto; padding:2.5rem 1.25rem 5rem; }
  h1 { font-size:1.6rem; margin:0 0 .3rem; font-weight:600; }
  .sub { color:var(--muted); margin:0 0 1.5rem; font-size:.92rem; }
  .controles { position:sticky; top:0; z-index:5; background:var(--bg); border-bottom:1px solid var(--line);
               padding:.8rem 0; margin-bottom:1.5rem; display:flex; gap:1.2rem; align-items:center; flex-wrap:wrap; }
  .controles label { font-size:.85rem; color:var(--muted); display:flex; gap:.5rem; align-items:center; }
  h2 { font-size:1.1rem; margin:2rem 0 .8rem; font-weight:600; display:flex; align-items:baseline; gap:.6rem; }
  .cuenta { font-size:.78rem; color:var(--muted); font-weight:400; }
  .rejilla { display:grid; grid-template-columns:repeat(auto-fill,minmax(var(--celda,148px),1fr)); gap:.9rem; }
  .celda { margin:0; background:var(--raised); border:1px solid var(--line); padding:.7rem; text-align:center; }
  .art { display:flex; justify-content:center; align-items:center; }
  .art svg { width:var(--tam,128px); height:var(--tam,128px); image-rendering:pixelated; display:block; }
  figcaption { margin-top:.5rem; font-size:.8rem; color:var(--muted); display:flex; flex-direction:column; gap:.15rem; }
  figcaption code { font-size:.68rem; opacity:.6; font-family:ui-monospace,Consolas,monospace; }
  .fondo-claro .art { background:#f2efe6; }
  .fondo-oscuro .art { background:#1a1a1a; }
</style></head>
<body><div class="page">
  <h1>Hoja de contactos — catálogo <code>${cat.version}</code></h1>
  <p class="sub">Rejilla actual de 16×16 · ${total.toLocaleString('es-MX')} combinaciones · generada el ${new Date().toLocaleString('es-MX')}</p>

  <div class="controles">
    <label>Tamaño
      <input type="range" min="32" max="320" value="128" step="8"
             oninput="document.body.style.setProperty('--tam', this.value+'px');
                      document.body.style.setProperty('--celda', (+this.value+30)+'px');
                      document.getElementById('px').textContent = this.value">
      <b id="px">128</b> px
    </label>
    <label><input type="checkbox" onchange="document.body.classList.toggle('fondo-claro', this.checked)"> Fondo claro</label>
    <label><input type="checkbox" onchange="document.body.classList.toggle('fondo-oscuro', this.checked)"> Fondo oscuro</label>
  </div>

  <p class="sub">Cada pieza se muestra sobre el mismo combo de referencia (Persona · Corto · Abiertos · Sonrisa · sin accesorio · Terracota), así que lo único que cambia entre celdas es la pieza que se está mirando. <b>Ojo con el peinado:</b> varias bases lo ignoran a propósito (máscara, cráneo, plumas).</p>

  ${secciones}

  <section>
    <h2>La misma cara en las 6 paletas <span class="cuenta">para juzgar color aparte de forma</span></h2>
    <div class="rejilla">${franjaPaletas}</div>
  </section>

  <section>
    <h2>Muestra del rango real <span class="cuenta">48 combinaciones · determinista, comparable entre corridas</span></h2>
    <div class="rejilla">${muestra.join('\n')}</div>
  </section>
</div></body></html>`;

const destino = process.argv[2] || path.join(__dirname, 'avatar-hoja.html');
fs.writeFileSync(destino, html, 'utf8');
console.log(`Hoja escrita en ${destino}`);
console.log(`Catálogo ${cat.version}: ${cat.ranuras.map(r => `${r.clave}=${r.opciones.length}`).join(' · ')} → ${total.toLocaleString('es-MX')} combinaciones`);
