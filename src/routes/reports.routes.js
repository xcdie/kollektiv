const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');

const db = require('../db');
const { optionalAuth } = require('../lib/auth');
const { validateBody } = require('../lib/validate');
const { genId } = require('../lib/id');

const router = express.Router();

router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.REPORT_RATE_LIMIT || 20),
    standardHeaders: true,
    legacyHeaders: false,
  })
);

const KINDS = ['opportunity', 'thread', 'reply', 'user', 'support'];

const reportSchema = z.object({
  kind: z.enum(KINDS),

  targetId: z
    .string()
    .trim()
    .max(128)
    .optional(),

  reason: z
    .string()
    .trim()
    .min(1, 'Please choose a reason')
    .max(100),

  details: z
    .string()
    .trim()
    .min(1, 'Please add some details')
    .max(2000, 'Details are too long'),

  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email')
    .max(200)
    .optional(),
});

router.post(
  '/',
  optionalAuth,
  validateBody(reportSchema),
  async (req, res, next) => {
    try {
      const { kind, targetId, reason, details, contactEmail } = req.body;

      if (!req.userId && !contactEmail) {
        return res.status(400).json({
          error: {
            message: 'Please add your email so we can reply.',
          },
        });
      }

      const id = genId('report');

      const { error } = await db.from('reports').insert({
        id,
        reporter_id: req.userId || null,
        kind,
        target_id: targetId || null,
        reason,
        details,
        contact_email: contactEmail || null,
        status: 'open',
      });

      if (error) {
        throw error;
      }

      console.log(`[report] ${kind} report ${id} received`);

      res.status(201).json({ ok: true, id });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;