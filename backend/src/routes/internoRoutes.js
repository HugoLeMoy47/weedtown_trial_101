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
const { enviarAvisoTerminos, ErrorDeAviso, MAXIMO_POR_DEFECTO } = require('../lib/avisoTerminos');
const { TERMINOS_VIGENTES, limiteDeTerminos } = require('../lib/terminos');
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

// POST /api/interno/aviso-terminos  { solo?: string, enviar?: boolean }
//
// El aviso único de la actualización de los Términos (ver src/lib/avisoTerminos.js). TRES modos:
//   · sin cuerpo (o `enviar` falso): SIMULACIÓN. Cuenta a quién le escribiría; no manda nada.
//   · `{ solo: "tu@correo" }`: PRUEBA. Un correo a esa dirección, marcado [PRUEBA], sin dejar
//     constancia. Funciona aunque el envío no esté armado: es la forma de verlo llegar antes.
//   · `{ enviar: true }`: ENVÍO REAL. Solo si el PO lo ARMÓ poniendo `AVISO_TERMINOS_ACTIVO`
//     igual a la versión vigente de los Términos; si no, 409. Como el armado es la versión, un
//     cambio de texto (que sube la versión) lo desarma solo: hay que volver a armar a propósito.
// La respuesta lleva solo cuentas (y, en la simulación, una muestra enmascarada).
router.post('/aviso-terminos', limitador, exigirSecreto, async (req, res) => {
  const solo = typeof req.body?.solo === 'string' ? req.body.solo : null;
  const enviar = req.body?.enviar === true;
  if (enviar && !solo && process.env.AVISO_TERMINOS_ACTIVO !== TERMINOS_VIGENTES) {
    return res.status(409).json({
      error: 'El envío no está armado para la versión vigente de los Términos',
      armado: false,
      versionVigente: TERMINOS_VIGENTES
    });
  }
  try {
    const resultado = await enviarAvisoTerminos({
      prisma, mailer, versionVigente: TERMINOS_VIGENTES, limite: limiteDeTerminos(),
      urlBase: process.env.FRONTEND_URL, enviar, solo, maximo: MAXIMO_POR_DEFECTO
    });
    // En el registro no va a quién (solo cuentas), igual que en la respuesta.
    log('aviso_terminos', { modo: resultado.modo, enviados: resultado.enviados, pendientes: resultado.pendientes, requestId: req.id });
    // La muestra enmascarada solo se devuelve a quien la pide en simulación: no se registra.
    res.json(resultado);
  } catch (e) {
    if (e instanceof ErrorDeAviso) return res.status(e.estado).json({ error: e.message, codigo: e.codigo });
    console.error('Error en el aviso de Términos:', e);
    res.status(500).json({ error: 'Error al procesar el aviso de Términos' });
  }
});

module.exports = router;
module.exports.secretoValido = secretoValido;
module.exports.exigirSecreto = exigirSecreto;
