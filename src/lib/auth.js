const jwt = require('jsonwebtoken');

const { unauthorized } = require('./errors');

function getSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not configured.');
  }

  return secret;
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      memberType: user.memberType
    },
    getSecret(),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch {
    throw unauthorized('Invalid or expired authentication token.');
  }
}

function authRequired(req, res, next) {
  try {
    const header = req.get('authorization') || '';

    if (!header.startsWith('Bearer ')) {
      throw unauthorized();
    }

    const token = header.slice(7).trim();

    if (!token) {
      throw unauthorized();
    }

    req.auth = verifyToken(token);

    next();
  } catch (error) {
    next(error);
  }
}

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

    req.auth = verifyToken(token);

    next();
  } catch {
    next();
  }
}

module.exports = {
  signToken,
  verifyToken,
  authRequired,
  optionalAuth
};