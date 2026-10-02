const express = require('express');
const { z } = require('zod');

const db = require('../db');
const { genId } = require('../lib/id');
const { requireAuth } = require('../lib/auth');
const { validateBody } = require('../lib/validate');
const { notFound, badRequest } = require('../lib/errors');

const router = express.Router();
const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

const sendMessageSchema = z.object({
  toUserId: z.string().trim().min(1, 'Recipient is required').max(128),
  text: z.string().trim().min(1, 'Message is required').max(2000),
});

function serializeMessage(row) {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    text: row.body,
    createdAt: row.created_at,
    readAt: row.read_at || null,
  };
}

router.post('/', requireAuth, validateBody(sendMessageSchema), (req, res, next) => {
  try {
    if (req.body.toUserId === req.userId) {
      return next(badRequest('You cannot message yourself.'));
    }

    const recipient = db.prepare('SELECT id, name FROM users WHERE id = ?').get(req.body.toUserId);
    if (!recipient) {
      return next(notFound('User'));
    }

    const sender = db.prepare('SELECT id, name FROM users WHERE id = ?').get(req.userId);
    const id = genId('message');
    const createdAt = new Date().toISOString();
    const text = req.body.text.trim();

    db.prepare(
      `INSERT INTO messages (id, from_user_id, to_user_id, body, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(id, req.userId, req.body.toUserId, text, createdAt);

    db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, body, link)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      genId('notification'),
      req.body.toUserId,
      'message',
      'New message',
      `${sender.name}: ${text.slice(0, 120)}${text.length > 120 ? '…' : ''}`,
      `messages:${req.userId}`
    );

    res.status(201).json({
      id,
      fromUserId: req.userId,
      toUserId: req.body.toUserId,
      text,
      createdAt,
      readAt: null,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:userId', requireAuth, (req, res, next) => {
  try {
    if (!ID_RE.test(req.params.userId)) {
      return next(badRequest('Invalid user ID format'));
    }

    const otherUser = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.userId);
    if (!otherUser) {
      return next(notFound('User'));
    }

    const rows = db.prepare(`
      SELECT *
      FROM messages
      WHERE (from_user_id = ? AND to_user_id = ?)
         OR (from_user_id = ? AND to_user_id = ?)
      ORDER BY created_at ASC
    `).all(req.userId, req.params.userId, req.params.userId, req.userId);

    res.json(rows.map(serializeMessage));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
