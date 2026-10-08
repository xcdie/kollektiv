require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { ApiError } = require('./lib/errors');

const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const circlesRoutes = require('./routes/circles.routes');
const threadsRoutes = require('./routes/threads.routes');
const opportunitiesRoutes = require('./routes/opportunities.routes');
const guidesRoutes = require('./routes/guides.routes');
const fieldRoutes = require('./routes/field.routes');
const milestonesRoutes = require('./routes/milestones.routes');
const searchRoutes = require('./routes/search.routes');
const messagesRoutes = require('./routes/messages.routes');

const app = express();

const NODE_ENV = process.env.NODE_ENV || 'development';

if (NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const localOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
const configuredOrigins = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || frontendUrl || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => value.replace(/\/$/, ''));

const allowedOrigins = Array.from(new Set([...localOrigins, ...configuredOrigins, ...(frontendUrl ? [frontendUrl] : [])]));

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/$/, '');
      const isLocal = localOrigins.includes(normalizedOrigin);
      const isFrontendAllowed = !!frontendUrl && normalizedOrigin === frontendUrl;

      if (isLocal || isFrontendAllowed || allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      if (NODE_ENV !== 'production') {
        return callback(null, true);
      }

      console.warn(`CORS rejected origin: ${origin}`);
      return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.use(morgan('dev'));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 200),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts. Please try again later.'
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'kollektiv-api',
    environment: NODE_ENV
  });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/circles', circlesRoutes);
app.use('/api/threads', threadsRoutes);
app.use('/api/opportunities', opportunitiesRoutes);
app.use('/api/guides', guidesRoutes);
app.use('/api/field', fieldRoutes);
app.use('/api/milestones', milestonesRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/messages', messagesRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get(/^(?!\/api\/).*/, (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next(new ApiError(404, 'API route not found.'));
  }

  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((req, res, next) => {
  next(new ApiError(404, 'Route not found.'));
});

app.use((err, req, res, next) => {
  console.error(err);

  const status = err.status || err.statusCode || 500;

  const message =
    status >= 500
      ? 'Internal server error.'
      : err.message || 'Request failed.';

  res.status(status).json({
    error: {
      message,
      details: err.details || null,
    },
  });
});

module.exports = app;