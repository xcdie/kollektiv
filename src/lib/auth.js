const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { unauthorized } = require('./errors');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET) {
  // Fail loudly rather than silently signing tokens with an empty/guessable secret.
  throw new Error(
    'JWT_SECRET is not set. Copy .env.example to .env and set a real secret before starting the server.'
  );
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function readToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload.sub;
  } catch (e) {
    return null;
  }
}

// Attaches req.userId or throws 401. Use on routes that require a logged-in user.
function requireAuth(req, res, next) {
  const userId = readToken(req);
  if (!userId) return next(unauthorized('Sign in to do that.'));
  req.userId = userId;
  next();
}

// Attaches req.userId if a valid token is present, but never blocks the request.
// Use on public routes whose response shape changes slightly when logged in
// (e.g. opportunities include an "interested" flag only for the current user).
function optionalAuth(req, res, next) {
  const userId = readToken(req);
  if (userId) req.userId = userId;
  next();
}

module.exports = { hashPassword, verifyPassword, signToken, requireAuth, optionalAuth };
