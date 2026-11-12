// B42: quita los metadatos de las imágenes que YA están en el almacenamiento (Supabase Storage).
//
// Desde el ciclo 23B el servidor depura toda subida nueva. Las anteriores que entraron por la
// API directa pudieron quedarse con coordenadas, fabricante o comentarios. Este script las
// recorre una por una, en serie.
//
//   Solo mirar (por omisión, no cambia nada):
//     node scripts/depurar-imagenes-guardadas.js
//
//   Aplicar (respalda cada original antes de reemplazarlo):
//     node scripts/depurar-imagenes-guardadas.js --aplicar --respaldo "D:\_Para_Revision_y_Purga\AAAA-MM-DD_imagenes_wt"
//
// Variables de entorno (solo en la ventana de la terminal; nunca en un archivo del repo):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY y, si no es la de siempre, SUPABASE_BUCKET.
//
// Reglas:
//   - Las imágenes con orientación EXIF distinta de 1 NO se tocan: sin el EXIF se verían
//     giradas. Se listan para decidir aparte.
//   - Lo que no se puede analizar no se toca.
//   - --aplicar exige --respaldo, y el respaldo no puede quedar dentro de OneDrive: los
//     originales llevan justo los datos que se quieren quitar.
//   - Nunca imprime la llave.
const fs = require('fs');
const path = require('path');
const { clasificar, mimeDeClave } = require('./lib/depurar-guardadas');

const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const iRespaldo = args.indexOf('--respaldo');
const RESPALDO = iRespaldo >= 0 ? args[iRespaldo + 1] : null;

function salir(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

const BASE = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const LLAVE = process.env.SUPABASE_SERVICE_KEY || '';
const BUCKET = process.env.SUPABASE_BUCKET || 'weedtown-media';
if (!BASE || !LLAVE) salir('Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY en el entorno de esta terminal.');
if (APLICAR) {
  if (!RESPALDO) salir('--aplicar exige --respaldo <carpeta> para guardar cada original antes de reemplazarlo.');
  if (/onedrive/i.test(path.resolve(RESPALDO))) salir('El respaldo no puede quedar dentro de OneDrive: los originales llevan los metadatos que se quieren quitar.');
}

const cabeceras = { Authorization: `Bearer ${LLAVE}`, apikey: LLAVE };

async function listar(prefijo = '') {
  const claves = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${BASE}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { ...cabeceras, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: prefijo, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!r.ok) salir(`No se pudo listar el almacenamiento (HTTP ${r.status}).`);
    const items = await r.json();
    for (const it of items) {
      const clave = prefijo ? `${prefijo}/${it.name}` : it.name;
      if (it.id === null) claves.push(...(await listar(clave))); // carpeta
      else claves.push({ clave, cache: it.metadata?.cacheControl });
    }
    if (items.length < 1000) break;
  }
  return claves;
}

async function bajar(clave) {
  const r = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${clave}`, { headers: cabeceras });
  if (!r.ok) throw new Error(`HTTP ${r.status} al bajar`);
  return Buffer.from(await r.arrayBuffer());
}

async function reemplazar(clave, buffer, mimetype, cache) {
  const r = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${clave}`, {
    method: 'PUT',
    headers: { ...cabeceras, 'Content-Type': mimetype, 'cache-control': cache || 'public, max-age=2592000' },
    body: buffer,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} al reemplazar`);
}

(async () => {
  console.log(`${APLICAR ? 'APLICAR' : 'SOLO MIRAR (no cambia nada)'} · bucket ${BUCKET}`);
  const objetos = await listar();
  const cuenta = { total: objetos.length, no_imagen: 0, limpia: 0, con_metadatos: 0, orientacion: 0, no_analizable: 0, error: 0, reemplazadas: 0 };
  const detalle = { con_metadatos: [], orientacion: [], no_analizable: [], error: [] };

  for (const { clave, cache } of objetos) {
    const mime = mimeDeClave(clave);
    if (!mime) { cuenta.no_imagen++; continue; }
    let original;
    try { original = await bajar(clave); } catch (e) { cuenta.error++; detalle.error.push(`${clave}: ${e.message}`); continue; }
    const c = clasificar(original, mime);
    cuenta[c.estado]++;
    if (c.estado === 'orientacion') detalle.orientacion.push(`${clave} (orientación ${c.orientacion})`);
    if (c.estado === 'no_analizable') detalle.no_analizable.push(`${clave}: ${c.motivo}`);
    if (c.estado !== 'con_metadatos') continue;
    detalle.con_metadatos.push(`${clave} (−${c.bytes_quitados} bytes)`);
    if (!APLICAR) continue;
    try {
      const destino = path.join(RESPALDO, clave);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, original);
      if (fs.statSync(destino).size !== original.length) throw new Error('el respaldo no quedó completo');
      await reemplazar(clave, c.limpia, mime, cache);
      cuenta.reemplazadas++;
    } catch (e) {
      cuenta.error++;
      detalle.error.push(`${clave}: ${e.message} (el original no se tocó si el respaldo falló)`);
    }
  }

  console.log('\nResumen:', JSON.stringify(cuenta));
  for (const [k, lista] of Object.entries(detalle)) {
    if (lista.length) console.log(`\n${k} (${lista.length}):\n  ${lista.join('\n  ')}`);
  }
  if (APLICAR) {
    const informe = path.join(RESPALDO, 'informe.json');
    fs.writeFileSync(informe, JSON.stringify({ fecha: new Date().toISOString(), bucket: BUCKET, cuenta, detalle }, null, 2));
    console.log(`\nOriginales e informe en ${RESPALDO}`);
  } else if (cuenta.con_metadatos) {
    console.log('\nNada se cambió. Para aplicar: --aplicar --respaldo <carpeta fuera de OneDrive>');
  }
  if (cuenta.error) process.exitCode = 1;
})().catch((e) => salir(e.message));
