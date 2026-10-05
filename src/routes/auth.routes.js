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

const router = express.Router();

/* =========================================================
   RATE LIMITER
========================================================= */

router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.AUTH_RATE_LIMIT || 200),
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/* =========================================================
   CONSTANTS & SCHEMAS
========================================================= */

const MEMBER_TYPES = [
  'explorer',
  'emerging',
  'practitioner',
  'hiring',
];

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email');

const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name is too long'),

  email: emailField,

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200, 'Password is too long'),

  memberType: z
    .enum(MEMBER_TYPES)
    .default('explorer'),
});

const loginSchema = z.object({
  email: emailField,

  password: z
    .string()
    .min(1, 'Password is required'),
});

const googleSchema = z.object({
  credential: z
    .string()
    .min(20, 'Missing Google credential')
    .max(4096, 'Invalid Google credential'),

  memberType: z
    .enum(MEMBER_TYPES)
    .default('explorer'),
});

/* =========================================================
   HELPERS
========================================================= */

/*
 * Create a separate anonymous Supabase client for Google
 * ID-token authentication.
 *
 * This prevents the shared server/service client from
 * accidentally maintaining a user session.
 */
function authClient() {
  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_ANON_KEY
  ) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_ANON_KEY must be configured.'
    );
  }

  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}

/* =========================================================
   WELCOME NOTIFICATION
========================================================= */

async function createWelcomeNotification(userId) {
  const { error } = await supabase
    .from('notifications')
    .insert({
      id: genId('notification'),
      user_id: userId,
      type: 'welcome',
      title: 'Welcome to Kollektiv',
      body:
        'Your profile is ready. Explore your field, join a Circle, and start building proof of practice.',
      link: 'fieldHome',
      read_at: null,
    });

  if (error) {
    console.error(
      'Failed to create welcome notification:',
      error.message
    );
  }
}

/* =========================================================
   CREATE PROFILE
========================================================= */

async function createUserProfile({
  userId,
  name,
  email,
  memberType,
  avatarUrl = '',
}) {
  const { data, error } = await supabase
    .from('users')
    .insert({
      id: userId,
      name,
      email,
      member_type: memberType,

      avatar_url: avatarUrl,

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
      guide_role: '',
      guide_focus: '',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

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
       * Create the Supabase Auth account.
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
        const message =
          authError.message?.toLowerCase() || '';

        if (
          message.includes('already') ||
          message.includes('exists') ||
          message.includes('duplicate')
        ) {
          return next(
            conflict(
              'An account with that email already exists.'
            )
          );
        }

        return next(
          new Error(authError.message)
        );
      }

      const userId = authData?.user?.id;

      if (!userId) {
        return next(
          new Error(
            'Supabase did not return the created user.'
          )
        );
      }

      /*
       * Create the Kollektiv profile.
       */
      let user;

      try {
        user = await createUserProfile({
          userId,
          name,
          email,
          memberType,
        });
      } catch (profileError) {
        /*
         * Roll back the Auth account if profile creation
         * fails.
         */
        try {
          await supabase.auth.admin.deleteUser(userId);
        } catch (cleanupError) {
          console.error(
            'Failed to clean up Auth user:',
            cleanupError.message
          );
        }

        return next(
          new Error(profileError.message)
        );
      }

      /*
       * Welcome notification should never prevent
       * successful registration.
       */
      await createWelcomeNotification(userId);

      /*
       * Automatically sign the user in.
       */
      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.signInWithPassword({
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

      return res.status(201).json({
        token: sessionData.session.access_token,
        refreshToken:
          sessionData.session.refresh_token,

        user: basicUser(user),
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
      } = await supabase.auth.signInWithPassword({
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

      const {
        data: user,
        error: profileError,
      } = await supabase
        .from('users')
        .select('*')
        .eq('id', sessionData.user.id)
        .maybeSingle();

      if (profileError) {
        return next(
          new Error(profileError.message)
        );
      }

      /*
       * Auth account exists but profile does not.
       * Create a profile automatically instead of
       * returning a broken login.
       */
      if (!user) {
        const authUser = sessionData.user;
        const metadata =
          authUser.user_metadata || {};

        const name =
          metadata.name ||
          metadata.full_name ||
          email.split('@')[0];

        try {
          const createdUser =
            await createUserProfile({
              userId: authUser.id,
              name: String(name).slice(0, 100),
              email,
              memberType:
                metadata.member_type ||
                'explorer',
              avatarUrl:
                metadata.avatar_url ||
                metadata.picture ||
                '',
            });

          await createWelcomeNotification(
            authUser.id
          );

          return res.json({
            token:
              sessionData.session.access_token,

            refreshToken:
              sessionData.session.refresh_token,

            user: basicUser(createdUser),
          });
        } catch (createError) {
          return next(
            new Error(createError.message)
          );
        }
      }

      return res.json({
        token:
          sessionData.session.access_token,

        refreshToken:
          sessionData.session.refresh_token,

        user: basicUser(user),
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   GOOGLE LOGIN
   POST /auth/google

   Body:
   {
     credential: Google ID token,
     memberType?: explorer | emerging | practitioner | hiring
   }
========================================================= */

router.post(
  '/google',
  validateBody(googleSchema),
  async (req, res, next) => {
    try {
      const {
        credential,
        memberType,
      } = req.body;

      /*
       * Supabase verifies:
       * - Google token signature
       * - expiry
       * - issuer
       * - audience
       */
      const {
        data: sessionData,
        error: signInError,
      } = await authClient().auth.signInWithIdToken({
        provider: 'google',
        token: credential,
      });

      if (
        signInError ||
        !sessionData?.user ||
        !sessionData?.session
      ) {
        console.error(
          'Google sign-in failed:',
          signInError?.message
        );

        return next(
          unauthorized(
            'Google sign-in could not be verified.'
          )
        );
      }

      const authUser = sessionData.user;
      const metadata =
        authUser.user_metadata || {};

      /*
       * Look for an existing Kollektiv profile.
       */
      let {
        data: user,
        error: lookupError,
      } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (lookupError) {
        return next(
          new Error(lookupError.message)
        );
      }

      /*
       * First Google login.
       * Create the Kollektiv profile.
       */
      if (!user) {
        const email =
          (authUser.email || '').trim().toLowerCase();

        if (!email) {
          return next(
            unauthorized(
              'Google account did not provide an email address.'
            )
          );
        }

        const name = String(
          metadata.full_name ||
            metadata.name ||
            email.split('@')[0] ||
            'Member'
        ).slice(0, 100);

        try {
          user = await createUserProfile({
            userId: authUser.id,
            name,
            email,
            memberType,
            avatarUrl:
              metadata.avatar_url ||
              metadata.picture ||
              '',
          });
        } catch (insertError) {
          /*
           * Handle race condition where another request
           * created the profile at the same time.
           */
          if (
            insertError.code === '23505'
          ) {
            const {
              data: existingUser,
              error: retryError,
            } = await supabase
              .from('users')
              .select('*')
              .eq('id', authUser.id)
              .maybeSingle();

            if (retryError || !existingUser) {
              return next(
                new Error(
                  retryError?.message ||
                    insertError.message
                )
              );
            }

            user = existingUser;
          } else {
            return next(
              new Error(insertError.message)
            );
          }
        }

        /*
         * Only create the welcome notification for
         * a newly created profile.
         */
        await createWelcomeNotification(
          authUser.id
        );
      }

      return res.json({
        token:
          sessionData.session.access_token,

        refreshToken:
          sessionData.session.refresh_token,

        user: basicUser(user),
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
        .eq('id', req.userId)
        .maybeSingle();

      if (error) {
        return next(
          new Error(error.message)
        );
      }

      if (!user) {
        return next(
          notFound('User')
        );
      }

      return res.json({
        user: basicUser(user),
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;