// src/server.js

// Load environment variables before importing the application.
require('dotenv').config();

const app = require('./app');

// ==========================================
// ENVIRONMENT CONFIGURATION VALIDATION
// ==========================================

const REQUIRED_ENV_VARS = ['JWT_SECRET', 'NODE_ENV'];
const missingVars = [];

REQUIRED_ENV_VARS.forEach((envVar) => {
  if (!process.env[envVar]) {
    missingVars.push(envVar);
  }
});

if (process.env.NODE_ENV === 'production') {
  if (
    !process.env.ALLOWED_ORIGIN ||
    process.env.ALLOWED_ORIGIN === '*'
  ) {
    console.warn(
      '\x1b[33m%s\x1b[0m',
      'WARNING: ALLOWED_ORIGIN is dangerous or open in production. Use your real frontend origin.'
    );
  }

  if (!process.env.DATABASE_URL) {
    missingVars.push('DATABASE_URL');
  }
}

if (missingVars.length > 0) {
  console.error(
    '\x1b[31m%s\x1b[0m',
    'CRITICAL SYSTEM ERROR: Missing required environment configurations:'
  );

  missingVars.forEach((variable) => {
    console.error(`  [ENV_MISSING]: ${variable}`);
  });

  process.exit(1);
}

// ==========================================
// NETWORK INITIALIZATION
// ==========================================

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log('\n==================================================');
  console.log(`  Kollektiv API listening on port ${PORT}`);
  console.log(`  Health check: /api/health`);
  console.log('==================================================\n');
});

// ==========================================
// ERROR HANDLERS
// ==========================================

process.on('unhandledRejection', (err) => {
  console.error(
    'Unhandled Rejection detected! Shutting down server gracefully...',
    err
  );

  server.close(() => {
    process.exit(1);
  });
});

process.on('uncaughtException', (err) => {
  console.error(
    'Uncaught Exception detected! Emergency shutdown...',
    err
  );

  process.exit(1);
});