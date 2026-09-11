const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const theme = db.prepare('SELECT * FROM field_theme WHERE id = ?').get('current');
  const digestRows = db
    .prepare(
      `SELECT d.text, u.name as author_name
       FROM digest_items d LEFT JOIN users u ON u.id = d.author_id
       ORDER BY d.sort_order`
    )
    .all();
  const glossary = db.prepare('SELECT term, definition FROM glossary_terms ORDER BY sort_order').all();
  const learningRows = db
    .prepare('SELECT path, text FROM learning_path_items ORDER BY path, sort_order')
    .all();
  const roles = db
    .prepare('SELECT title, pay_range as payRange, note FROM roles ORDER BY sort_order')
    .all();
  const skillMapRows = db
    .prepare('SELECT category, name FROM skill_map_items ORDER BY category, sort_order')
    .all();

  const learningPaths = { starter: [], growing: [], advanced: [] };
  for (const row of learningRows) {
    if (learningPaths[row.path]) learningPaths[row.path].push(row.text);
  }

  const skillMap = {};
  for (const row of skillMapRows) {
    if (!skillMap[row.category]) skillMap[row.category] = [];
    skillMap[row.category].push(row.name);
  }

  res.json({
    theme: theme
      ? {
          name: theme.name,
          guideText: theme.guide_text,
          critiqueText: theme.critique_text,
          challengeText: theme.challenge_text,
          circleSlug: theme.circle_slug,
        }
      : null,
    digest: digestRows.map((d) => ({ text: d.text, by: d.author_name || 'the Kollektiv team' })),
    glossary,
    learningPaths,
    skillMap,
    roles,
  });
});

module.exports = router;
