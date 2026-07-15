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

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const app = express();
// Necesario para que el rate limit identifique la IP real detrás de un proxy (deploy)
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Headers de seguridad. CORP en cross-origin: las imágenes de /uploads
// se consumen desde el frontend, que vive en otro origen.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS restringido al frontend (curl y apps nativas no mandan Origin, por eso se permite sin él)
app.use(cors({ origin: FRONTEND_URL }));

// El contenido viaja como JSON chico; las imágenes van por multipart (multer, 5 MB)
app.use(express.json({ limit: '100kb' }));
app.use(morgan('dev'));

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
app.use('/api', apiLimiter);
app.use('/api/auth/mastodon', authLimiter);


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
app.use('/api/posts', require('./src/routes/postRoutes'));
app.use('/api/comments', require('./src/routes/commentRoutes'));
app.use('/api/media', require('./src/routes/mediaRoutes'));
app.use('/api/notifications', require('./src/routes/notificationRoutes'));
app.use('/api/nearby', require('./src/routes/nearbyRoutes'));

// Imágenes subidas (posts y comentarios)
app.use('/uploads', express.static(require('path').join(__dirname, 'uploads'), {
  immutable: true,
  maxAge: '30d'
}));
app.use('/api/forum', require('./src/routes/forumRoutes'));
app.use('/api/chat', require('./src/routes/chatRoutes'));
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
