// Consentimientos por finalidad (ciclo 20). La lógica y los textos viven en
// src/lib/consentimientos.js; esto solo es el contrato HTTP.
//
// Estas rutas están en la lista de las que SÍ responden aunque la persona aún no
// haya aceptado la versión vigente de los Términos (ver `rutaPermitida…` en
// middlewares/requireAuth.js): la pantalla de la compuerta las usa.
const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middlewares/requireAuth');
const { listar, establecer, ErrorDeConsentimiento } = require('../lib/consentimientos');
const { log } = require('../lib/logger');

// GET /api/consentimientos — todas las finalidades, con su texto y el estado de
// quien pregunta.
router.get('/', requireAuth, async (req, res) => {
  try {
    res.json({ finalidades: await listar(req.user.id) });
  } catch (e) {
    console.error('Error al listar consentimientos:', e);
    res.status(500).json({ error: 'Error al obtener tus decisiones de privacidad' });
  }
});

// PUT /api/consentimientos/:finalidad { otorgado: boolean }
router.put('/:finalidad', requireAuth, async (req, res) => {
  try {
    const resultado = await establecer(req.user.id, req.params.finalidad, req.body?.otorgado);
    log('consentimiento_cambiado', {
      userId: req.user.id, finalidad: req.params.finalidad, estado: resultado.estado, version: resultado.version, requestId: req.id
    });
    res.json(resultado);
  } catch (e) {
    if (e instanceof ErrorDeConsentimiento) return res.status(e.estado).json({ error: e.message, codigo: e.codigo });
    console.error('Error al guardar un consentimiento:', e);
    res.status(500).json({ error: 'Error al guardar tu decisión' });
  }
});

module.exports = router;
