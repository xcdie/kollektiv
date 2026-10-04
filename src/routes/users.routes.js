
const express = require('express');
const db = require('../db');
const { genId } = require('../lib/id');
const { requireAuth, optionalAuth } = require('../lib/auth');
const { validateBody } = require('../lib/validate');
const { notFound, forbidden, badRequest } = require('../lib/errors');
const s = require('../lib/serialize');

const router = express.Router();

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';

    if (!header.startsWith('Bearer ')) {
      throw unauthorized('Authentication required.');
    }

    const token = header.slice(7).trim();

    if (!token) {
      throw unauthorized('Authentication required.');
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      throw unauthorized('Invalid authentication token.');
    }

    req.user = data.user;
    req.userId = data.user.id;

    next();
  } catch (error) {
    next(error);
  }
}

async function optionalAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';

    // No token = continue as guest
    if (!header.startsWith('Bearer ')) {
      req.user = null;
      req.userId = null;
      return next();
    }

    const token = header.slice(7).trim();

    if (!token) {
      req.user = null;
      req.userId = null;
      return next();
    }

    const { data, error } = await supabase.auth.getUser(token);

    // Invalid/expired token = treat visitor as unauthenticated
    if (error || !data?.user) {
      req.user = null;
      req.userId = null;
      return next();
    }

    req.user = data.user;
    req.userId = data.user.id;

    next();
  } catch (error) {
    // Optional authentication must never block public routes
    req.user = null;
    req.userId = null;
    next();
  }
}

module.exports = {
  requireAuth,
  optionalAuth,
};