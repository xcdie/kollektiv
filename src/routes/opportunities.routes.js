
const express = require('express');
const { z } = require('zod');

const db = require('../db');

const {
  optionalAuth,
  requireAuth,
} = require('../lib/auth');

const {
  validateBody,
  validateQuery,
} = require('../lib/validate');

const {
  notFound,
  badRequest,
  forbidden,
} = require('../lib/errors');

const { genId } = require('../lib/id');
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

const createOpportunitySchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  company: z.string().trim().min(1, 'Company is required').max(200),
  type: z.enum(OPP_TYPES),
  location: z.string().trim().min(1, 'Location is required').max(200),
  pay: z.string().trim().min(1, 'Pay is required').max(200),
  blurb: z.string().trim().min(1, 'Description is required').max(2000),
});

router.post(
  '/',
  requireAuth,
  validateBody(createOpportunitySchema),
  (req, res, next) => {
    try {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
      if (!user) {
        return next(notFound('User'));
      }

      if (user.member_type !== 'hiring') {
        return next(forbidden('Only hiring members can post opportunities.'));
      }

      const id = genId('opp');
      const createdAt = new Date().toISOString();
      db.prepare(
        `INSERT INTO opportunities
         (id, title, company, type, location, pay, blurb, pay_verified, posted_by_user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, req.body.title.trim(), req.body.company.trim(), req.body.type, req.body.location.trim(), req.body.pay.trim(), req.body.blurb.trim(), 1, user.id, createdAt);

      const row = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);
      res.status(201).json(s.opportunity(row, false));
    } catch (error) {
      next(error);
    }
  }
);

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

      if (opportunity.posted_by_user_id && opportunity.posted_by_user_id !== req.userId) {
        const candidate = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
        db.prepare(
          `INSERT INTO notifications
           (id, user_id, type, title, body, link)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          genId('notification'),
          opportunity.posted_by_user_id,
          'opportunity_interest',
          'Someone is interested in your opportunity',
          `${candidate ? candidate.name : 'Someone'} is interested in “${opportunity.title}.”`,
          `opportunities:${opportunity.id}`
        );
      }

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