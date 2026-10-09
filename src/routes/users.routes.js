const express = require('express');
const { z } = require('zod');

const db = require('../db');
const { genId } = require('../lib/id');
const { requireAuth, optionalAuth } = require('../lib/auth');
const { validateBody } = require('../lib/validate');
const { notFound, badRequest } = require('../lib/errors');

const router = express.Router();

/* =========================================================
   VALIDATION SCHEMAS
   (Each route's handler still does its own detailed checks;
   these schemas guarantee the body is an object with the
   right basic types.)
========================================================= */

const optionalText = (max) => z.string().max(max).nullable().optional();

const updateProfileSchema = z.object({
  name: optionalText(100),
  goal: optionalText(1000),
  target_role: optionalText(200),
  work_pref: optionalText(200),
  availability: optionalText(200),
  bio: optionalText(5000),
  location: optionalText(200),
  website: optionalText(2048),
  guide_role: optionalText(200),
  guide_focus: optionalText(500),
  field: optionalText(200),
  experience_level: optionalText(200),
  education: optionalText(500),
  certifications: optionalText(2000),
  careerGoals: z
    .object({
      targetRole: optionalText(200),
      workPref: optionalText(200),
      availability: optionalText(200),
    })
    .optional(),
  // Size and format are validated in the handler.
  avatarUrl: z.string().nullable().optional(),
});

const addSkillSchema = z.object({
  name: z.string(),
  status: z.string().optional(),
});

const addProjectSchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
});

/* =========================================================
   HELPERS
========================================================= */

/*
 * Run an optional profile section without letting a failure in it
 * take down the whole request. If the query fails, the real reason
 * is logged and the section falls back to an empty value.
 */
async function safely(label, promise, fallback) {
  try {
    return await promise;
  } catch (err) {
    console.error(
      `[getProfile] ${label} failed:`,
      err.message,
      '| code:',
      err.code,
      '| details:',
      err.details,
      '| hint:',
      err.hint
    );
    return fallback;
  }
}

async function getUserById(id) {
  const { data, error } = await db
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function getSkills(userId) {
  const { data, error } = await db
    .from('skills')
    .select('id, name, status')
    .eq('user_id', userId)
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

async function getProjects(userId) {
  const { data, error } = await db
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

async function getMilestones(userId) {
  const { data: milestones, error: milestoneError } = await db
    .from('milestones')
    .select('id, label, sort_order')
    .order('sort_order', { ascending: true });

  if (milestoneError) {
    throw milestoneError;
  }

  const { data: earned, error: earnedError } = await db
    .from('user_milestones')
    .select('milestone_id')
    .eq('user_id', userId);

  if (earnedError) {
    throw earnedError;
  }

  const earnedIds = new Set(
    (earned || []).map((row) => String(row.milestone_id))
  );

  return (milestones || []).map((milestone) => ({
    id: milestone.id,
    label: milestone.label,
    earned: earnedIds.has(String(milestone.id)),
  }));
}

async function getContributions(userId) {
  const { data: threads, error: threadError } = await db
    .from('threads')
    .select('id, title, created_at')
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (threadError) {
    throw threadError;
  }

  const { data: replies, error: replyError } = await db
    .from('replies')
    .select('id, thread_id, body, created_at')
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (replyError) {
    throw replyError;
  }

  return {
    threads: threads || [],
    replies: replies || [],
  };
}

// FIX: column is to_user_id, not user_id (Postgres error 42703).
async function getRecognitions(userId) {
  const { data, error } = await db
    .from('recognitions')
    .select('*')
    .eq('to_user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

async function getInterestedOpportunityIds(userId) {
  const { data, error } = await db
    .from('interests')
    .select('opportunity_id')
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return (data || []).map((row) => row.opportunity_id);
}

async function getProfile(userId) {
  // The core profile row must succeed; if this throws, it is a real error.
  const user = await getUserById(userId);

  if (!user) {
    return null;
  }

  // Each optional section is isolated so one bad query can't 500 /me.
  const [
    skills,
    projects,
    milestones,
    contributions,
    recognitions,
    interestedOpportunityIds,
  ] = await Promise.all([
    safely('skills', getSkills(userId), []),
    safely('projects', getProjects(userId), []),
    safely('milestones', getMilestones(userId), []),
    safely('contributions', getContributions(userId), {
      threads: [],
      replies: [],
    }),
    safely('recognitions', getRecognitions(userId), []),
    safely('interests', getInterestedOpportunityIds(userId), []),
  ]);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatar_url || null,
    memberType: user.member_type || 'explorer',
    goal: user.goal || '',

    careerGoals: {
      targetRole: user.target_role || '',
      workPref: user.work_pref || '',
      availability: user.availability || '',
    },

    isGuide: Boolean(user.is_guide),
    guideRole: user.guide_role || '',
    guideFocus: user.guide_focus || '',

    bio: user.bio || '',
    location: user.location || '',
    website: user.website || '',

    field: user.field || '',
    experienceLevel: user.experience_level || '',
    education: user.education || '',
    certifications: user.certifications || '',

    skills,
    projects,
    milestones,
    contributions,
    recognitions,
    interestedOpportunityIds,
  };
}

/* =========================================================
   GET /me
========================================================= */

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const profile = await getProfile(req.userId);

    if (!profile) {
      throw notFound('User profile not found.');
    }

    res.json(profile);
  } catch (error) {
    console.error('[GET /users/me] failed:', error.message, error.code);
    next(error);
  }
});

/* =========================================================
   DELETE /me
========================================================= */

router.delete('/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId;

    // Delete the profile first. Your foreign keys should use
    // ON DELETE CASCADE where appropriate.
    const { data: deletedUser, error: profileError } = await db
      .from('users')
      .delete()
      .eq('id', userId)
      .select('id')
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!deletedUser) {
      throw notFound('User profile not found.');
    }

    // Delete the Supabase Auth account.
    const { error: authError } = await db.auth.admin.deleteUser(userId);

    if (authError) {
      console.error('Auth account deletion failed:', authError.message);

      throw new Error(
        'Profile was deleted, but the authentication account could not be deleted. Contact support.'
      );
    }

    res.json({
      ok: true,
      message: 'Account deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   PATCH /me
========================================================= */

router.patch(
  '/me',
  requireAuth,
  validateBody(updateProfileSchema), // FIX: was validateBody((body) => body)
  async (req, res, next) => {
    try {
      const userId = req.userId;
      const body = req.body || {};

      const allowedFields = [
        'name',
        'goal',
        'target_role',
        'work_pref',
        'availability',
        'bio',
        'location',
        'website',
        'guide_role',
        'guide_focus',
        'field',
        'experience_level',
        'education',
        'certifications',
      ];

      const updates = {};

      for (const field of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          updates[field] = body[field];
        }
      }

      // Support frontend careerGoals format.
      if (body.careerGoals && typeof body.careerGoals === 'object') {
        if (Object.prototype.hasOwnProperty.call(body.careerGoals, 'targetRole')) {
          updates.target_role = body.careerGoals.targetRole;
        }

        if (Object.prototype.hasOwnProperty.call(body.careerGoals, 'workPref')) {
          updates.work_pref = body.careerGoals.workPref;
        }

        if (Object.prototype.hasOwnProperty.call(body.careerGoals, 'availability')) {
          updates.availability = body.careerGoals.availability;
        }
      }

      // Avatar validation.
      if (Object.prototype.hasOwnProperty.call(body, 'avatarUrl')) {
        const avatarUrl = body.avatarUrl;

        if (avatarUrl !== null && typeof avatarUrl !== 'string') {
          throw badRequest('Invalid avatar.');
        }

        if (typeof avatarUrl === 'string' && avatarUrl.length > 2000000) {
          throw badRequest('Avatar is too large.');
        }

        if (
          typeof avatarUrl === 'string' &&
          avatarUrl &&
          !/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(avatarUrl) &&
          !/^https?:\/\//i.test(avatarUrl)
        ) {
          throw badRequest('Unsupported avatar format.');
        }

        updates.avatar_url = avatarUrl;
      }

      // Nothing to update.
      if (Object.keys(updates).length === 0) {
        const profile = await getProfile(userId);

        if (!profile) {
          throw notFound('User profile not found.');
        }

        return res.json(profile);
      }

      updates.updated_at = new Date().toISOString();

      const { error } = await db
        .from('users')
        .update(updates)
        .eq('id', userId);

      if (error) {
        throw error;
      }

      const profile = await getProfile(userId);

      if (!profile) {
        throw notFound('User profile not found.');
      }

      res.json(profile);
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   GET /:id
========================================================= */

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const profile = await getProfile(req.params.id);

    if (!profile) {
      throw notFound('User not found.');
    }

    // Never expose another user's email.
    if (req.userId !== req.params.id) {
      delete profile.email;
    }

    res.json(profile);
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   POST /me/skills
========================================================= */

router.post(
  '/me/skills',
  requireAuth,
  validateBody(addSkillSchema), // FIX: was validateBody((body) => body)
  async (req, res, next) => {
    try {
      const userId = req.userId;
      const { name, status } = req.body || {};

      if (!name || typeof name !== 'string') {
        throw badRequest('Skill name is required.');
      }

      const skillName = name.trim();

      if (!skillName) {
        throw badRequest('Skill name is required.');
      }

      if (skillName.length > 100) {
        throw badRequest('Skill name is too long.');
      }

      const skillStatus = status || 'learning';

      if (!['learning', 'can_demonstrate'].includes(skillStatus)) {
        throw badRequest(
          'Skill status must be learning or can_demonstrate.'
        );
      }

      const { data: existing, error: existingError } = await db
        .from('skills')
        .select('id, name, status')
        .eq('user_id', userId)
        .ilike('name', skillName)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      // Update an existing skill.
      if (existing) {
        const { data, error } = await db
          .from('skills')
          .update({
            name: skillName,
            status: skillStatus,
          })
          .eq('id', existing.id)
          .eq('user_id', userId)
          .select('id, name, status')
          .single();

        if (error) {
          throw error;
        }

        return res.json(data);
      }

      // Create new skill.
      const { data, error } = await db
        .from('skills')
        .insert({
          id: genId('skill'),
          user_id: userId,
          name: skillName,
          status: skillStatus,
        })
        .select('id, name, status')
        .single();

      if (error) {
        throw error;
      }

      res.status(201).json(data);
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   DELETE /me/skills/:id
========================================================= */

router.delete('/me/skills/:id', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('skills')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select('id')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw notFound('Skill not found.');
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   POST /me/projects
========================================================= */

router.post(
  '/me/projects',
  requireAuth,
  validateBody(addProjectSchema), // FIX: was validateBody((body) => body)
  async (req, res, next) => {
    try {
      const userId = req.userId;
      const body = req.body || {};

      const title =
        typeof body.title === 'string' ? body.title.trim() : '';

      const description =
        typeof body.description === 'string'
          ? body.description.trim()
          : '';

      const url =
        typeof body.url === 'string' ? body.url.trim() : null;

      if (!title) {
        throw badRequest('Project title is required.');
      }

      if (title.length > 200) {
        throw badRequest('Project title is too long.');
      }

      if (description.length > 5000) {
        throw badRequest('Project description is too long.');
      }

      if (url && !/^https?:\/\//i.test(url)) {
        throw badRequest(
          'Project URL must start with http:// or https://.'
        );
      }

      const project = {
        id: genId('project'),
        user_id: userId,
        title,
        description,
        url,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await db
        .from('projects')
        .insert(project)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      // Award the project milestone. Users should not manually toggle
      // milestones.
      const { error: milestoneError } = await db
        .from('user_milestones')
        .upsert(
          {
            user_id: userId,
            milestone_id: 'm3',
          },
          {
            onConflict: 'user_id,milestone_id',
            ignoreDuplicates: true,
          }
        );

      if (milestoneError) {
        console.error(
          'Failed to award project milestone:',
          milestoneError.message
        );
      }

      res.status(201).json(data);
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   DELETE /me/projects/:id
========================================================= */

router.delete('/me/projects/:id', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('projects')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select('id')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw notFound('Project not found.');
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   GET /me/notifications
========================================================= */

router.get('/me/notifications', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('notifications')
      .select('id, type, title, body, link, read_at, created_at')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    res.json(data || []);
  } catch (error) {
    next(error);
  }
});

module.exports = router;