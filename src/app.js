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

const app = express();

const NODE_ENV = process.env.NODE_ENV || 'development';

if (NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const configuredOrigins = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const localOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

const allowedOrigins = Array.from(new Set([...localOrigins, ...configuredOrigins]));

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

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (!process.env.ALLOWED_ORIGIN || process.env.ALLOWED_ORIGIN === '*') {
        if (NODE_ENV === 'production') {
          return callback(
            new ApiError(
              500,
              'CORS is not configured for production.'
            )
          );
        }

        return callback(null, true);
      }

      return callback(new ApiError(403, 'Origin not allowed by CORS.'));
    },
    credentials: true
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

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