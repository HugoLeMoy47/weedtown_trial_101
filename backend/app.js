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

const { allowedOrigins } = require('./src/lib/allowedOrigins');

// SEC-03: Validación estricta de entorno al arrancar el proceso
function validarEntorno() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 16 || secret === 'secret' || secret === '123456') {
    console.error('❌ ERROR CRÍTICO DE SEGURIDAD: JWT_SECRET no está configurado o es un valor por defecto inseguro (debe tener al menos 16 caracteres).');
    process.exit(1);
  }
}
validarEntorno();

const app = express();
// Necesario para que el rate limit identifique la IP real detrás de un proxy (deploy)
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Headers de seguridad. CORP en cross-origin: las imágenes de /uploads
// se consumen desde el frontend, que vive en otro origen.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS restringido a los orígenes del frontend — localhost y/o IP LAN
// (curl y apps nativas no mandan Origin, por eso se permite sin él)
app.use(cors({ origin: allowedOrigins }));

// El contenido viaja como JSON chico; las imágenes van por multipart (multer, 5 MB)
app.use(express.json({ limit: '100kb' }));

// SEC-04: En desarrollo usamos morgan('dev'); en producción un formato anónimo sin registrar direcciones IP ni PII
if (process.env.NODE_ENV === 'production') {
  app.use(morgan(':method :url :status :response-time ms - :res[content-length]'));
} else {
  app.use(morgan('dev'));
}

// Rate limit general de la API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta de nuevo en unos minutos.' }
});
// Rate limit estricto para el flujo de autenticación (anti abuso del OAuth)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos.' }
});
// Passkeys: mismo criterio que el OAuth de Mastodon, sin registro externo que
// ya lo frene por su cuenta.
const passkeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' }
});
// Enlace mágico: el límite por IP es la primera defensa contra usarlo para
// mandar correo no deseado a bandejas ajenas (la segunda, por correo
// destino, vive en emailAuthRoutes.js).
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes de enlace. Intenta de nuevo en unos minutos.' }
});
app.use('/api', apiLimiter);
app.use('/api/auth/mastodon', authLimiter);
app.use('/api/auth/passkey', passkeyLimiter);
app.use('/api/auth/email', emailLimiter);


// Health check: proceso vivo + conexión a la base de datos
const prisma = require('./src/lib/prisma');
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'ok' });
  } catch (e) {
    res.status(503).json({ status: 'ok', db: 'error' });
  }
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
app.use('/api/reports', require('./src/routes/reportRoutes'));
app.use('/api/avatars', require('./src/routes/avatarRoutes'));

// Imágenes subidas (posts y comentarios). Solo con el driver de disco local:
// con un almacenamiento externo las sirve ese servicio, no este proceso.
const storage = require('./src/lib/storage');
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

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use(errorHandler);

// Servidor HTTP compartido entre Express y Socket.IO (chat en tiempo real)
const server = require('http').createServer(app);
require('./src/lib/chatSocket').initChatSocket(server);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`WeedTown backend corriendo en puerto ${PORT}`);
});
