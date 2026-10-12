
const express = require('express');
const { z } = require('zod');

const db = require('../db');
const { optionalAuth } = require('../lib/auth');
const { validateQuery } = require('../lib/validate');

const router = express.Router();

const searchSchema = z.object({
  q: z.string().trim().min(2, 'Search must be at least 2 characters').max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const MEMBER_TYPE_LABELS = {
  explorer: 'Explorer',
  emerging: 'Emerging professional',
  practitioner: 'Practitioner',
  hiring: 'Hiring partner',
};

function escapeSearch(value) {
  return value
    .replace(/[\\%_]/g, '\\$&')
    .replace(/[,()"]/g, ' ')
    .trim();
}

router.get(
  '/',
  optionalAuth,
  validateQuery(searchSchema),
  async (req, res, next) => {
    try {
      const search = escapeSearch(req.query.q);
      const limit = Number(req.query.limit) || 20;
      const pattern = `%${search}%`;

      const [
        threadsResult,
        usersResult,
        circlesResult,
        opportunitiesResult,
      ] = await Promise.all([
        db
          .from('threads')
          .select(`
            id,
            title,
            body,
            created_at,
            circles (
              id,
              slug,
              name
            ),
            users (
              id,
              name
            )
          `)
          .or(`title.ilike.${pattern},body.ilike.${pattern}`)
          .order('created_at', { ascending: false })
          .limit(limit),

        req.userId
          ? db
              .from('users')
              .select('id, name, member_type')
              .ilike('name', pattern)
              .order('name', { ascending: true })
              .limit(limit)
          : Promise.resolve({ data: [], error: null }),

        db
          .from('circles')
          .select('id, slug, name, description')
          .or(`name.ilike.${pattern},description.ilike.${pattern}`)
          .order('name', { ascending: true })
          .limit(limit),

        db
          .from('opportunities')
          .select('id, title, company, type, location, blurb, created_at')
          .ilike('title', pattern)
          .order('created_at', { ascending: false })
          .limit(limit),
      ]);

      for (const result of [
        threadsResult,
        usersResult,
        circlesResult,
        opportunitiesResult,
      ]) {
        if (result.error) {
          console.error('Search database error:', result.error);
          throw result.error;
        }
      }

      const threads = (threadsResult.data || []).map((row) => ({
        type: 'thread',
        id: row.id,
        title: row.title,
        excerpt: row.body || '',
        circleSlug: row.circles?.slug || null,
        circleName: row.circles?.name || null,
        author: row.users
          ? {
              id: row.users.id,
              name: row.users.name,
            }
          : null,
      }));

      const users = (usersResult.data || []).map((row) => ({
        type: 'user',
        id: row.id,
        title: row.name,
        name: row.name,
        memberType: row.member_type,
        excerpt: MEMBER_TYPE_LABELS[row.member_type] || 'Member',
      }));

      const circles = (circlesResult.data || []).map((row) => ({
        type: 'circle',
        id: row.id,
        slug: row.slug,
        title: row.name,
        excerpt: row.description || '',
      }));

      const opportunities = (opportunitiesResult.data || []).map((row) => ({
        type: 'opportunity',
        id: row.id,
        title: row.title,
        excerpt: [row.company, row.type, row.location]
          .filter(Boolean)
          .join(' · '),
        body: row.blurb || '',
      }));

      return res.json({
        query: req.query.q,
        results: [
          ...threads,
          ...users,
          ...circles,
          ...opportunities,
        ].slice(0, 100),
      });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
