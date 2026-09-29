
const express = require('express');
const { z } = require('zod');

const db = require('../db');

const {
  optionalAuth,
  requireAuth,
} = require('../lib/auth');

const {
  validateQuery,
} = require('../lib/validate');

const {
  notFound,
  badRequest,
} = require('../lib/errors');

const s = require('../lib/serialize');

const router = express.Router();

const ID_RE =
  /^[a-zA-Z0-9_-]{1,128}$/;

const validateIdParam = (
  req,
  res,
  next
) => {
  if (!ID_RE.test(req.params.id)) {
    return next(
      badRequest(
        'Invalid opportunity ID format'
      )
    );
  }

  next();
};

const OPP_TYPES = [
  'Full-time',
  'Internship',
  'Freelance',
  'Paid Challenge',
  'Fellowship',
  'Apprenticeship',
];

const listQuerySchema = z.object({
  type: z
    .enum(OPP_TYPES)
    .optional(),
});

router.get(
  '/',
  optionalAuth,
  validateQuery(listQuerySchema),
  (req, res, next) => {
    try {
      const { type } = req.query;

      const rows = type
        ? db
            .prepare(
              `SELECT *
               FROM opportunities
               WHERE type = ?
               ORDER BY created_at DESC`
            )
            .all(type)
        : db
            .prepare(
              `SELECT *
               FROM opportunities
               ORDER BY created_at DESC`
            )
            .all();

      let interestedIds =
        new Set();

      if (req.userId) {
        const rows2 = db
          .prepare(
            `SELECT opportunity_id
             FROM interests
             WHERE user_id = ?`
          )
          .all(req.userId);

        interestedIds = new Set(
          rows2.map(
            (row) =>
              row.opportunity_id
          )
        );
      }

      res.json(
        rows.map((opportunity) =>
          s.opportunity(
            opportunity,
            interestedIds.has(
              opportunity.id
            )
          )
        )
      );
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/:id/interest',
  validateIdParam,
  requireAuth,
  (req, res, next) => {
    try {
      const opportunity = db
        .prepare(
          `SELECT *
           FROM opportunities
           WHERE id = ?`
        )
        .get(req.params.id);

      if (!opportunity) {
        return next(
          notFound(
            'Opportunity'
          )
        );
      }

      const existing = db
        .prepare(
          `SELECT 1
           FROM interests
           WHERE user_id = ?
           AND opportunity_id = ?`
        )
        .get(
          req.userId,
          opportunity.id
        );

      if (existing) {
        db.prepare(
          `DELETE FROM interests
           WHERE user_id = ?
           AND opportunity_id = ?`
        ).run(
          req.userId,
          opportunity.id
        );

        return res.json({
          id: opportunity.id,
          interested: false,
        });
      }

      const executeInterestTransaction =
        db.transaction(() => {
          db.prepare(
            `INSERT INTO interests
             (user_id, opportunity_id)
             VALUES (?, ?)`
          ).run(
            req.userId,
            opportunity.id
          );

          db.prepare(
            `INSERT OR IGNORE INTO user_milestones
             (user_id, milestone_id)
             VALUES (?, ?)`
          ).run(
            req.userId,
            'm5'
          );
        });

      executeInterestTransaction();

      res.json({
        id: opportunity.id,
        interested: true,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;