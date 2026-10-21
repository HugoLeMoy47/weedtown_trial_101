// Rutas internas, para tareas programadas (ciclo 22). NO son de la app: las llama un
// cron (el workflow `avisos-diarios.yml` de GitHub Actions) con un secreto compartido.
//
//   POST /api/interno/avisos-diarios      corre el resumen diario de actividad por correo
//
// POR QUÉ UNA RUTA Y NO UN TEMPORIZADOR DENTRO DEL PROCESO. El backend gratuito de
// Render se duerme sin tráfico: un `setInterval` dentro del proceso no corre cuando no
// hay nadie, y corre varias veces si hay varias instancias. Un cron externo que llama a
// esta ruta despierta el servicio y corre UNA vez; y aunque se llamara dos veces el tope
// de un correo al día por persona lo impide.
//
// EL SECRETO. `CRON_SECRET` en el entorno del backend (y como secreto del repositorio en
// GitHub). SIN esa variable la ruta NO EXISTE (404): una ruta que manda correo no puede
// quedar abierta por un olvido de configuración. Con ella, se compara en tiempo constante.
// La respuesta lleva solo cuentas, nunca a quién se le escribió.
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const prisma = require('../lib/prisma');
const mailer = require('../lib/mailer');
const { enviarAvisosDiarios } = require('../lib/avisosActividad');
const { log } = require('../lib/logger');

const limitador = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones.' }
});

/** El secreto recibido, comparado con el configurado sin filtrar cuánto coincide. */
function secretoValido(recibido, esperado) {
  if (typeof recibido !== 'string' || !esperado) return false;
  const a = crypto.createHash('sha256').update(recibido).digest();
  const b = crypto.createHash('sha256').update(esperado).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Cierra la ruta si no hay secreto configurado y exige el correcto si lo hay. */
function exigirSecreto(req, res, next) {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) return res.status(404).json({ error: 'No encontrado' });
  if (!secretoValido(req.get('x-cron-secret'), esperado)) return res.status(401).json({ error: 'No autorizado' });
  next();
}

router.post('/avisos-diarios', limitador, exigirSecreto, async (req, res) => {
  try {
    const resumen = await enviarAvisosDiarios({ prisma, mailer });
    log('avisos_diarios', { ...resumen, requestId: req.id });
    res.json(resumen);
  } catch (e) {
    console.error('Error en los avisos diarios:', e);
    res.status(500).json({ error: 'Error al correr los avisos diarios' });
  }
});

module.exports = router;
module.exports.secretoValido = secretoValido;
module.exports.exigirSecreto = exigirSecreto;
