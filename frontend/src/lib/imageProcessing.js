// Validación y anonimizado de imágenes en el cliente (HU-WT-IMG-001)
// Re-encodar vía canvas produce un binario nuevo SIN metadatos (EXIF, GPS, etc.):
// el archivo original nunca sale del navegador.

export const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_DIMENSION = 2048; // compresión ligera: limitar el lado mayor
const JPEG_QUALITY = 0.85;

export function validateImage(file) {
  if (!file) return 'No se seleccionó ningún archivo';
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `Formato no permitido (.${ext}). Usa: ${ALLOWED_EXTENSIONS.map(e => '.' + e).join(', ')}`;
  }
  if (file.size > MAX_SIZE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `La imagen pesa ${mb} MB; el máximo es 5 MB`;
  }
  return null;
}

async function decodeImage(file) {
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

  if (blob.size > MAX_SIZE_BYTES) {
    throw new Error('La imagen procesada sigue excediendo 5 MB; usa una más ligera');
  }
  // Nombre genérico: el nombre original también puede contener datos personales
  return new File([blob], isPng ? 'imagen.png' : 'imagen.jpg', { type: outType });
}
