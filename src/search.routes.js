const express = require('express');
const { z } = require('zod');

const db = require('../db');
const { optionalAuth } = require('../lib/auth');
const { validateQuery } = require('../lib/validate');

const router = express.Router();

const searchSchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, 'Search must be at least 2 characters')
    .max(100),
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

      /*
       * FIX: member search is only available to signed-in users, so the
       * member list can't be browsed anonymously. It also matches on name
       * only, so people never need to know or share a member ID.
       */
      const usersQuery = req.userId
        ? db
            .from('users')
            .select('id, name, member_type')
            .ilike('name', pattern)
            .order('name', { ascending: true })
            .limit(limit)
        : Promise.resolve({ data: [], error: null });

      const [
        threadsResult,
        usersResult,
        circlesResult,
        guidesResult,
        opportunitiesResult,
      ] = await Promise.all([
        db
          .from('threads')
          .select(`
            id,
            title,
            body,
            created_at,
            circles!inner (
              id,
              slug,
              name
            ),
            users!inner (
              id,
              name
            )
          `)
          .or(`title.ilike.${pattern},body.ilike.${pattern}`)
          .order('created_at', { ascending: false })
          .limit(limit),

        usersQuery,

        db
          .from('circles')
          .select('id, slug, name, description')
          .or(`name.ilike.${pattern},description.ilike.${pattern}`)
          .order('name', { ascending: true })
          .limit(limit),

        db
          .from('users')
          .select('id, name, guide_role, guide_focus, is_guide')
          .eq('is_guide', true)
          .or(
            `name.ilike.${pattern},guide_role.ilike.${pattern},guide_focus.ilike.${pattern}`
          )
          .order('name', { ascending: true })
          .limit(limit),

        db
          .from('opportunities')
          .select('id, title, company, type, location, blurb, created_at')
          .or(
            `title.ilike.${pattern},company.ilike.${pattern},blurb.ilike.${pattern},location.ilike.${pattern}`
          )
          .order('created_at', { ascending: false })
          .limit(limit),
      ]);

      if (threadsResult.error) throw threadsResult.error;
      if (usersResult.error) throw usersResult.error;
      if (circlesResult.error) throw circlesResult.error;
      if (guidesResult.error) throw guidesResult.error;
      if (opportunitiesResult.error) throw opportunitiesResult.error;

      const threads = (threadsResult.data || []).map((row) => ({
        type: 'thread',
        id: row.id,
        title: row.title,
        excerpt: row.body,
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
        // FIX: show the member's role instead of their raw ID.
        excerpt: MEMBER_TYPE_LABELS[row.member_type] || 'Member',
        name: row.name,
        memberType: row.member_type,
      }));

      const circles = (circlesResult.data || []).map((row) => ({
        type: 'circle',
        id: row.id,
        slug: row.slug,
        title: row.name,
        excerpt: row.description,
      }));

      const guides = (guidesResult.data || []).map((row) => ({
        type: 'guide',
        id: row.id,
        title: row.name,
        excerpt: [row.guide_role, row.guide_focus]
          .filter(Boolean)
          .join(' \u2014 '),
      }));

      const opportunities = (opportunitiesResult.data || []).map((row) => ({
        type: 'opportunity',
        id: row.id,
        title: row.title,
        excerpt: `${row.company} \u00b7 ${row.type} \u00b7 ${row.location}`,
        body: row.blurb,
      }));

      res.json({
        query: req.query.q,
        results: [
          ...threads,
          ...users,
          ...circles,
          ...guides,
          ...opportunities,
        ].slice(0, 100),
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;