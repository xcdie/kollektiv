require('dotenv').config();

const app = require('./app');

const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

if (NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

if (
  NODE_ENV === 'production' &&
  (!process.env.ALLOWED_ORIGIN || process.env.ALLOWED_ORIGIN === '*')
) {
  console.warn(
    'WARNING: ALLOWED_ORIGIN should be configured to a specific origin in production.'
  );
}

app.listen(PORT, () => {
  console.log(`Kollektiv API listening on http://localhost:${PORT}`);
  console.log(
    `Health check endpoints live at http://localhost:${PORT}/api/health`
  );
});