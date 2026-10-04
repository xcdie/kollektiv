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

const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

const validateIdParam = (req, res, next) => {
  if (!ID_RE.test(req.params.id)) {
    return next(
      badRequest('Invalid opportunity ID format')
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
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(200),

  company: z
    .string()
    .trim()
    .min(1, 'Company is required')
    .max(200),

  type: z.enum(OPP_TYPES),

  location: z
    .string()
    .trim()
    .min(1, 'Location is required')
    .max(200),

  pay: z
    .string()
    .trim()
    .min(1, 'Pay is required')
    .max(200),

  blurb: z
    .string()
    .trim()
    .min(1, 'Description is required')
    .max(2000),
});

/* =========================================================
   HELPERS
========================================================= */

async function getUserById(userId) {
  const { data, error } = await db
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function getOpportunityById(opportunityId) {
  const { data, error } = await db
    .from('opportunities')
    .select('*')
    .eq('id', opportunityId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

/* =========================================================
   CREATE OPPORTUNITY
   POST /opportunities
========================================================= */

router.post(
  '/',
  requireAuth,
  validateBody(createOpportunitySchema),
  async (req, res, next) => {
    try {
      const user = await getUserById(
        req.userId
      );

      if (!user) {
        return next(
          notFound('User')
        );
      }

      if (
        user.member_type !== 'hiring'
      ) {
        return next(
          forbidden(
            'Only hiring members can post opportunities.'
          )
        );
      }

      const id = genId('opp');

      const createdAt =
        new Date().toISOString();

      const {
        data: opportunity,
        error,
      } = await db
        .from('opportunities')
        .insert({
          id,
          title: req.body.title.trim(),
          company: req.body.company.trim(),
          type: req.body.type,
          location: req.body.location.trim(),
          pay: req.body.pay.trim(),
          blurb: req.body.blurb.trim(),

          /*
           * Keep the existing application
           * behavior: newly-created opportunities
           * are marked as verified.
           */
          pay_verified: true,

          posted_by_user_id: user.id,
          created_at: createdAt,
        })
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      res
        .status(201)
        .json(
          s.opportunity(
            opportunity,
            false
          )
        );
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   LIST OPPORTUNITIES
   GET /opportunities
========================================================= */

router.get(
  '/',
  optionalAuth,
  validateQuery(listQuerySchema),
  async (req, res, next) => {
    try {
      const { type } = req.query;

      let query = db
        .from('opportunities')
        .select('*')
        .order('created_at', {
          ascending: false,
        });

      if (type) {
        query = query.eq(
          'type',
          type
        );
      }

      const {
        data: rows,
        error,
      } = await query;

      if (error) {
        throw error;
      }

      let interestedIds =
        new Set();

      if (req.userId) {
        const {
          data: interestRows,
          error: interestError,
        } = await db
          .from('interests')
          .select('opportunity_id')
          .eq(
            'user_id',
            req.userId
          );

        if (interestError) {
          throw interestError;
        }

        interestedIds = new Set(
          (interestRows || []).map(
            (row) =>
              row.opportunity_id
          )
        );
      }

      res.json(
        (rows || []).map(
          (opportunity) =>
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

/* =========================================================
   EXPRESS INTEREST
   POST /opportunities/:id/interest
========================================================= */

router.post(
  '/:id/interest',
  validateIdParam,
  requireAuth,
  async (req, res, next) => {
    try {
      const opportunity =
        await getOpportunityById(
          req.params.id
        );

      if (!opportunity) {
        return next(
          notFound(
            'Opportunity'
          )
        );
      }

      /*
       * Check whether the user has
       * already expressed interest.
       */
      const {
        data: existing,
        error: existingError,
      } = await db
        .from('interests')
        .select('user_id, opportunity_id')
        .eq(
          'user_id',
          req.userId
        )
        .eq(
          'opportunity_id',
          opportunity.id
        )
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      /*
       * Existing interest means:
       * remove it and return interested=false.
       */
      if (existing) {
        const {
          error: deleteError,
        } = await db
          .from('interests')
          .delete()
          .eq(
            'user_id',
            req.userId
          )
          .eq(
            'opportunity_id',
            opportunity.id
          );

        if (deleteError) {
          throw deleteError;
        }

        return res.json({
          id: opportunity.id,
          interested: false,
        });
      }

      /*
       * Create new interest.
       */
      const {
        error: interestError,
      } = await db
        .from('interests')
        .insert({
          user_id: req.userId,
          opportunity_id:
            opportunity.id,
        });

      if (interestError) {
        /*
         * Ignore a duplicate caused by two
         * requests arriving simultaneously.
         */
        if (
          interestError.code !==
          '23505'
        ) {
          throw interestError;
        }
      }

      /*
       * Award milestone m5.
       *
       * This replaces SQLite's
       * INSERT OR IGNORE.
       */
      const {
        error: milestoneError,
      } = await db
        .from('user_milestones')
        .upsert(
          {
            user_id: req.userId,
            milestone_id: 'm5',
          },
          {
            onConflict:
              'user_id,milestone_id',
            ignoreDuplicates: true,
          }
        );

      if (milestoneError) {
        throw milestoneError;
      }

      /*
       * Notify the opportunity owner.
       */
      if (
        opportunity.posted_by_user_id &&
        opportunity.posted_by_user_id !==
          req.userId
      ) {
        const candidate =
          await getUserById(
            req.userId
          );

        const candidateName =
          candidate?.name ||
          'Someone';

        const {
          error:
            notificationError,
        } = await db
          .from('notifications')
          .insert({
            id: genId(
              'notification'
            ),
            user_id:
              opportunity.posted_by_user_id,
            type:
              'opportunity_interest',
            title:
              'Someone is interested in your opportunity',
            body: `${candidateName} is interested in “${opportunity.title}.”`,
            link: `opportunities:${opportunity.id}`,
          });

        if (notificationError) {
          throw notificationError;
        }
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