const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { createClient } = require('@supabase/supabase-js');

const supabase = require('../db');
const { genId } = require('../lib/id');
const { requireAuth } = require('../lib/auth');
const { validateBody } = require('../lib/validate');
const { conflict, unauthorized, notFound } = require('../lib/errors');
const { basicUser } = require('../lib/serialize');
const { signToken } = require('../lib/auth');
const googleAuth = require('../google.auth.routes');

const router = express.Router();

/* ---------- Rate limiter ---------- */
router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.AUTH_RATE_LIMIT || 200),
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/* ---------- Constants & schemas ---------- */
const MEMBER_TYPES = ['explorer', 'emerging', 'practitioner', 'hiring'];

const emailField = z.string().trim().toLowerCase().email('Enter a valid email');

const signupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: emailField,
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  memberType: z.enum(MEMBER_TYPES).default('explorer'),
});

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
});

// The frontend sends the signed Google ID token, never a name or email.
const googleSchema = z.object({
  credential: z.string().min(20, 'Missing Google credential').max(4096),
  memberType: z.enum(MEMBER_TYPES).default('explorer'),
});

/* ---------- Helpers ---------- */
// A throwaway anon client, so Google sessions never touch the shared service client.
function authClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createWelcomeNotification(userId) {
  const { error } = await supabase.from('notifications').insert({
    id: genId('notification'),
    user_id: userId,
    type: 'welcome',
    title: 'Welcome to Kollektiv',
    body: 'Your profile is ready. Explore your field, join a Circle, and start building proof of practice.',
    link: 'fieldHome',
    read_at: null,
  });
  if (error) console.error('Failed to create welcome notification:', error.message);
}

/* =========================================================
   SIGNUP  POST /auth/signup
========================================================= */
router.post('/signup', validateBody(signupSchema), async (req, res, next) => {
  try {
    const { name, email, password, memberType } = req.body;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, member_type: memberType },
    });

    if (authError) {
      const message = authError.message?.toLowerCase() || '';
      if (message.includes('already') || message.includes('exists') || message.includes('duplicate')) {
        return next(conflict('An account with that email already exists.'));
      }
      return next(new Error(authError.message));
    }

    const userId = authData?.user?.id;
    if (!userId) return next(new Error('Supabase did not return the created user.'));

    const { data: user, error: profileError } = await supabase
      .from('users')
      .insert({
        id: userId,
        name,
        email,
        member_type: memberType,
        goal: '',
        bio: '',
        location: '',
        field: '',
        experience_level: '',
        education: '',
        certifications: '',
        target_role: '',
        work_pref: 'Remote',
        availability: 'Open',
        is_guide: false,
      })
      .select('*')
      .single();

    if (profileError) {
      try {
        await supabase.auth.admin.deleteUser(userId);
      } catch (cleanupError) {
        console.error('Failed to clean up Auth user:', cleanupError.message);
      }
      return next(new Error(profileError.message));
    }

    await createWelcomeNotification(userId);

    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (sessionError || !sessionData?.session) {
      return next(unauthorized('Account created, but automatic login failed. Please log in again.'));
    }

    return res.status(201).json({
      token: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
      user: basicUser(user),
    });
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   LOGIN  POST /auth/login
========================================================= */
router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const { data: sessionData, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError || !sessionData?.user || !sessionData?.session) {
      return next(unauthorized('Incorrect email or password.'));
    }

    const { data: user, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', sessionData.user.id)
      .maybeSingle();

    if (profileError) return next(new Error(profileError.message));
    if (!user) return next(notFound('User'));

    return res.json({
      token: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
      user: basicUser(user),
    });
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   GOOGLE  POST /auth/google
   Body: { credential: <Google ID token>, memberType? }
========================================================= */
router.post('/google', validateBody(googleSchema), async (req, res, next) => {
  try {
    const { credential, memberType } = req.body;

    // Supabase verifies the Google token (signature, audience, expiry).
    const { data: sessionData, error: signInError } = await authClient().auth.signInWithIdToken({
      provider: 'google',
      token: credential,
    });

    if (signInError || !sessionData?.user || !sessionData?.session) {
      console.error('Google sign-in failed:', signInError?.message);
      return next(unauthorized('Google sign-in could not be verified.'));
    }

    const authUser = sessionData.user;
    const meta = authUser.user_metadata || {};

    // Find the profile; create it the first time this person signs in.
    let { data: user, error: lookupError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    if (lookupError) return next(new Error(lookupError.message));

    if (!user) {
      const email = (authUser.email || '').toLowerCase();
      const name = (meta.full_name || meta.name || email.split('@')[0] || 'Member').slice(0, 100);

      const { data: created, error: insertError } = await supabase
        .from('users')
        .insert({
          id: authUser.id,
          name,
          email,
          member_type: memberType,
          avatar_url: meta.avatar_url || meta.picture || '',
          goal: '',
          bio: '',
          location: '',
          field: '',
          experience_level: '',
          education: '',
          certifications: '',
          target_role: '',
          work_pref: 'Remote',
          availability: 'Open',
          is_guide: false,
        })
        .select('*')
        .single();

      if (insertError) return next(new Error(insertError.message));
      user = created;
      await createWelcomeNotification(authUser.id);
    }

    return res.json({
      token: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
      user: basicUser(user),
    });
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   CURRENT USER  GET /auth/me
========================================================= */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.userId)
      .maybeSingle();

    if (error) return next(new Error(error.message));
    if (!user) return next(notFound('User'));

    return res.json({ user: basicUser(user) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;