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

/* =========================================================
   AUTH RATE LIMITER
========================================================= */

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(
    process.env.AUTH_RATE_LIMIT || 200
  ),
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(authLimiter);

/* =========================================================
   CONSTANTS
========================================================= */

const MEMBER_TYPES = [
  'explorer',
  'emerging',
  'practitioner',
  'hiring',
];

/* =========================================================
   VALIDATION
========================================================= */

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
    .min(
      8,
      'Password must be at least 8 characters'
    )
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
    .min(
      1,
      'Password is required'
    ),
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

/* =========================================================
   SIGNUP
   POST /auth/signup
========================================================= */

router.post(
  '/signup',
  validateBody(signupSchema),
  async (req, res, next) => {
    try {
      const {
        name,
        email,
        password,
        memberType,
      } = req.body;

      /*
       * Create Supabase Auth account.
       */
      const {
        data: authData,
        error: authError,
      } =
        await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,

          user_metadata: {
            name,
            member_type:
              memberType,
          },
        });

      if (authError) {
        const message =
          authError.message?.toLowerCase() ||
          '';

        if (
          message.includes('already') ||
          message.includes('exists') ||
          message.includes(
            'duplicate'
          )
        ) {
          return next(
            conflict(
              'An account with that email already exists.'
            )
          );
        }

        return next(
          new Error(
            authError.message
          )
        );
      }

      const authUser =
        authData?.user;

      if (!authUser?.id) {
        return next(
          new Error(
            'Supabase did not return the created user.'
          )
        );
      }

      const userId =
        authUser.id;

      /*
       * Create Kollektiv profile.
       */
      const {
        data: user,
        error:
          profileError,
      } = await supabase
        .from('users')
        .insert({
          id: userId,
          name,
          email,
          member_type:
            memberType,

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
         * Remove the Auth account so we do not
         * leave an orphaned Supabase Auth user.
         */
        try {
          await supabase.auth.admin.deleteUser(
            userId
          );
        } catch (cleanupError) {
          console.error(
            'Failed to clean up Auth user after profile creation failed:',
            cleanupError.message
          );
        }

        return next(
          new Error(
            profileError.message
          )
        );
      }

      /*
       * Create welcome notification.
       *
       * Notification failure should not prevent
       * successful account creation.
       */
      const {
        error:
          notificationError,
      } = await supabase
        .from('notifications')
        .insert({
          id: genId(
            'notification'
          ),

          user_id:
            userId,

          type:
            'welcome',

          title:
            'Welcome to Kollektiv',

          body:
            'Your profile is ready. Explore your field, join a Circle, and start building proof of practice.',

          link:
            'fieldHome',

          read_at: null,
        });

      if (notificationError) {
        console.error(
          'Failed to create welcome notification:',
          notificationError.message
        );
      }

      /*
       * Sign in immediately so the frontend
       * receives an access token.
       */
      const {
        data: sessionData,
        error:
          sessionError,
      } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (
        sessionError ||
        !sessionData?.session
      ) {
        return next(
          unauthorized(
            'Account created, but automatic login failed. Please log in again.'
          )
        );
      }

      return res
        .status(201)
        .json({
          token:
            sessionData.session
              .access_token,

          refreshToken:
            sessionData.session
              .refresh_token,

          user:
            basicUser(user),
        });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   LOGIN
   POST /auth/login
========================================================= */

router.post(
  '/login',
  validateBody(loginSchema),
  async (req, res, next) => {
    try {
      const {
        email,
        password,
      } = req.body;

      const {
        data: sessionData,
        error: loginError,
      } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (
        loginError ||
        !sessionData?.user ||
        !sessionData?.session
      ) {
        return next(
          unauthorized(
            'Incorrect email or password.'
          )
        );
      }

      /*
       * Load Kollektiv profile.
       */
      const {
        data: user,
        error:
          profileError,
      } = await supabase
        .from('users')
        .select('*')
        .eq(
          'id',
          sessionData.user.id
        )
        .maybeSingle();

      if (profileError) {
        return next(
          new Error(
            profileError.message
          )
        );
      }

      if (!user) {
        return next(
          notFound('User')
        );
      }

      return res.json({
        token:
          sessionData.session
            .access_token,

        refreshToken:
          sessionData.session
            .refresh_token,

        user:
          basicUser(user),
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   GOOGLE AUTH COMPATIBILITY ENDPOINT
   POST /auth/google
========================================================= */

router.post(
  '/google',
  validateBody(googleSchema),
  async (req, res, next) => {
    try {
      const {
        email,
      } = req.body;

      /*
       * This endpoint does NOT create a fake
       * Google account or fake password.
       *
       * Real Google authentication should be
       * performed through Supabase OAuth.
       */
      const {
        data: existingUser,
        error:
          lookupError,
      } = await supabase
        .from('users')
        .select('*')
        .eq(
          'email',
          email
        )
        .maybeSingle();

      if (lookupError) {
        return next(
          new Error(
            lookupError.message
          )
        );
      }

      if (!existingUser) {
        return res
          .status(400)
          .json({
            error:
              'Google authentication must be completed through Supabase OAuth.',
          });
      }

      return res.json({
        user:
          basicUser(
            existingUser
          ),

        requiresOAuth:
          true,

        message:
          'Use Supabase Google OAuth to authenticate this account.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   CURRENT USER
   GET /auth/me
========================================================= */

router.get(
  '/me',
  requireAuth,
  async (req, res, next) => {
    try {
      const {
        data: user,
        error,
      } = await supabase
        .from('users')
        .select('*')
        .eq(
          'id',
          req.userId
        )
        .maybeSingle();

      if (error) {
        return next(
          new Error(
            error.message
          )
        );
      }

      if (!user) {
        return next(
          notFound('User')
        );
      }

      return res.json({
        user:
          basicUser(user),
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;