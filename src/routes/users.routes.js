const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { genId } = require('../lib/id');
const { requireAuth } = require('../lib/auth');
const { validateBody } = require('../lib/validate');
const { notFound, forbidden, badRequest } = require('../lib/errors');
const s = require('../lib/serialize');

const router = express.Router();

// FIX: was isValidUUID, which rejected every ID this app actually generates
// (genId produces prefixed strings; milestones are seeded literals like 'm3').
const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

const validateIdParam = (req, res, next) => {
  if (!ID_RE.test(req.params.id)) {
    return next(badRequest('Invalid ID format'));
  }
  next();
};

/* ---------- shared query helpers ---------- */

function getMilestonesFor(userId) {
  return db
    .prepare(
      `SELECT m.id, m.label,
              CASE WHEN um.user_id IS NOT NULL THEN 1 ELSE 0 END as completed
       FROM milestones m
       LEFT JOIN user_milestones um ON um.milestone_id = m.id AND um.user_id = ?
       ORDER BY m.sort_order`
    )
    .all(userId)
    .map((r) => ({ id: r.id, label: r.label, completed: !!r.completed }));
}

function getContributionsFor(userId, limit = 10) {
  return db
    .prepare(
      `SELECT 'thread' as type, t.id as refId, t.title as title, c.name as circleName, t.created_at as createdAt
       FROM threads t JOIN circles c ON c.id = t.circle_id
       WHERE t.author_id = ?
       UNION ALL
       SELECT 'reply' as type, r.id as refId, th.title as title, c.name as circleName, r.created_at as createdAt
       FROM replies r JOIN threads th ON th.id = r.thread_id JOIN circles c ON c.id = th.circle_id
       WHERE r.author_id = ?
       ORDER BY createdAt DESC
       LIMIT ?`
    )
    .all(userId, userId, limit);
}

function getRecognitionsFor(userId) {
  return db
    .prepare(
      `SELECT r.*, u.name as from_name FROM recognitions r
       LEFT JOIN users u ON u.id = r.from_user_id
       WHERE r.to_user_id = ?
       ORDER BY r.created_at DESC`
    )
    .all(userId)
    .map((row) => s.recognition(row, row.from_name ? { name: row.from_name } : null));
}

function getSkillsFor(userId) {
  return db.prepare('SELECT * FROM skills WHERE user_id = ? ORDER BY created_at').all(userId).map(s.skill);
}

function getProjectsFor(userId) {
  return db
    .prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId)
    .map(s.project);
}

function checkOwnership(row, userId, what) {
  if (!row) return notFound(what);
  if (row.user_id !== userId) return forbidden(`That ${what.toLowerCase()} isn't yours to change.`);
  return null;
}

/* ---------- GET /api/users/me — full profile bundle ---------- */

router.get('/me', requireAuth, (req, res, next) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!user) return next(notFound('User'));

    const interestRows = db.prepare('SELECT opportunity_id FROM interests WHERE user_id = ?').all(req.userId);

    res.json({
      ...s.basicUser(user),
      goal: user.goal,
      careerGoals: {
        targetRole: user.target_role,
        workPref: user.work_pref,
        availability: user.availability,
      },
      isGuide: !!user.is_guide,
      guideRole: user.guide_role || null,
      guideFocus: user.guide_focus || null,
      skills: getSkillsFor(req.userId),
      projects: getProjectsFor(req.userId),
      milestones: getMilestonesFor(req.userId),
      contributions: getContributionsFor(req.userId),
      recognitions: getRecognitionsFor(req.userId),
      interestedOpportunityIds: interestRows.map((r) => r.opportunity_id),
    });
  } catch (error) {
    next(error);
  }
});

const MAX_AVATAR_DATA_URL_LENGTH = 2_000_000; // ~1.5MB image once base64-decoded
const avatarUrlSchema = z
  .string()
  .trim()
  .max(MAX_AVATAR_DATA_URL_LENGTH, 'Image is too large. Try a smaller photo.')
  .refine(
    (v) => v === '' || /^https?:\/\//.test(v) || /^data:image\/(png|jpe?g|webp|gif);base64,/.test(v),
    { message: 'Avatar must be an uploaded image or a valid http(s) image URL.' }
  )
  .optional();

const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  avatarUrl: avatarUrlSchema,
  goal: z.string().trim().max(280).optional(),
  targetRole: z.string().trim().max(120).optional(),
  workPref: z.enum(['Remote', 'Hybrid', 'Onsite']).optional(),
  availability: z.enum(['Now', 'Open', 'Not looking']).optional(),
});

router.patch('/me', requireAuth, validateBody(updateMeSchema), (req, res, next) => {
  try {
    const fields = req.body;
    const columnMap = {
      name: 'name',
      avatarUrl: 'avatar_url',
      goal: 'goal',
      targetRole: 'target_role',
      workPref: 'work_pref',
      availability: 'availability',
    };
    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries(columnMap)) {
      if (fields[key] !== undefined) {
        sets.push(`${column} = ?`);
        values.push(fields[key] === '' ? null : fields[key]);
      }
    }
    if (sets.length === 0) return next(badRequest('No recognized fields to update.'));
    values.push(req.userId);

    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    res.json({
      ...s.basicUser(user),
      goal: user.goal,
      careerGoals: { targetRole: user.target_role, workPref: user.work_pref, availability: user.availability },
    });
  } catch (error) {
    next(error);
  }
});

/* ---------- Skills ---------- */

const addSkillSchema = z.object({
  name: z.string().trim().min(1, 'Skill name is required').max(80),
  status: z.enum(['learning', 'can_demonstrate']),
});

router.post('/me/skills', requireAuth, validateBody(addSkillSchema), (req, res, next) => {
  try {
    const { name, status } = req.body;
    const id = genId('skill');

    db.prepare('INSERT INTO skills (id, user_id, name, status) VALUES (?, ?, ?, ?)').run(
      id,
      req.userId,
      name,
      status
    );
    const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
    res.status(201).json(s.skill(row));
  } catch (error) {
    next(error);
  }
});

router.delete('/me/skills/:id', requireAuth, validateIdParam, (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(req.params.id);
    const authError = checkOwnership(row, req.userId, 'Skill');
    if (authError) return next(authError);

    db.prepare('DELETE FROM skills WHERE id = ?').run(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

/* ---------- Projects ---------- */

const addProjectSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(140),
  description: z.string().trim().min(1, 'Description is required').max(1000),
  link: z.string().trim().url('Link must be a valid URL').max(300).optional().or(z.literal('')),
});

router.post('/me/projects', requireAuth, validateBody(addProjectSchema), (req, res, next) => {
  try {
    const { title, description, link } = req.body;
    const id = genId('proj');

    const executeProjectCreation = db.transaction(() => {
      // DIAGNOSTIC FIX: the previous INSERT didn't supply created_at. If
      // the `projects` table has created_at defined as NOT NULL without a
      // DEFAULT clause (unlike a table that has DEFAULT CURRENT_TIMESTAMP),
      // this statement throws a SQLITE_CONSTRAINT_NOTNULL error, which is
      // exactly what a bare 500 "Something went wrong on our end" looks
      // like from the client. Supplying it explicitly here is safe either
      // way. If projects still 500 after this change, the real cause is
      // something else in the schema — check the server's own log line for
      // that request (not just the response the browser sees), since the
      // generic error handler in app.js intentionally hides the detail
      // from the client.
      db.prepare(
        `INSERT INTO projects (id, user_id, title, description, link, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      ).run(id, req.userId, title, description, link || null);

      db.prepare('INSERT OR IGNORE INTO user_milestones (user_id, milestone_id) VALUES (?, ?)').run(
        req.userId,
        'm3'
      );
    });

    executeProjectCreation();

    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    res.status(201).json(s.project(row));
  } catch (error) {
    next(error);
  }
});

router.delete('/me/projects/:id', requireAuth, validateIdParam, (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    const authError = checkOwnership(row, req.userId, 'Project');
    if (authError) return next(authError);

    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

/* ---------- Milestones ---------- */

router.post('/me/milestones/:id/toggle', requireAuth, validateIdParam, (req, res, next) => {
  try {
    const milestone = db.prepare('SELECT * FROM milestones WHERE id = ?').get(req.params.id);
    if (!milestone) return next(notFound('Milestone'));

    const existing = db
      .prepare('SELECT 1 FROM user_milestones WHERE user_id = ? AND milestone_id = ?')
      .get(req.userId, req.params.id);

    if (existing) {
      db.prepare('DELETE FROM user_milestones WHERE user_id = ? AND milestone_id = ?').run(
        req.userId,
        req.params.id
      );
      return res.json({ id: req.params.id, completed: false });
    }

    db.prepare('INSERT INTO user_milestones (user_id, milestone_id) VALUES (?, ?)').run(req.userId, req.params.id);
    res.json({ id: req.params.id, completed: true });
  } catch (error) {
    next(error);
  }
});

/* ---------- GET /api/users/:id — public profile ---------- */

router.get('/:id', validateIdParam, (req, res, next) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return next(notFound('Member'));

    res.json({
      ...s.publicUser(user),
      goal: user.goal,
      careerGoals: {
        targetRole: user.target_role,
        workPref: user.work_pref,
        availability: user.availability,
      },
      isGuide: !!user.is_guide,
      guideRole: user.guide_role || null,
      guideFocus: user.guide_focus || null,
      skills: getSkillsFor(user.id),
      projects: getProjectsFor(user.id),
      milestones: getMilestonesFor(user.id),
      contributions: getContributionsFor(user.id),
      recognitions: getRecognitionsFor(user.id),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;