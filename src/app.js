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

// FIX 1: define the setting the callback depends on.
const allowedOriginSetting = process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '';

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (!allowedOriginSetting || allowedOriginSetting === '*') {
      return callback(null, true);
    }

    const originsList = allowedOriginSetting.split(',').map((o) => o.trim()).filter(Boolean);
    if (originsList.includes(origin)) {
      return callback(null, true);
    }

    // FIX 3: tag the error so the handler can answer 403 instead of 500.
    const err = new Error('Not allowed by CORS');
    err.statusCode = 403;
    err.isCorsError = true;
    callback(err);
  },
  credentials: true,
};
app.use(cors(corsOptions));

// FIX 4: 200kb was only ever enough for plain JSON fields. The avatar
// upload sends the photo as a base64 data: URL in the same JSON body,
// which for a real photo is comfortably over that limit — every upload
// was rejected here (413) before it ever reached the route's own
// validation. 6mb comfortably covers a phone photo (~4-4.5mb raw becomes
// ~5.5-6mb once base64-encoded) while still bounding request size.
//
// Note this limit applies to every route mounted below, not just avatar
// upload — if that's too blunt for your traffic, prefer resizing the
// image client-side before upload (e.g. via a <canvas>) and/or moving
// image storage to object storage with a signed upload URL instead of
// embedding base64 in this column.
app.use(express.json({ limit: '6mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // FIX 2: path is relative to the '/api' mount point.
  skip: (req) => req.path === '/health',
});
app.use('/api', globalLimiter);

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'kollektiv-api' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/circles', circlesRoutes);
app.use('/api/threads', threadsRoutes);
app.use('/api/opportunities', opportunitiesRoutes);
app.use('/api/guides', guidesRoutes);
app.use('/api/field', fieldRoutes);
app.use('/api/milestones', milestonesRoutes);

app.all(/^\/api(\/.*)?$/, (req, res) => {
  res.status(404).json({ error: { message: 'Not found' } });
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get(/^(?!\/api).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: { message: err.message, details: err.details } });
  }

  if (err.isCorsError) {
    return res.status(403).json({ error: { message: 'Origin not permitted.' } });
  }

  const parserStatus = err.status || err.statusCode;
  if (parserStatus && parserStatus >= 400 && parserStatus < 500) {
    const message = err.type === 'entity.too.large' ? 'Request body too large.' : 'Malformed JSON in request body.';
    return res.status(parserStatus).json({ error: { message } });
  }

  console.error(err);
  res.status(500).json({ error: { message: 'Something went wrong on our end.' } });
});

module.exports = app;