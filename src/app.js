// src/app.js
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

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}


app.use(helmet({ contentSecurityPolicy: false }));

const corsOptions = {
  origin: (origin, callback) => {
    // Allow same-origin requests (origin is undefined)
    if (!origin) return callback(null, true);
    
    // Fallback default for development environments
    if (!allowedOriginSetting || allowedOriginSetting === '*') {
      return callback(null, true);
    }
    
    const originsList = allowedOriginSetting.split(',').map((o) => o.trim());
    if (originsList.includes(origin)) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true, // Safeguard auth token context across shared routes if needed
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '200kb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Global rate limit: 100 requests per 15 minutes per IP.
// Auth routes apply a tighter limit (30 per 15 min) via their own middleware.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7', // Explicitly use modern standard spec headers
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health', // Never rate-limit health checks
});
app.use('/api', globalLimiter);

// Public status metric route
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'kollektiv-api' }));

// Route Mounts
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/circles', circlesRoutes);
app.use('/api/threads', threadsRoutes);
app.use('/api/opportunities', opportunitiesRoutes);
app.use('/api/guides', guidesRoutes);
app.use('/api/field', fieldRoutes);
app.use('/api/milestones', milestonesRoutes);

// FIXED: Explicit 404 for unmatched API routes
// 1. Used a native JavaScript Regular Expression literal to comply with path-to-regexp v8+.
// 2. Moved to the bottom of the API chain so it does not intercept or block lower routes.
app.all(/^\/api.*/, (req, res) => {
  res.status(404).json({ error: { message: 'Not found' } });
});

// Serve frontend assets from the public root directory
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get(/^(?!\/api).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: { message: err.message, details: err.details } });
  }

  // Surface those as the 4xx client errors they are, not a generic 500.
  const parserStatus = err.status || err.statusCode;
  if (parserStatus && parserStatus >= 400 && parserStatus < 500) {
    const message = err.type === 'entity.too.large' ? 'Request body too large.' : 'Malformed JSON in request body.';
    return res.status(parserStatus).json({ error: { message } });
  }
  console.error(err);
  res.status(500).json({ error: { message: 'Something went wrong on our end.' } });
});

module.exports = app;
