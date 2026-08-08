// app.js - Backend principal para WeedTown
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const { errorHandler } = require('./src/middlewares/errorHandler');
const { requestId } = require('./src/middlewares/requestId');
const { log } = require('./src/lib/logger');

const { allowedOrigins } = require('./src/lib/allowedOrigins');

// Token propio de morgan: une cada línea de acceso con los eventos
// estructurados de logger.js que haya disparado esa misma petición.
morgan.token('id', req => req.id);

// SEC-03: Validación estricta de entorno al arrancar el proceso
function validarEntorno() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 16 || secret === 'secret' || secret === '123456') {
    console.error('❌ ERROR CRÍTICO DE SEGURIDAD: JWT_SECRET no está configurado o es un valor por defecto inseguro (debe tener al menos 16 caracteres).');
    process.exit(1);
  }
}
validarEntorno();

// Contra qué base está trabajando este proceso.
//
// Existe por un incidente real: el desarrollo local apuntaba a la MISMA base
// que producción sin que nada lo dijera, y la migración del ciclo 9C se
// aplicó sobre los datos de la comunidad al correr `prisma migrate dev` en
// una máquina. No pasó nada grave —era aditiva— pero `migrate dev` también
// ofrece RESETEAR la base cuando detecta deriva, y aceptar ese prompt sin
// leerlo habría borrado todas las cuentas, posteos y chats reales.
//
// El código no puede saber cuál base es "la de producción", así que esto no
// bloquea nada: solo lo dice en voz alta, para que "¿sobre qué estoy
// trabajando?" se conteste mirando el arranque y no destripando el .env.
// Mismo criterio que `arranque_api_limiter` y que el aviso de PREVIEW_API_URL
// en el Worker: hacer ruidoso lo que si no es silencioso.
//
// Nunca registra la contraseña: solo host, puerto y schema.
function avisarBaseDeDatos() {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  try {
    const u = new URL(url);
    log('arranque_base_de_datos', {
      host: u.hostname,
      puerto: u.port || '(default)',
      schema: u.searchParams.get('schema') || 'public (default)',
      entorno: process.env.NODE_ENV || 'desarrollo'
    });
  } catch {
    log('arranque_base_de_datos', { error: 'DATABASE_URL no se pudo interpretar como URL' });
  }
}
avisarBaseDeDatos();

const app = express();
// Necesario para que el rate limit identifique la IP real detrás de un proxy (deploy)
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Headers de seguridad. CORP en cross-origin: las imágenes de /uploads
// se consumen desde el frontend, que vive en otro origen.
//
// La CSP es la que realmente importa aquí y a la vez la más fácil de romper
// sin darse cuenta: Swagger UI (/api-docs) inyecta <style> inline para el
// resaltado de sintaxis, así que styleSrc necesita 'unsafe-inline' — no hay
// forma de servir Swagger UI sin eso. Todo lo demás se queda en 'self'.
const HTTPS = (process.env.BACKEND_URL || '').startsWith('https://');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // Solo tiene sentido cuando el backend realmente sirve por HTTPS: en HTTP
  // los navegadores ignoran este header, pero mandarlo en desarrollo confunde.
  hsts: HTTPS ? { maxAge: 15552000, includeSubDomains: true } : false
}));
// Permissions-Policy no tiene helper propio en Helmet 8: se manda a mano.
// Todo apagado salvo geolocation — que ningún request al backend usa
// directamente (el navegador la captura en el frontend), pero sí conviene no
// bloquearla por si algún día algo la delega vía iframe.
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)');
  next();
});

// CORS restringido a los orígenes del frontend — localhost y/o IP LAN
// (curl y apps nativas no mandan Origin, por eso se permite sin él)
app.use(cors({ origin: allowedOrigins }));

// El contenido viaja como JSON chico; las imágenes van por multipart (multer, 5 MB)
app.use(express.json({ limit: '100kb' }));

// Antes que morgan y que las rutas: todo lo que loguea esta petición —de
// acceso o estructurado— necesita ya el id.
app.use(requestId);

// SEC-04: en producción, formato anónimo con id de correlación y sin
// direcciones IP ni PII. En desarrollo, 'dev' (coloreado, más legible) —
// el id de esa misma petición también sale en los eventos de logger.js.
if (process.env.NODE_ENV === 'production') {
  app.use(morgan(':id :method :url :status :response-time ms - :res[content-length]'));
} else {
  app.use(morgan('dev'));
}

// Evento de seguridad cuando un límite se alcanza — de por sí no dice si es
// abuso o solo una persona con mala conexión reintentando, pero un pico de
// estos en el log estructurado es la señal para ir a mirar.
function alTocarLimite(nombre) {
  return (req, res, next, options) => {
    log('rate_limit_excedido', { limitador: nombre, ruta: req.originalUrl, requestId: req.id });
    res.status(options.statusCode).json(options.message);
  };
}

// Rate limit general de la API. Configurable por env: sin API_LIMITER_MAX
// (cualquier despliegue real) el límite es 300/15min, igual que siempre —
// solo backend/.env.test sube el techo, porque una suite de integración que
// crece con cada ciclo va sumando peticiones reales contra un único proceso
// del backend, y 300 termina siendo el presupuesto de la SUITE, no el de
// una persona usuaria real.
//
// Ciclo 7B, Tarea 0: la variable puede desactivar el límite general EN
// SILENCIO — copiar un .env.test a .env es de las cosas que pasan. Dos
// blindajes:
//   1. Se registra al arrancar cuál es el límite efectivo y de dónde salió
//      (mismo criterio que storage.js/mailer.js, que fallan si su config es
//      inválida — este es un grado más suave: avisa, no bloquea el arranque).
//   2. Number("-1") es truthy y pasa de largo el `|| 300` de abajo: SIN este
//      piso, un valor negativo produce un límite negativo que bloquea TODA
//      la API sin causa evidente (fail-closed, pero una caída total muda).
const limiteApiConfigurado = Number(process.env.API_LIMITER_MAX) || 300;
const API_LIMITER_MAX = Math.max(limiteApiConfigurado, 1);
log('arranque_api_limiter', {
  limite: API_LIMITER_MAX,
  origen: process.env.API_LIMITER_MAX ? 'env (API_LIMITER_MAX)' : 'default',
  blindadoPorNegativo: limiteApiConfigurado !== API_LIMITER_MAX
});
// Las fichas de previsualización quedan fuera de este limitador (T3, ciclo
// 7B; extendido a subforos en el 9A): todas las peticiones del Worker de
// Cloudflare llegan desde un rango chico de IPs, así que un enlace popular
// agotaría el cupo general y devolvería 429 a TODA la API, no solo a la
// ficha. Cada una tiene su propio limitador, más alto, junto a su ruta
// (postRoutes.js y forumRoutes.js).
//
// `req.path` aquí es relativo al montaje `/api`, de ahí que los patrones no
// lo incluyan.
const RUTAS_PREVIEW_SIN_LIMITE_GENERAL = /^\/(?:posts\/\d+|forum\/subforums\/[^/]+)\/preview$/;
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: API_LIMITER_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => RUTAS_PREVIEW_SIN_LIMITE_GENERAL.test(req.path),
  message: { error: 'Demasiadas peticiones. Intenta de nuevo en unos minutos.' },
  handler: alTocarLimite('api')
});
// Rate limit estricto para el flujo de autenticación (anti abuso del OAuth)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos.' },
  handler: alTocarLimite('mastodon_oauth')
});
// Passkeys: mismo criterio que el OAuth de Mastodon, sin registro externo que
// ya lo frene por su cuenta.
const passkeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
  handler: alTocarLimite('passkey')
});
// Enlace mágico: el límite por IP es la primera defensa contra usarlo para
// mandar correo no deseado a bandejas ajenas (la segunda, por correo
// destino, vive en emailAuthRoutes.js).
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes de enlace. Intenta de nuevo en unos minutos.' },
  handler: alTocarLimite('email')
});
// HU-ATR-001: sin `userId` en el log ya no se puede deduplicar al contar, así
// que una cuenta recién creada podría llamar este endpoint hasta agotar el
// apiLimiter general (300/15 min) e inflar la métrica que justamente valida
// la hipótesis del ciclo. No es una defensa de seguridad —el endpoint no
// decide nada—, es higiene de la métrica.
const attributionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta de nuevo en unos minutos.' },
  handler: alTocarLimite('attribution')
});
app.use('/api', apiLimiter);
app.use('/api/auth/mastodon', authLimiter);
app.use('/api/auth/passkey', passkeyLimiter);
app.use('/api/auth/email', emailLimiter);
app.use('/api/auth/attribution', attributionLimiter);


// Health check: proceso vivo + dependencias críticas (BD, storage, mailer).
// Storage y mailer no se prueban en vivo en cada consulta —ya se validaron al
// arrancar el proceso (storage.js y mailer.js lanzan si su configuración es
// inválida)— esto reporta qué driver está activo en cada uno, que es lo que
// suele importar para diagnosticar "¿por qué no llegó la imagen/el correo?".
const prisma = require('./src/lib/prisma');
const storage = require('./src/lib/storage');
const mailer = require('./src/lib/mailer');
app.get('/health', async (req, res) => {
  const estado = {
    status: 'ok',
    db: 'ok',
    storage: storage.driver,
    mailer: mailer.driver,
    uptimeSegundos: Math.round(process.uptime())
  };
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    estado.db = 'error';
    return res.status(503).json(estado);
  }
  res.json(estado);
});

// Rutas principales
app.use('/api/auth', require('./src/routes/authRoutes'));
app.use('/api/auth/passkey', require('./src/routes/passkeyAuthRoutes'));
app.use('/api/auth/email', require('./src/routes/emailAuthRoutes'));
app.use('/api/posts', require('./src/routes/postRoutes'));
app.use('/api/comments', require('./src/routes/commentRoutes'));
app.use('/api/media', require('./src/routes/mediaRoutes'));
app.use('/api/notifications', require('./src/routes/notificationRoutes'));
app.use('/api/nearby', require('./src/routes/nearbyRoutes'));
app.use('/api/blocks', require('./src/routes/blockRoutes'));
app.use('/api/friends', require('./src/routes/friendRoutes'));
app.use('/api/reports', require('./src/routes/reportRoutes'));
app.use('/api/avatars', require('./src/routes/avatarRoutes'));

// Imágenes subidas (posts y comentarios). Solo con el driver de disco local:
// con un almacenamiento externo las sirve ese servicio, no este proceso.
if (storage.esLocal) {
  app.use('/uploads', express.static(require('path').join(__dirname, 'uploads'), {
    immutable: true,
    maxAge: '30d'
  }));
}
app.use('/api/forum', require('./src/routes/forumRoutes'));
app.use('/api/chat', require('./src/routes/chatRoutes'));
// market y admin traen su propio portón dentro del router (requireAuth y
// requireAuth + requireRole respectivamente): la protección no depende de este
// punto de montaje.
app.use('/api/market', require('./src/routes/marketRoutes'));

app.use('/api/admin', require('./src/routes/adminRoutes'));
app.use('/api/profile', require('./src/routes/profileRoutes'));

// El "servers" del JSON queda fijo en localhost:4000 para desarrollo; en
// cualquier otro entorno (Render, o el que sea) lo reemplazamos en tiempo de
// arranque con BACKEND_URL, así "Try it out" apunta solo donde este mismo
// proceso responde de verdad — sin tener que editar swagger.json a mano cada
// vez que cambia dónde vive el backend.
const swaggerConBackendReal = {
  ...swaggerDocument,
  servers: process.env.BACKEND_URL && process.env.BACKEND_URL !== 'http://localhost:4000'
    ? [{ url: process.env.BACKEND_URL }, ...swaggerDocument.servers]
    : swaggerDocument.servers
};
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerConBackendReal));

app.use(errorHandler);

// Servidor HTTP compartido entre Express y Socket.IO (chat en tiempo real)
const server = require('http').createServer(app);
require('./src/lib/chatSocket').initChatSocket(server);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`WeedTown backend corriendo en puerto ${PORT}`);
});
