const express = require('express');
const { z } = require('zod');

const db = require('../db');
const {
  validateQuery,
} = require('../lib/validate');

const router = express.Router();

const searchSchema = z.object({
  q: z
    .string()
    .trim()
    .min(
      2,
      'Search must be at least 2 characters'
    )
    .max(100),

  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20),
});

router.get(
  '/',
  validateQuery(searchSchema),
  (req, res, next) => {
    try {
      const q = `%${req.query.q}%`;
      const limit =
        Number(req.query.limit) || 20;

      const threads = db
        .prepare(
          `SELECT
             t.id,
             t.title,
             t.body,
             c.slug AS circleSlug,
             c.name AS circleName,
             u.id AS authorId,
             u.name AS authorName
           FROM threads t
           JOIN circles c
             ON c.id = t.circle_id
           JOIN users u
             ON u.id = t.author_id
           WHERE
             t.title LIKE ?
             OR t.body LIKE ?
           ORDER BY t.created_at DESC
           LIMIT ?`
        )
        .all(q, q, limit)
        .map((row) => ({
          type: 'thread',
          id: row.id,
          title: row.title,
          excerpt: row.body,
          circleSlug:
            row.circleSlug,
          circleName:
            row.circleName,
          author: {
            id: row.authorId,
            name: row.authorName,
          },
        }));

      const circles = db
        .prepare(
          `SELECT
             id,
             slug,
             name,
             description
           FROM circles
           WHERE
             name LIKE ?
             OR description LIKE ?
           ORDER BY rowid
           LIMIT ?`
        )
        .all(q, q, limit)
        .map((row) => ({
          type: 'circle',
          id: row.id,
          slug: row.slug,
          title: row.name,
          excerpt:
            row.description,
        }));

      const guides = db
        .prepare(
          `SELECT
             id,
             name,
             guide_role AS role,
             guide_focus AS focus
           FROM users
           WHERE
             is_guide = 1
             AND (
               name LIKE ?
               OR guide_role LIKE ?
               OR guide_focus LIKE ?
             )
           ORDER BY name
           LIMIT ?`
        )
        .all(
          q,
          q,
          q,
          limit
        )
        .map((row) => ({
          type: 'guide',
          id: row.id,
          title: row.name,
          excerpt: [
            row.role,
            row.focus,
          ]
            .filter(Boolean)
            .join(' — '),
        }));

      const opportunities = db
        .prepare(
          `SELECT
             id,
             title,
             company,
             type,
             location,
             blurb
           FROM opportunities
           WHERE
             title LIKE ?
             OR company LIKE ?
             OR blurb LIKE ?
             OR location LIKE ?
           ORDER BY created_at DESC
           LIMIT ?`
        )
        .all(
          q,
          q,
          q,
          q,
          limit
        )
        .map((row) => ({
          type: 'opportunity',
          id: row.id,
          title: row.title,
          excerpt:
            `${row.company} · ${row.type} · ${row.location}`,
          body: row.blurb,
        }));

      res.json({
        query: req.query.q,
        results: [
          ...threads,
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