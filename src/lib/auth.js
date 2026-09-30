const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const { unauthorized } = require('./errors');

function getSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not configured.');
  }

  return secret;
}

/*
 * Hash a user's password.
 */
async function hashPassword(password) {
  if (typeof password !== 'string' || !password) {
    throw new Error('Password is required.');
  }

  return bcrypt.hash(password, 12);
}

/*
 * Verify a plain-text password against a password hash.
 */
async function verifyPassword(password, passwordHash) {
  if (
    typeof password !== 'string' ||
    !password ||
    typeof passwordHash !== 'string' ||
    !passwordHash
  ) {
    return false;
  }

  return bcrypt.compare(password, passwordHash);
}

/*
 * Create a JWT.
 *
 * Accepts either:
 *   signToken(userObject)
 * or:
 *   signToken(userId)
 *
 * This keeps the function compatible with the current routes.
 */
function signToken(user) {
  const payload = {
    sub: typeof user === 'string' ? user : user.id,
  };

  if (user && typeof user === 'object') {
    if (user.email) {
      payload.email = user.email;
    }

    if (user.memberType) {
      payload.memberType = user.memberType;
    } else if (user.member_type) {
      payload.memberType = user.member_type;
    }
  }

  return jwt.sign(payload, getSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

/*
 * Verify a JWT.
 */
function verifyToken(token) {
  try {
    if (!token) {
      throw new Error('Missing token');
    }

    return jwt.verify(token, getSecret());
  } catch {
    throw unauthorized('Invalid or expired authentication token.');
  }
}

/*
 * Required authentication middleware.
 *
 * Adds:
 *   req.auth
 *   req.userId
 */
function requireAuth(req, res, next) {
  try {
    const header = req.get('authorization') || '';

    if (!header.startsWith('Bearer ')) {
      throw unauthorized();
    }

    const token = header.slice(7).trim();

    if (!token) {
      throw unauthorized();
    }

    const payload = verifyToken(token);

    if (!payload || !payload.sub) {
      throw unauthorized('Invalid authentication token.');
    }

    req.auth = payload;
    req.userId = payload.sub;

    next();
  } catch (error) {
    next(error);
  }
}

/*
 * Backwards-compatible alias.
 *
 * Other files may still import authRequired.
 */
const authRequired = requireAuth;

/*
 * Optional authentication middleware.
 *
 * If there is no token, the request continues as a guest.
 * If a token is present but invalid, the request also continues
 * without authentication.
 */
function optionalAuth(req, res, next) {
  try {
    const header = req.get('authorization') || '';

    if (!header.startsWith('Bearer ')) {
      return next();
    }

    const token = header.slice(7).trim();

    if (!token) {
      return next();
    }

    const payload = verifyToken(token);

    if (!payload || !payload.sub) {
      return next();
    }

    req.auth = payload;
    req.userId = payload.sub;

    next();
  } catch {
    next();
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  requireAuth,
  authRequired,
  optionalAuth,
};