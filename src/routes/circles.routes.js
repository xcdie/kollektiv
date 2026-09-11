const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { genId } = require('../lib/id');
const { requireAuth, optionalAuth } = require('../lib/auth');
const { validateBody } = require('../lib/validate');
const { notFound } = require('../lib/errors');
const s = require('../lib/serialize');

const router = express.Router();

router.get('/', (req, res) => {
  const circles = db.prepare('SELECT * FROM circles ORDER BY rowid').all();
  const countStmt = db.prepare('SELECT COUNT(*) as n FROM threads WHERE circle_id = ?');
  res.json(circles.map((c) => s.circle(c, countStmt.get(c.id).n)));
});

router.get('/:slug/threads', optionalAuth, (req, res) => {
  const circle = db.prepare('SELECT * FROM circles WHERE slug = ?').get(req.params.slug);
  if (!circle) throw notFound('Circle');

  const threads = db
    .prepare('SELECT * FROM threads WHERE circle_id = ? ORDER BY created_at DESC')
    .all(circle.id);
  const authorStmt = db.prepare('SELECT id, name, avatar_url, is_guide FROM users WHERE id = ?');
  const replyCountStmt = db.prepare('SELECT COUNT(*) as n FROM replies WHERE thread_id = ?');
  const likeCountStmt = db.prepare('SELECT COUNT(*) as n FROM thread_likes WHERE thread_id = ?');
  const userLikeStmt = db.prepare('SELECT 1 FROM thread_likes WHERE thread_id = ? AND user_id = ?');

  res.json({
    circle: s.circle(circle, threads.length),
    threads: threads.map((t) => {
      const author = authorStmt.get(t.author_id);
      const liked = !!req.userId && !!userLikeStmt.get(t.id, req.userId);
      return s.threadSummary(t, author, replyCountStmt.get(t.id).n, likeCountStmt.get(t.id).n, liked);
    }),
  });
});

const newThreadSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(160),
  body: z.string().trim().min(1, 'Add some detail').max(4000),
 imageUrl: z.string().trim().optional().or(z.literal('')),
});

router.post('/:slug/threads', requireAuth, validateBody(newThreadSchema), (req, res) => {
  const circle = db.prepare('SELECT * FROM circles WHERE slug = ?').get(req.params.slug);
  if (!circle) throw notFound('Circle');

  const { title, body, imageUrl } = req.body;
  const id = genId('thread');
  db.prepare('INSERT INTO threads (id, circle_id, author_id, title, body, image_url) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    circle.id,
    req.userId,
    title,
    body,
    imageUrl || null
  );
  db.prepare('INSERT OR IGNORE INTO user_milestones (user_id, milestone_id) VALUES (?, ?)').run(req.userId, 'm2');

  const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(id);
  const author = db.prepare('SELECT id, name, avatar_url, is_guide FROM users WHERE id = ?').get(req.userId);
  res.status(201).json(s.threadSummary(thread, author, 0, 0, false));
});

module.exports = router;
