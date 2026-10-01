const express = require('express');
const db = require('../db');

const router = express.Router();

const FIELD_CATALOG = [
  {
    slug: 'product-design-ux',
    name: 'Product Design & UX',
    summary: 'Design better experiences, sharpen your case studies, and build a portfolio that reads like real thinking.',
  },
  {
    slug: 'software-engineering',
    name: 'Software Engineering',
    summary: 'Ship production work, strengthen code quality, and learn how engineering teams collaborate in public.',
  },
  {
    slug: 'data-ai',
    name: 'Data & AI',
    summary: 'Turn messy signals into action, make evidence-driven decisions, and learn how to ship with AI responsibly.',
  },
  {
    slug: 'marketing-growth',
    name: 'Marketing & Growth',
    summary: 'Build traction, run experiments, and connect storytelling to clear customer outcomes.',
  },
  {
    slug: 'community-ops',
    name: 'Community & Ops',
    summary: 'Keep teams grounded, create reliable systems, and improve the experience around the work itself.',
  },
];

router.get('/', (req, res) => {
  const theme = db
    .prepare(
      'SELECT * FROM field_theme WHERE id = ?'
    )
    .get('current');

  const digestRows = db
    .prepare(
      `SELECT
         d.text,
         u.name AS author_name
       FROM digest_items d
       LEFT JOIN users u
         ON u.id = d.author_id
       ORDER BY d.sort_order`
    )
    .all();

  const glossary = db
    .prepare(
      `SELECT term, definition
       FROM glossary_terms
       ORDER BY sort_order`
    )
    .all();

  const learningRows = db
    .prepare(
      `SELECT path, text
       FROM learning_path_items
       ORDER BY path, sort_order`
    )
    .all();

  const roles = db
    .prepare(
      `SELECT
         title,
         pay_range AS payRange,
         note
       FROM roles
       ORDER BY sort_order`
    )
    .all();

  const skillMapRows = db
    .prepare(
      `SELECT category, name
       FROM skill_map_items
       ORDER BY category, sort_order`
    )
    .all();

  const learningPaths = {
    starter: [],
    growing: [],
    advanced: [],
  };

  for (const row of learningRows) {
    if (learningPaths[row.path]) {
      learningPaths[row.path].push(
        row.text
      );
    }
  }

  const skillMap = {};

  for (const row of skillMapRows) {
    if (!skillMap[row.category]) {
      skillMap[row.category] = [];
    }

    skillMap[row.category].push(
      row.name
    );
  }

  res.json({
    currentField: 'product-design-ux',
    fields: FIELD_CATALOG,
    theme: theme
      ? {
          name: theme.name,
          guideText: theme.guide_text,
          critiqueText:
            theme.critique_text,
          challengeText:
            theme.challenge_text,
          circleSlug:
            theme.circle_slug,
        }
      : null,

    digest: digestRows.map((d) => ({
      text: d.text,
      by:
        d.author_name ||
        'the Kollektiv team',
    })),

    glossary,

    learningPaths,

    skillMap,

    roles,
  });
});

module.exports = router;