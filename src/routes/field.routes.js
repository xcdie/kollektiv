const express = require('express');
const db = require('../db');

const router = express.Router();

const FIELD_CATALOG = [
  {
    slug: 'product-design-ux',
    name: 'Product Design & UX',
    summary:
      'Design better experiences, sharpen your case studies, and build a portfolio that reads like real thinking.',
  },
  {
    slug: 'software-engineering',
    name: 'Software Engineering',
    summary:
      'Ship production work, strengthen code quality, and learn how engineering teams collaborate in public.',
  },
  {
    slug: 'data-ai',
    name: 'Data & AI',
    summary:
      'Turn messy signals into action, make evidence-driven decisions, and learn how to ship with AI responsibly.',
  },
  {
    slug: 'marketing-growth',
    name: 'Marketing & Growth',
    summary:
      'Build traction, run experiments, and connect storytelling to clear customer outcomes.',
  },
  {
    slug: 'community-ops',
    name: 'Community & Ops',
    summary:
      'Keep teams grounded, create reliable systems, and improve the experience around the work itself.',
  },
];

router.get('/', async (req, res, next) => {
  try {
    /*
     * Current field theme
     */
    const {
      data: theme,
      error: themeError,
    } = await db
      .from('field_theme')
      .select('*')
      .eq('id', 'current')
      .maybeSingle();

    if (themeError) {
      throw themeError;
    }

    /*
     * Digest items + author names
     *
     * Fetch the digest items first, then
     * resolve the authors from users.
     */
    const {
      data: digestRows,
      error: digestError,
    } = await db
      .from('digest_items')
      .select(
        'text, author_id, sort_order'
      )
      .order('sort_order', {
        ascending: true,
      });

    if (digestError) {
      throw digestError;
    }

    const digestAuthorIds = [
      ...new Set(
        (digestRows || [])
          .map(
            (row) => row.author_id
          )
          .filter(Boolean)
      ),
    ];

    let digestAuthors = {};

    if (digestAuthorIds.length > 0) {
      const {
        data: authors,
        error: authorsError,
      } = await db
        .from('users')
        .select('id, name')
        .in(
          'id',
          digestAuthorIds
        );

      if (authorsError) {
        throw authorsError;
      }

      digestAuthors = Object.fromEntries(
        (authors || []).map(
          (author) => [
            author.id,
            author.name,
          ]
        )
      );
    }

    /*
     * Glossary
     */
    const {
      data: glossary,
      error: glossaryError,
    } = await db
      .from('glossary_terms')
      .select(
        'term, definition, sort_order'
      )
      .order('sort_order', {
        ascending: true,
      });

    if (glossaryError) {
      throw glossaryError;
    }

    /*
     * Learning path items
     */
    const {
      data: learningRows,
      error: learningError,
    } = await db
      .from('learning_path_items')
      .select(
        'path, text, sort_order'
      )
      .order('path', {
        ascending: true,
      })
      .order('sort_order', {
        ascending: true,
      });

    if (learningError) {
      throw learningError;
    }

    /*
     * Roles
     */
    const {
      data: rolesRows,
      error: rolesError,
    } = await db
      .from('roles')
      .select(
        'title, pay_range, note, sort_order'
      )
      .order('sort_order', {
        ascending: true,
      });

    if (rolesError) {
      throw rolesError;
    }

    /*
     * Skill map
     */
    const {
      data: skillMapRows,
      error: skillMapError,
    } = await db
      .from('skill_map_items')
      .select(
        'category, name, sort_order'
      )
      .order('category', {
        ascending: true,
      })
      .order('sort_order', {
        ascending: true,
      });

    if (skillMapError) {
      throw skillMapError;
    }

    /*
     * Build learning paths.
     */
    const learningPaths = {
      starter: [],
      growing: [],
      advanced: [],
    };

    for (const row of learningRows || []) {
      if (
        learningPaths[row.path]
      ) {
        learningPaths[row.path].push(
          row.text
        );
      }
    }

    /*
     * Build skill map.
     */
    const skillMap = {};

    for (
      const row of skillMapRows || []
    ) {
      if (!skillMap[row.category]) {
        skillMap[row.category] = [];
      }

      skillMap[row.category].push(
        row.name
      );
    }

    /*
     * Serialize roles.
     */
    const roles = (
      rolesRows || []
    ).map((row) => ({
      title: row.title,
      payRange: row.pay_range,
      note: row.note,
    }));

    /*
     * Serialize glossary.
     */
    const serializedGlossary = (
      glossary || []
    ).map((row) => ({
      term: row.term,
      definition: row.definition,
    }));

    /*
     * Serialize digest.
     */
    const digest = (
      digestRows || []
    ).map((row) => ({
      text: row.text,
      by:
        digestAuthors[row.author_id] ||
        'the Kollektiv team',
    }));

    /*
     * Return the same response structure
     * as the original SQLite route.
     */
    res.json({
      currentField:
        'product-design-ux',

      fields: FIELD_CATALOG,

      theme: theme
        ? {
            name: theme.name,

            guideText:
              theme.guide_text,

            critiqueText:
              theme.critique_text,

            challengeText:
              theme.challenge_text,

            circleSlug:
              theme.circle_slug,
          }
        : null,

      digest,

      glossary:
        serializedGlossary,

      learningPaths,

      skillMap,

      roles,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;