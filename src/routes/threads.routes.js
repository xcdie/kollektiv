const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { genId } = require('../lib/id');
const { requireAuth, optionalAuth } = require('../lib/auth');
const { validateBody, isValidUUID } = require('../lib/validate');
const { notFound, forbidden, badRequest } = require('../lib/errors');
const s = require('../lib/serialize');

const router = express.Router();

//  Strip custom prefixes (e.g. 'thread_') before checking UUID constraints
const validateIdParam = (req, res, next) => {
  const targetId = req.params.id;
  const rawUuid = targetId.includes('_') ? targetId.split('_')[1] : targetId;

  if (!isValidUUID(rawUuid)) {
    return next(badRequest('Invalid thread ID format'));
  }
  next();
};

// ✅ FIX: Strip custom prefixes (e.g. 'reply_') before checking UUID constraints
const validateReplyIdParam = (req, res, next) => {
  const targetReplyId = req.params.replyId;
  const rawUuid = targetReplyId.includes('_') ? targetReplyId.split('_')[1] : targetReplyId;

  if (!isValidUUID(rawUuid)) {
    return next(badRequest('Invalid reply ID format'));
  }
  next();
};

// Reusable user lookup prepared statement
const userStmt = () => db.prepare('SELECT id, name, avatar_url, is_guide FROM users WHERE id = ?');

// Helper to fetch full reply details safely without hardcoding or N+1 queries
const getReplyWithStats = (replyId, currentUserId) => {
  const row = db.prepare('SELECT * FROM replies WHERE id = ?').get(replyId);
  if (!row) return null;

  const author = userStmt().get(row.author_id);
  const likeCount = db.prepare('SELECT COUNT(*) as n FROM reply_likes WHERE reply_id = ?').get(replyId).n;
  const liked = !!currentUserId && !!db.prepare('SELECT 1 FROM reply_likes WHERE reply_id = ? AND user_id = ?').get(replyId, currentUserId);

  return s.reply(row, author, likeCount, liked);
};

// GET /:id - Refactored to fix N+1 query loop and safely serialize user payloads
router.get('/:id', validateIdParam, optionalAuth, (req, res, next) => {
  try {
    const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
    if (!thread) return next(notFound('Thread'));

    const author = userStmt().get(thread.author_id);
    const threadLikeCount = db.prepare('SELECT COUNT(*) as n FROM thread_likes WHERE thread_id = ?').get(thread.id).n;
    const likedByCurrentUser = !!req.userId && !!db.prepare('SELECT 1 FROM thread_likes WHERE thread_id = ? AND user_id = ?').get(thread.id, req.userId);

    // Optimized: Fetch all replies with calculated like metrics using a database-level LEFT JOIN
    const replyRows = db.prepare(`
      SELECT r.*, 
             COUNT(rl.user_id) as like_count,
             EXISTS(SELECT 1 FROM reply_likes WHERE reply_id = r.id AND user_id = ?) as current_user_liked
      FROM replies r
      LEFT JOIN reply_likes rl ON r.id = rl.reply_id
      WHERE r.thread_id = ?
      GROUP BY r.id
      ORDER BY r.created_at ASC
    `).all(req.userId || null, thread.id);

    const uStmt = userStmt();
    const replies = replyRows.map((r) => {
      const replier = uStmt.get(r.author_id);
      return s.reply(r, replier, r.like_count, Boolean(r.current_user_liked));
    });

    res.json(s.threadDetail(thread, author, replies, threadLikeCount, likedByCurrentUser));
  } catch (error) {
    next(error);
  }
});

const newReplySchema = z.object({
  body: z.string().trim().min(1, 'Say something first').max(4000),
});

router.post('/:id/replies', validateIdParam, requireAuth, validateBody(newReplySchema), (req, res, next) => {
  try {
    const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
    if (!thread) return next(notFound('Thread'));

    const id = genId('reply');
    
    // Wrapped in an explicit write transaction for structural database integrity
    const executeReplyInsertion = db.transaction(() => {
      db.prepare('INSERT INTO replies (id, thread_id, author_id, body) VALUES (?, ?, ?, ?)').run(
        id,
        thread.id,
        req.userId,
        req.body.body
      );
      db.prepare('INSERT OR IGNORE INTO user_milestones (user_id, milestone_id) VALUES (?, ?)').run(req.userId, 'm2');
    });
    
    executeReplyInsertion();

    const completeReplyPayload = getReplyWithStats(id, req.userId);
    res.status(201).json(completeReplyPayload);
  } catch (error) {
    next(error);
  }
});

const helpfulSchema = z.object({
  note: z.string().trim().max(280).optional(),
});

router.post('/:id/replies/:replyId/helpful', validateIdParam, validateReplyIdParam, requireAuth, validateBody(helpfulSchema), (req, res, next) => {
  try {
    const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
    if (!thread) return next(notFound('Thread'));
    
    if (thread.author_id !== req.userId) {
      return next(forbidden('Only the person who started this thread can mark a reply as helpful.'));
    }

    const reply = db.prepare('SELECT * FROM replies WHERE id = ? AND thread_id = ?').get(req.params.replyId, thread.id);
    if (!reply) return next(notFound('Reply'));

    const circle = db.prepare('SELECT name FROM circles WHERE id = ?').get(thread.circle_id);
    const text = req.body.note || `Marked as a helpful answer in ${circle.name || 'a circle'}.`;

    const executeHelpfulAssignment = db.transaction(() => {
      db.prepare('UPDATE replies SET is_helpful = 1 WHERE id = ?').run(reply.id);
      db.prepare('INSERT INTO recognitions (id, to_user_id, from_user_id, text) VALUES (?, ?, ?, ?)').run(
        genId('recog'),
        reply.author_id,
        req.userId,
        text
      );
    });

    executeHelpfulAssignment();

    // Fixed: Pulls dynamic metrics instead of hardcoding 0 likes and false statuses
    const updatedReplyPayload = getReplyWithStats(reply.id, req.userId);
    res.json(updatedReplyPayload);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/like', validateIdParam, requireAuth, (req, res, next) => {
  try {
    const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
    if (!thread) return next(notFound('Thread'));

    const existing = db.prepare('SELECT 1 FROM thread_likes WHERE user_id = ? AND thread_id = ?').get(req.userId, thread.id);
    
    db.transaction(() => {
      if (existing) {
        db.prepare('DELETE FROM thread_likes WHERE user_id = ? AND thread_id = ?').run(req.userId, thread.id);
      } else {
        db.prepare('INSERT INTO thread_likes (user_id, thread_id) VALUES (?, ?)').run(req.userId, thread.id);
      }
    })();

    const count = db.prepare('SELECT COUNT(*) as n FROM thread_likes WHERE thread_id = ?').get(thread.id).n;
    res.json({ liked: !existing, likeCount: Number(count) });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/replies/:replyId/like', validateIdParam, validateReplyIdParam, requireAuth, (req, res, next) => {
  try {
    const thread = db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id);
    if (!thread) return next(notFound('Thread'));

    const reply = db.prepare('SELECT * FROM replies WHERE id = ? AND thread_id = ?').get(req.params.replyId, thread.id);
    if (!reply) return next(notFound('Reply'));

    const existing = db.prepare('SELECT 1 FROM reply_likes WHERE user_id = ? AND reply_id = ?').get(req.userId, reply.id);
    
    db.transaction(() => {
      if (existing) {
        db.prepare('DELETE FROM reply_likes WHERE user_id = ? AND reply_id = ?').run(req.userId, reply.id);
      } else {
        db.prepare('INSERT INTO reply_likes (user_id, reply_id) VALUES (?, ?)').run(req.userId, reply.id);
      }
    })();

    const count = db.prepare('SELECT COUNT(*) as n FROM reply_likes WHERE reply_id = ?').get(reply.id).n;
    res.json({ liked: !existing, likeCount: Number(count) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
