// Avatares pixel art generados (ver src/lib/avatar.js).
//
// Público a propósito: los avatares se ven en perfiles públicos y en el feed
// sin sesión, igual que antes se veía la foto de Mastodon.
//
// No guarda nada. La semilla ES la URL, así que el mismo enlace da siempre el
// mismo dibujo y se puede cachear para siempre. No hay archivos que borrar ni
// huérfanos que limpiar — a diferencia de las imágenes subidas.
const express = require('express');
const router = express.Router();

const avatar = require('../lib/avatar');

// GET /api/avatars/catalogo — piezas disponibles, para pintar el estudio
router.get('/catalogo', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(avatar.catalogo());
});

// GET /api/avatars/{semilla}.svg
router.get('/:semilla.svg', (req, res) => {
  const svg = avatar.render(req.params.semilla);
  if (!svg) return res.status(404).json({ error: 'Semilla de avatar inválida' });

  res.set({
    'Content-Type': 'image/svg+xml; charset=utf-8',
    // El contenido de esta URL no puede cambiar: la semilla lo determina por
    // completo y el catálogo está versionado.
    'Cache-Control': 'public, max-age=31536000, immutable',
    // El SVG se genera aquí y no contiene nada externo, pero se marca igual
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'"
  });
  res.send(svg);
});

module.exports = router;
