const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');
const { genId } = require('../lib/id');
const { hashPassword, verifyPassword, signToken, requireAuth } = require('../lib/auth');
const { validateBody } = require('../lib/validate');
const { conflict, unauthorized, notFound } = require('../lib/errors');
const { basicUser } = require('../lib/serialize');

const router = express.Router();

// Auth endpoints get a tighter rate limit than the rest of the API — a cheap,
// standard guard against brute-force login/signup abuse.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(authLimiter);

const MEMBER_TYPES = ['explorer', 'emerging', 'practitioner', 'hiring'];

const signupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  memberType: z.enum(MEMBER_TYPES).default('explorer'),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

router.post('/signup', validateBody(signupSchema), async (req, res) => {
  const { name, email, password, memberType } = req.body;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) throw conflict('An account with that email already exists.');

  const id = genId('user');
  const passwordHash = await hashPassword(password);
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, member_type)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, name, email, passwordHash, memberType);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const token = signToken(id);
  res.status(201).json({ token, user: basicUser(user) });
});

router.post('/login', validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) throw unauthorized('Incorrect email or password.');

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw unauthorized('Incorrect email or password.');

  const token = signToken(user.id);
  res.json({ token, user: basicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) throw notFound('User');
  res.json({ user: basicUser(user) });
});

module.exports = router;
