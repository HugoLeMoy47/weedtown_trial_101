// Almacenamiento de imágenes subidas por la comunidad.
//
// Por qué existe esta capa: guardar en el disco del proceso funciona en local y
// se rompe en producción. En cualquier PaaS con sistema de archivos efímero
// (Render, Railway, Fly) las imágenes desaparecen en el primer redespliegue, y
// las URLs quedan cacheadas 30 días apuntando a nada.
//
// Drivers:
//   local     — disco del proceso. Es el default y sirve para desarrollo.
//   supabase  — Supabase Storage vía su API REST. Sin dependencias nuevas: usa
//               fetch (Node 18+) y la infraestructura que el proyecto ya tiene.
//
// Agregar un driver de S3/R2 es escribir un objeto más con este mismo contrato:
//   save({ buffer, mimetype, ext }) -> { url, key }
//   remove(key)                     -> void
//   keyFromUrl(url)                 -> string | null   (null = no es nuestra)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DRIVER = (process.env.STORAGE_DRIVER || 'local').toLowerCase();

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

function nombreAleatorio(ext) {
  // Nunca conservar el nombre original: puede contener datos personales
  return `${crypto.randomBytes(16).toString('hex')}${ext}`;
}

// ---------- Driver: disco local ----------

const local = {
  nombre: 'local',

  async save({ buffer, ext }) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const key = nombreAleatorio(ext);
    await fs.promises.writeFile(path.join(UPLOADS_DIR, key), buffer);
    const base = process.env.BACKEND_URL || 'http://localhost:4000';
    return { url: `${base}/uploads/${key}`, key };
  },

  // Devuelve true solo si había algo que borrar. Que el archivo ya no exista no
  // es un error (el borrado es idempotente), pero tampoco es un borrado.
  async remove(key) {
    // Defensa contra path traversal: la clave es siempre un nombre plano
    const destino = path.join(UPLOADS_DIR, path.basename(key));
    try {
      await fs.promises.unlink(destino);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') return false;
      throw err;
    }
  },

  keyFromUrl(url) {
    const m = /\/uploads\/([A-Za-z0-9._-]+)$/.exec(url || '');
    return m ? m[1] : null;
  }
};

// ---------- Driver: Supabase Storage ----------

function configSupabase() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY || '';
  const bucket = process.env.SUPABASE_BUCKET || 'weedtown-media';
  if (!base || !key) {
    throw new Error(
      'STORAGE_DRIVER=supabase requiere SUPABASE_URL y SUPABASE_SERVICE_KEY en el entorno'
    );
  }
  return { base, key, bucket };
}

const supabase = {
  nombre: 'supabase',

  async save({ buffer, mimetype, ext }) {
    const { base, key: serviceKey, bucket } = configSupabase();
    const key = nombreAleatorio(ext);
    const res = await fetch(`${base}/storage/v1/object/${bucket}/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': mimetype,
        'cache-control': 'public, max-age=2592000'
      },
      body: buffer
    });
    if (!res.ok) {
      throw new Error(`Supabase Storage respondió ${res.status} al subir la imagen`);
    }
    return { url: `${base}/storage/v1/object/public/${bucket}/${key}`, key };
  },

  // Mismo contrato que el driver local: true solo si había algo que borrar.
  async remove(key) {
    const { base, key: serviceKey, bucket } = configSupabase();
    const res = await fetch(`${base}/storage/v1/object/${bucket}/${key}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${serviceKey}` }
    });
    if (res.status === 404) return false; // ya no estaba
    if (!res.ok) {
      throw new Error(`Supabase Storage respondió ${res.status} al borrar la imagen`);
    }
    return true;
  },

  keyFromUrl(url) {
    const { base, bucket } = configSupabase();
    const prefijo = `${base}/storage/v1/object/public/${bucket}/`;
    if (!url || !url.startsWith(prefijo)) return null;
    const key = url.slice(prefijo.length);
    return /^[A-Za-z0-9._-]+$/.test(key) ? key : null;
  }
};

const drivers = { local, supabase };
const driver = drivers[DRIVER];
if (!driver) {
  throw new Error(`STORAGE_DRIVER desconocido: "${DRIVER}". Usa "local" o "supabase".`);
}
// Falla al arrancar, no en la primera subida, si falta configuración
if (DRIVER === 'supabase') configSupabase();

/**
 * Guarda una imagen y devuelve su URL pública.
 * @param {{buffer: Buffer, mimetype: string, ext: string}} archivo
 */
const save = (archivo) => driver.save(archivo);

/**
 * Borra el archivo detrás de una URL, si es una URL nuestra.
 *
 * Nunca intenta borrar URLs ajenas: el campo `image` acepta cualquier URL
 * http(s), así que puede apuntar a un servidor de terceros. Solo se actúa sobre
 * lo que este driver generó.
 *
 * No lanza: el borrado de archivos es limpieza, no debe tumbar la petición que
 * ya eliminó el contenido en la base.
 * @param {string|null} url
 * @returns {Promise<boolean>} true si se borró algo
 */
async function removeByUrl(url) {
  if (!url) return false;
  try {
    const key = driver.keyFromUrl(url);
    if (!key) return false;
    return await driver.remove(key);
  } catch (e) {
    console.error('No se pudo borrar la imagen', url, '-', e.message);
    return false;
  }
}

/** Borra varias URLs (ignora nulos y repetidos). */
async function removeMany(urls) {
  const unicas = [...new Set((urls || []).filter(Boolean))];
  const hechos = await Promise.all(unicas.map(removeByUrl));
  return hechos.filter(Boolean).length;
}

module.exports = { save, removeByUrl, removeMany, driver: driver.nombre, esLocal: DRIVER === 'local' };
