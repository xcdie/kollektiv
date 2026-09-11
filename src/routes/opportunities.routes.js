const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { optionalAuth, requireAuth } = require('../lib/auth');
const { validateQuery, isValidUUID } = require('../lib/validate');
const { notFound, badRequest } = require('../lib/errors');
const s = require('../lib/serialize');

const router = express.Router();

//Extract the core UUID suffix if a prefix like 'opp_' exists before validation
const validateIdParam = (req, res, next) => {
  const targetId = req.params.id;
  
  // If the ID uses a custom prefix, isolate the raw UUID section following the underscore
  const rawUuid = targetId.includes('_') ? targetId.split('_')[1] : targetId;

  if (!isValidUUID(rawUuid)) {
    return next(badRequest('Invalid opportunity ID format'));
  }
  next();
};

const OPP_TYPES = ['Full-time', 'Internship', 'Freelance', 'Paid Challenge', 'Fellowship', 'Apprenticeship'];

const listQuerySchema = z.object({
  type: z.enum(OPP_TYPES).optional(),
});

// GET / - Standardized error passing to eliminate runtime vulnerability
router.get('/', optionalAuth, validateQuery(listQuerySchema), (req, res, next) => {
  try {
    const { type } = req.query;
    const rows = type
      ? db.prepare('SELECT * FROM opportunities WHERE type = ? ORDER BY created_at DESC').all(type)
      : db.prepare('SELECT * FROM opportunities ORDER BY created_at DESC').all();

    let interestedIds = new Set();
    if (req.userId) {
      const rows2 = db.prepare('SELECT opportunity_id FROM interests WHERE user_id = ?').all(req.userId);
      interestedIds = new Set(rows2.map((r) => r.opportunity_id));
    }

    res.json(rows.map((o) => s.opportunity(o, interestedIds.has(o.id))));
  } catch (error) {
    next(error);
  }
});

// POST /:id/interest - Implemented atomic transactional security and route error capturing
router.post('/:id/interest', validateIdParam, requireAuth, (req, res, next) => {
  try {
    const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
    if (!opp) return next(notFound('Opportunity'));

    const existing = db
      .prepare('SELECT 1 FROM interests WHERE user_id = ? AND opportunity_id = ?')
      .get(req.userId, opp.id);

    if (existing) {
      db.prepare('DELETE FROM interests WHERE user_id = ? AND opportunity_id = ?').run(req.userId, opp.id);
      return res.json({ id: opp.id, interested: false });
    }

    // Wrapped structural data mutations in an atomic transaction
    const executeInterestTransaction = db.transaction(() => {
      db.prepare('INSERT INTO interests (user_id, opportunity_id) VALUES (?, ?)').run(req.userId, opp.id);
      db.prepare('INSERT OR IGNORE INTO user_milestones (user_id, milestone_id) VALUES (?, ?)').run(req.userId, 'm5');
    });

    executeInterestTransaction();
    
    res.json({ id: opp.id, interested: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
