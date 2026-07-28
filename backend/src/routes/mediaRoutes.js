// Subida de imágenes para posts y comentarios (HU-WT-IMG-001)
// El front envía la imagen ya anonimizada (sin EXIF/GPS); aquí se valida de nuevo
// tamaño y tipo como defensa en profundidad, y se guarda con nombre aleatorio.
//
// El archivo se recibe en memoria y lo persiste src/lib/storage.js según el
// driver configurado (disco local en desarrollo, Supabase Storage en producción).
const express = require('express');
const multer = require('multer');
const router = express.Router();

const prisma = require('../lib/prisma');
const storage = require('../lib/storage');
const { requireAuth, requireNotSuspended } = require('../middlewares/requireAuth');

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED[file.mimetype]) {
      return cb(new Error('TIPO_NO_PERMITIDO'));
    }
    cb(null, true);
  }
});

// POST /api/media/upload — multipart/form-data, campo "image"
router.post('/upload', requireAuth, requireNotSuspended, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'La imagen no puede pesar más de 5 MB' });
      }
      if (err.message === 'TIPO_NO_PERMITIDO') {
        return res.status(400).json({ error: 'Formato no permitido. Usa JPG, PNG o WebP' });
      }
      console.error('Error al subir imagen:', err);
      return res.status(400).json({ error: 'No se pudo subir la imagen' });
    }
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });

    try {
      const { url } = await storage.save({
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        ext: ALLOWED[req.file.mimetype]
      });

      // Registro en Media para trazabilidad/moderación futura
      try {
        await prisma.media.create({ data: { url, userId: req.user.id } });
      } catch (e) {
        console.error('No se pudo registrar la imagen en Media:', e);
      }

      res.json({ url });
    } catch (e) {
      console.error('Error al guardar la imagen:', e);
      res.status(500).json({ error: 'No se pudo guardar la imagen' });
    }
  });
});

module.exports = router;
