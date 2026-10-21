// Baja en un clic (ciclo 22, B25). Rutas PÚBLICAS: no llevan sesión, la autorización
// es el token firmado del enlace (ver src/lib/bajaCorreo.js).
//
//   GET  /api/baja/info?token=…   qué finalidad es, sin cambiar nada (para pintar la página)
//   POST /api/baja?token=…        apaga ESA finalidad (idempotente)
//
// POR QUÉ LA BAJA ES UN POST Y NO UN GET. Los antivirus y los clientes de correo
// «visitan» los enlaces de un mensaje para revisarlos; si una visita bastara para
// apagar la finalidad, un escáner daría de baja a la gente sin que lo pidiera. La
// página pide la baja por POST al cargar (un clic para la persona) y el cliente de
// correo hace su propio POST con la cabecera `List-Unsubscribe-Post` (RFC 8058): el
// token viaja en la URL y el cuerpo es el formulario fijo `List-Unsubscribe=One-Click`.
//
// QUÉ NO DICE. La respuesta es la misma exista o no la cuenta, y no lleva ningún dato
// de la persona: solo la finalidad y su estado. Un error de más no ayuda a nadie a
// probar cuentas.
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const { verificarBaja } = require('../lib/bajaCorreo');
const { FINALIDADES, establecer } = require('../lib/consentimientos');
const { log } = require('../lib/logger');

// Un tope generoso y propio: llegan visitas de escáneres desde pocas IPs.
const limitador = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta de nuevo en unos minutos.' }
});

const tokenDe = (req) => (typeof req.query.token === 'string' ? req.query.token : req.body?.token);

router.get('/info', limitador, (req, res) => {
  const datos = verificarBaja(tokenDe(req));
  if (!datos) return res.status(400).json({ error: 'Este enlace no es válido' });
  res.json({ finalidad: datos.finalidad, titulo: FINALIDADES[datos.finalidad].titulo });
});

router.post('/', limitador, async (req, res) => {
  const datos = verificarBaja(tokenDe(req));
  if (!datos) return res.status(400).json({ error: 'Este enlace no es válido' });
  try {
    const resultado = await establecer(datos.userId, datos.finalidad, false);
    log('baja_por_enlace', { userId: datos.userId, finalidad: datos.finalidad, requestId: req.id });
    res.json({ finalidad: datos.finalidad, titulo: FINALIDADES[datos.finalidad].titulo, estado: resultado.estado });
  } catch (e) {
    console.error('Error al procesar una baja:', e);
    res.status(500).json({ error: 'No se pudo procesar la baja. Inténtalo de nuevo.' });
  }
});

module.exports = router;
