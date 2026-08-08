// Validación y anonimizado de imágenes en el cliente (HU-WT-IMG-001)
// Re-encodar vía canvas produce un binario nuevo SIN metadatos (EXIF, GPS, etc.):
// el archivo original nunca sale del navegador.

export const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB — límite de SUBIDA; se evalúa sobre el resultado ya comprimido, no aquí
// Techo de INGESTA, no de subida: solo evita reventar la memoria del canvas
// con un archivo absurdo. Una foto de celular de 12 MP pesa 4-8 MB en origen
// y queda en ~600 kB tras sanitizeImage — si este techo fuera el mismo que
// MAX_SIZE_BYTES, se rechazaría antes de que el pipeline tuviera oportunidad
// de comprimirla. Con la cámara directa como camino por defecto, ese bug deja
// de ser un caso raro y se vuelve el camino común.
const MAX_INGEST_BYTES = 30 * 1024 * 1024; // 30 MB
export const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_DIMENSION = 2048; // compresión ligera: limitar el lado mayor
const JPEG_QUALITY = 0.85;

function extensionValida(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

export function validateImage(file) {
  if (!file) return 'No se seleccionó ningún archivo';
  // El MIME es la fuente de verdad — es lo que multer ya valida en el
  // backend. La extensión del nombre queda solo de respaldo: las capturas de
  // cámara en algunos navegadores/WebViews llegan con nombres sin extensión
  // utilizable (`image`, `capture`, un UUID) aunque el archivo sea un JPEG
  // válido, y con el chequeo anterior (por extensión) se rechazaban.
  const formatoValido = file.type ? ALLOWED_MIME_TYPES.includes(file.type) : extensionValida(file);
  if (!formatoValido) {
    const detalle = file.type || `.${(file.name.split('.').pop() || '?').toLowerCase()}`;
    return `Formato no permitido (${detalle}). Usa JPG, PNG o WebP`;
  }
  if (file.size > MAX_INGEST_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `La imagen pesa ${mb} MB; es demasiado grande para procesarla`;
  }
  return null;
}

export async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    // createImageBitmap respeta la orientación EXIF antes de descartarla
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

// Devuelve un File nuevo re-encodado (sin metadatos), con downscale ligero si es enorme
export async function sanitizeImage(file) {
  const source = await decodeImage(file);
  const srcW = source.width;
  const srcH = source.height;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(source, 0, 0, width, height);
  if (source.close) source.close();

  // PNG se mantiene sin pérdida; JPG/WebP salen como JPEG (soporte universal de export)
  const isPng = file.type === 'image/png';
  const outType = isPng ? 'image/png' : 'image/jpeg';
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode'))), outType, isPng ? undefined : JPEG_QUALITY);
  });

  // El límite de SUBIDA (5 MB) se evalúa aquí, sobre el resultado ya
  // reescalado y comprimido — no sobre el archivo original. Ver validateImage.
  if (blob.size > MAX_SIZE_BYTES) {
    throw new Error('No se pudo comprimir la imagen por debajo de 5 MB; usa una más ligera');
  }
  // Nombre genérico: el nombre original también puede contener datos personales
  return new File([blob], isPng ? 'imagen.png' : 'imagen.jpg', { type: outType });
}

// ---------------------------------------------------------------------------
// Editor de recorte y rotación (ciclo 9D)
//
// DÓNDE ENCAJA, que es lo único que no se negocia: esto corre DESPUÉS de
// `sanitizeImage` y antes de subir. La imagen que entra aquí ya salió de un
// canvas, o sea que ya es un binario nuevo sin EXIF ni GPS; lo de abajo
// vuelve a pasarla por canvas, así que tampoco puede reintroducir metadatos —
// `drawImage` copia píxeles, no bloques EXIF, y `toBlob` escribe un archivo
// desde cero. Si algún día alguien mueve el editor ANTES de sanitizeImage, la
// foto original con sus coordenadas GPS sería la que se decodifica, y aunque
// la salida saldría igual de limpia, el archivo con GPS habría estado vivo en
// memoria más tiempo del necesario y el orden dejaría de ser demostrable.
//
// Y el punto de fondo, que conviene no perder: recortar es una herramienta de
// PRIVACIDAD. El EXIF ya se limpiaba; esto quita del encuadre lo que el EXIF
// nunca cubrió — una placa, el rótulo de una calle, una cara al fondo — antes
// de que la imagen salga del dispositivo.

/**
 * Gira 90° en sentido horario. Devuelve un `<canvas>` nuevo, no un archivo:
 * girar varias veces encadena copias en memoria sin re-encodear ni una sola
 * vez, así que no hay pérdida acumulada por más vueltas que se den. El único
 * encode del editor ocurre en `exportarRecorte`.
 *
 * Solo múltiplos de 90°: no hay interpolación, ni bordes que rellenar, ni
 * lienzo que recalcular. Un ángulo libre cuesta mucho más y resuelve un caso
 * mucho más raro que "la foto salió acostada".
 */
export function rotar90(fuente) {
  const canvas = document.createElement('canvas');
  canvas.width = fuente.height;
  canvas.height = fuente.width;
  const ctx = canvas.getContext('2d');
  // Con la traslación al ancho nuevo, el píxel (x,y) del origen cae en
  // (alto − y, x): la esquina superior izquierda termina arriba a la derecha,
  // que es exactamente girar en sentido horario.
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(fuente, 0, 0);
  return canvas;
}

/**
 * Aplica el recorte (normalizado 0..1) y devuelve el File listo para subir.
 * @param {CanvasImageSource & {width:number, height:number}} fuente
 * @param {{x:number,y:number,w:number,h:number}} recorte
 * @param {string} tipo MIME de salida; se conserva el de entrada.
 */
export async function exportarRecorte(fuente, recorte, tipo) {
  const anchoFuente = fuente.width;
  const altoFuente = fuente.height;
  const sx = Math.round(recorte.x * anchoFuente);
  const sy = Math.round(recorte.y * altoFuente);
  const sw = Math.max(1, Math.min(Math.round(recorte.w * anchoFuente), anchoFuente - sx));
  const sh = Math.max(1, Math.min(Math.round(recorte.h * altoFuente), altoFuente - sy));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext('2d').drawImage(fuente, sx, sy, sw, sh, 0, 0, sw, sh);

  const esPng = tipo === 'image/png';
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode'))), tipo, esPng ? undefined : JPEG_QUALITY);
  });

  // Se vuelve a MEDIR, no a suponer (criterio 4 del ciclo). Recortar siempre
  // quita píxeles, pero rotar no quita ninguno y re-encodear puede dar un
  // archivo un poco más pesado que el que entró — sobre todo en PNG, cuyo
  // compresor depende de cómo quedan las filas de píxeles y por lo tanto de la
  // orientación. Es el mismo tope y el mismo mensaje que sanitizeImage.
  if (blob.size > MAX_SIZE_BYTES) {
    throw new Error('La imagen editada supera los 5 MB; recorta un poco más o usa una más ligera');
  }
  return new File([blob], esPng ? 'imagen.png' : 'imagen.jpg', { type: tipo });
}
