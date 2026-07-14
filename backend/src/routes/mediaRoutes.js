// Subida de imágenes para posts y comentarios (HU-WT-IMG-001)
// El front envía la imagen ya anonimizada (sin EXIF/GPS); aquí se valida de nuevo
// tamaño y tipo como defensa en profundidad, y se guarda con nombre aleatorio.
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const prisma = require('../lib/prisma');
const { requireAuth } = require('../middlewares/requireAuth');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    // Nombre aleatorio: nunca conservar el nombre original (puede contener datos personales)
    const ext = ALLOWED[file.mimetype] || '.bin';
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED[file.mimetype]) {
      return cb(new Error('TIPO_NO_PERMITIDO'));
    }
    cb(null, true);
  }
});

// POST /api/media/upload — multipart/form-data, campo "image"
router.post('/upload', requireAuth, (req, res) => {
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

    const url = `${process.env.BACKEND_URL || 'http://localhost:4000'}/uploads/${req.file.filename}`;
    try {
      // Registro en Media para trazabilidad/moderación futura
      await prisma.media.create({ data: { url, userId: req.user.id } });
    } catch (e) {
      console.error('No se pudo registrar la imagen en Media:', e);
    }
    res.json({ url });
  });
});

module.exports = router;
