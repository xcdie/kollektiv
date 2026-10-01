const express = require('express');
const { z } = require('zod');

const db = require('../db');
const { genId } = require('../lib/id');
const { requireAuth, optionalAuth } = require('../lib/auth');
const { validateBody } = require('../lib/validate');
const { notFound, forbidden, badRequest } = require('../lib/errors');
const s = require('../lib/serialize');

const router = express.Router();

const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

const skillSchema = z.object({
  name: z.string().trim().min(1, 'Skill name is required').max(100),
  status: z.enum(['learning', 'can_demonstrate']),
});

const projectSchema = z.object({
  title: z.string().trim().min(1, 'Project title is required').max(200),
  description: z.string().trim().min(1, 'Project description is required').max(3000),
  link: z.string().trim().max(2048).optional().or(z.literal('')),
});

const profilePatchSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100).optional(),
  email: z.string().trim().toLowerCase().email('Enter a valid email').optional(),
  avatarUrl: z.union([z.string().trim().max(2048), z.null()]).optional().or(z.literal('')),
  goal: z.string().trim().max(2000).optional(),
  targetRole: z.string().trim().max(200).optional(),
  workPref: z.enum(['Remote', 'Hybrid', 'Onsite']).optional(),
  availability: z.enum(['Now', 'Open', 'Not looking']).optional(),
  memberType: z.enum(['explorer', 'emerging', 'practitioner', 'hiring']).optional(),
}).passthrough();

function sanitizeUserUpdates(body) {
  const updates = {};

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    updates.name = String(body.name).trim();
    if (!updates.name) throw badRequest('Name is required.');
  }

  if (Object.prototype.hasOwnProperty.call(body, 'email')) {
    updates.email = String(body.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
      throw badRequest('Enter a valid email.');
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'goal')) {
    updates.goal = String(body.goal ?? '').trim().slice(0, 2000);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'targetRole')) {
    updates.target_role = String(body.targetRole ?? '').trim().slice(0, 200);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'workPref')) {
    const value = String(body.workPref ?? '').trim();
    if (!['Remote', 'Hybrid', 'Onsite'].includes(value)) {
      throw badRequest('Invalid work preference.');
    }
    updates.work_pref = value;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'availability')) {
    const value = String(body.availability ?? '').trim();
    if (!['Now', 'Open', 'Not looking'].includes(value)) {
      throw badRequest('Invalid availability.');
    }
    updates.availability = value;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'avatarUrl')) {
    const value = body.avatarUrl;
    updates.avatar_url = value === '' || value == null ? null : String(value).trim();
  }

  if (Object.prototype.hasOwnProperty.call(body, 'memberType')) {
    const value = String(body.memberType ?? '').trim();
    if (!['explorer', 'emerging', 'practitioner', 'hiring'].includes(value)) {
      throw badRequest('Invalid member type.');
    }
    updates.member_type = value;
  }

  return updates;
}

function ensureUser(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw notFound('User');
  return user;
}

function milestoneRowsForUser(userId) {
  return db.prepare(`
    SELECT
      m.id,
      m.label,
      m.sort_order,
      CASE WHEN um.user_id IS NOT NULL THEN 1 ELSE 0 END AS completed
    FROM milestones m
    LEFT JOIN user_milestones um
      ON um.milestone_id = m.id AND um.user_id = ?
    ORDER BY m.sort_order
  `).all(userId);
}

function contributionRowsForUser(userId) {
  return db.prepare(`
    SELECT 'thread' AS type, t.id, t.title, c.name AS circle_name, t.created_at
    FROM threads t
    JOIN circles c ON c.id = t.circle_id
    WHERE t.author_id = ?
    UNION ALL
    SELECT 'reply' AS type, r.id, r.body AS title, c.name AS circle_name, r.created_at
    FROM replies r
    JOIN threads t ON t.id = r.thread_id
    JOIN circles c ON c.id = t.circle_id
    WHERE r.author_id = ?
    ORDER BY created_at DESC
  `).all(userId, userId);
}

function recognitionRowsForUser(userId) {
  return db.prepare(`
    SELECT r.id, r.text, r.created_at, u.name AS from_name
    FROM recognitions r
    LEFT JOIN users u ON u.id = r.from_user_id
    WHERE r.to_user_id = ?
    ORDER BY r.created_at DESC
  `).all(userId);
}

function profileBundle(userId) {
  const user = ensureUser(userId);

  const skills = db.prepare('SELECT * FROM skills WHERE user_id = ? ORDER BY created_at DESC').all(userId).map((row) => s.skill(row));
  const projects = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC').all(userId).map((row) => s.project(row));
  const recognitions = recognitionRowsForUser(userId).map((row) => ({
    id: row.id,
    text: row.text,
    from: row.from_name || 'Kollektiv',
    fromUser: row.from_name ? { id: userId, name: row.from_name } : null,
    createdAt: row.created_at,
  }));
  const contributions = contributionRowsForUser(userId).map((row) => ({
    type: row.type,
    circleName: row.circle_name,
    title: row.title,
    createdAt: row.created_at,
  }));
  const milestones = milestoneRowsForUser(userId).map((m) => ({
    id: m.id,
    label: m.label,
    completed: !!m.completed,
  }));
  const interestedOpportunityIds = db.prepare('SELECT opportunity_id FROM interests WHERE user_id = ? ORDER BY created_at DESC').all(userId).map((row) => row.opportunity_id);
  const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(userId);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatar_url || null,
    memberType: user.member_type || 'explorer',
    goal: user.goal || '',
    careerGoals: {
      targetRole: user.target_role || '',
      workPref: user.work_pref || 'Remote',
      availability: user.availability || 'Open',
    },
    skills,
    projects,
    contributions,
    recognitions,
    milestones,
    interestedOpportunityIds,
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.read_at,
      createdAt: n.created_at,
    })),
    isGuide: !!user.is_guide,
    memberTypeLabel: user.member_type || 'explorer',
    _meta: { createdAt: user.created_at },
  };
}

function publicProfile(userId) {
  const user = ensureUser(userId);
  const skills = db.prepare('SELECT * FROM skills WHERE user_id = ? ORDER BY created_at DESC').all(userId).map((row) => s.skill(row));
  const projects = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC').all(userId).map((row) => s.project(row));
  const contributions = contributionRowsForUser(userId).map((row) => ({
    type: row.type,
    circleName: row.circle_name,
    title: row.title,
    createdAt: row.created_at,
  }));
  const recognitions = recognitionRowsForUser(userId).map((row) => ({
    id: row.id,
    text: row.text,
    from: row.from_name || 'Kollektiv',
    createdAt: row.created_at,
  }));

  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatar_url || null,
    memberType: user.member_type || 'explorer',
    isGuide: !!user.is_guide,
    goal: user.goal || '',
    careerGoals: {
      targetRole: user.target_role || '',
      workPref: user.work_pref || 'Remote',
      availability: user.availability || 'Open',
    },
    skills,
    projects,
    contributions,
    recognitions,
  };
}

router.get('/me', requireAuth, (req, res) => {
  res.json(profileBundle(req.userId));
});

router.delete('/me', requireAuth, (req, res) => {
  const user = ensureUser(req.userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  res.json({ deleted: true, id: user.id });
});

router.patch('/me', requireAuth, validateBody(profilePatchSchema), (req, res) => {
  const user = ensureUser(req.userId);
  const updates = sanitizeUserUpdates(req.body);

  if (Object.keys(updates).length === 0) {
    return res.json(profileBundle(req.userId));
  }

  const columns = Object.keys(updates).map((key) => `${key} = ?`).join(', ');
  const values = Object.values(updates);

  db.prepare(`UPDATE users SET ${columns} WHERE id = ?`).run(...values, user.id);

  res.json(profileBundle(req.userId));
});

router.get('/:id', optionalAuth, (req, res) => {
  if (!ID_RE.test(req.params.id)) {
    throw badRequest('Invalid user ID format');
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) throw notFound('User');

  res.json(publicProfile(user.id));
});

router.post('/me/skills', requireAuth, validateBody(skillSchema), (req, res) => {
  const { name, status } = req.body;
  const id = genId('skill');

  db.prepare(
    `INSERT INTO skills (id, user_id, name, status) VALUES (?, ?, ?, ?)`
  ).run(id, req.userId, name, status);

  const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
  res.status(201).json(s.skill(row));
});

router.delete('/me/skills/:id', requireAuth, (req, res) => {
  if (!ID_RE.test(req.params.id)) {
    throw badRequest('Invalid skill ID format');
  }

  const result = db.prepare('DELETE FROM skills WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (result.changes === 0) {
    throw notFound('Skill');
  }

  res.status(204).send();
});

router.post('/me/projects', requireAuth, validateBody(projectSchema), (req, res) => {
  const { title, description, link } = req.body;
  const id = genId('project');

  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, user_id, title, description, link, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, req.userId, title, description, link || null, createdAt);

  db.prepare(`INSERT OR IGNORE INTO user_milestones (user_id, milestone_id) VALUES (?, 'm3')`).run(req.userId);

  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.status(201).json(s.project(row));
});

router.delete('/me/projects/:id', requireAuth, (req, res) => {
  if (!ID_RE.test(req.params.id)) {
    throw badRequest('Invalid project ID format');
  }

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) throw notFound('Project');
  if (project.user_id !== req.userId) {
    throw forbidden('You do not own that project.');
  }

  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

router.post('/me/milestones/:id/toggle', requireAuth, (req, res) => {
  if (!ID_RE.test(req.params.id)) {
    throw badRequest('Invalid milestone ID format');
  }

  const milestone = db.prepare('SELECT * FROM milestones WHERE id = ?').get(req.params.id);
  if (!milestone) throw notFound('Milestone');

  const existing = db.prepare('SELECT 1 FROM user_milestones WHERE user_id = ? AND milestone_id = ?').get(req.userId, req.params.id);

  if (existing) {
    db.prepare('DELETE FROM user_milestones WHERE user_id = ? AND milestone_id = ?').run(req.userId, req.params.id);
    return res.json({ id: req.params.id, completed: false });
  }

  db.prepare('INSERT INTO user_milestones (user_id, milestone_id) VALUES (?, ?)').run(req.userId, req.params.id);
  res.json({ id: req.params.id, completed: true });
});

router.get('/me/notifications', requireAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(req.userId);
  res.json(items.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    readAt: n.read_at,
    createdAt: n.created_at,
  })));
});

module.exports = router;