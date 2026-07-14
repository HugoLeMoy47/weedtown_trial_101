// app.js - Backend principal para WeedTown
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const { errorHandler } = require('./src/middlewares/errorHandler');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));


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
app.use('/api/forum', require('./src/routes/forumRoutes'));
app.use('/api/chat', require('./src/routes/chatRoutes'));
app.use('/api/market', require('./src/routes/marketRoutes'));

app.use('/api/admin', require('./src/routes/adminRoutes'));
app.use('/api/profile', require('./src/routes/profileRoutes'));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`WeedTown backend corriendo en puerto ${PORT}`);
});
