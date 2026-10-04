const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');

const supabase = require('../db');
const { genId } = require('../lib/id');
const { requireAuth } = require('../lib/auth');

const { validateBody } = require('../lib/validate');
const {
  conflict,
  unauthorized,
  notFound,
} = require('../lib/errors');

const { basicUser } = require('../lib/serialize');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 200),
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(authLimiter);

const MEMBER_TYPES = [
  'explorer',
  'emerging',
  'practitioner',
  'hiring',
];

const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email'),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200),

  memberType: z
    .enum(MEMBER_TYPES)
    .default('explorer'),
});

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email'),

  password: z
    .string()
    .min(1, 'Password is required'),
});

const googleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email'),

  avatarUrl: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .or(z.literal('')),
});

/*
|--------------------------------------------------------------------------
| SIGNUP
|--------------------------------------------------------------------------
*/

router.post(
  '/signup',
  validateBody(signupSchema),
  async (req, res) => {
    const {
      name,
      email,
      password,
      memberType,
    } = req.body;

    /*
     * Create the account in Supabase Auth.
     */
    const {
      data: authData,
      error: authError,
    } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        member_type: memberType,
      },
    });

    if (authError) {
      if (
        authError.message?.toLowerCase().includes('already') ||
        authError.message?.toLowerCase().includes('exists')
      ) {
        throw conflict(
          'An account with that email already exists.'
        );
      }

      throw new Error(authError.message);
    }

    const authUser = authData.user;

    if (!authUser) {
      throw new Error(
        'Supabase did not return the created user.'
      );
    }

    /*
     * Create the Kollektiv profile.
     */
    const id = authUser.id;

    const {
      data: user,
      error: profileError,
    } = await supabase
      .from('users')
      .insert({
        id,
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
      /*
       * If the profile creation fails, remove the
       * Supabase Auth account so signup does not leave
       * an orphaned authentication record.
       */
      await supabase.auth.admin.deleteUser(id);

      throw new Error(profileError.message);
    }

    /*
     * Welcome notification.
     */
    const {
      error: notificationError,
    } = await supabase
      .from('notifications')
      .insert({
        id: genId('notification'),
        user_id: id,
        type: 'welcome',
        title: 'Welcome to Kollektiv',
        body:
          'Your profile is ready. Explore your field, join a Circle, and start building proof of practice.',
        link: 'fieldHome',
      });

    if (notificationError) {
      console.error(
        'Failed to create welcome notification:',
        notificationError.message
      );
    }

    /*
     * Sign the user in so the frontend receives an
     * access token immediately.
     */
    const {
      data: sessionData,
      error: sessionError,
    } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (sessionError) {
      throw unauthorized(
        'Account created, but automatic login failed. Please log in again.'
      );
    }

    res.status(201).json({
      token: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
      user: basicUser(user),
    });
  }
);

/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

router.post(
  '/login',
  validateBody(loginSchema),
  async (req, res) => {
    const {
      email,
      password,
    } = req.body;

    const {
      data: sessionData,
      error: loginError,
    } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError || !sessionData.user) {
      throw unauthorized(
        'Incorrect email or password.'
      );
    }

    const {
      data: user,
      error: profileError,
    } = await supabase
      .from('users')
      .select('*')
      .eq('id', sessionData.user.id)
      .maybeSingle();

    if (profileError) {
      throw new Error(profileError.message);
    }

    if (!user) {
      throw notFound('User');
    }

    res.json({
      token: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
      user: basicUser(user),
    });
  }
);

/*
|--------------------------------------------------------------------------
| GOOGLE
|--------------------------------------------------------------------------
|
| The frontend should normally use Supabase OAuth directly:
|
| supabase.auth.signInWithOAuth({
|   provider: 'google'
| })
|
| This endpoint is retained so your existing frontend does
| not immediately break. It creates/updates the Kollektiv
| profile but does NOT fake Google authentication with a
| password.
|
|--------------------------------------------------------------------------
*/

router.post(
  '/google',
  validateBody(googleSchema),
  async (req, res) => {
    const {
      name,
      email,
      avatarUrl,
    } = req.body;

    const {
      data: existingUser,
      error: lookupError,
    } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (lookupError) {
      throw new Error(lookupError.message);
    }

    if (!existingUser) {
      /*
       * Do not create a fake-password Google account here.
       *
       * Real Google OAuth should be handled by Supabase Auth.
       */
      return res.status(400).json({
        error:
          'Google authentication must be completed through Supabase OAuth.',
      });
    }

    res.json({
      user: basicUser(existingUser),
      requiresOAuth: true,
      message:
        'Use Supabase Google OAuth to authenticate this account.',
    });
  }
);

/*
|--------------------------------------------------------------------------
| CURRENT USER
|--------------------------------------------------------------------------
*/

router.get(
  '/me',
  requireAuth,
  async (req, res) => {
    const {
      data: user,
      error,
    } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!user) {
      throw notFound('User');
    }

    res.json({
      user: basicUser(user),
    });
  }
);

module.exports = router;