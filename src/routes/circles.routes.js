const express = require('express');
const { z } = require('zod');

const db = require('../db');

const {
  requireAuth,
  optionalAuth,
} = require('../lib/auth');

const { validateBody } = require('../lib/validate');
const { notFound, badRequest } = require('../lib/errors');
const { genId } = require('../lib/id');
const s = require('../lib/serialize');

const router = express.Router();

const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

/* =========================================================
   HELPERS
========================================================= */

async function getCircleBySlug(slug) {
  const {
    data,
    error,
  } = await db
    .from('circles')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function getCircleThreadCount(circleId) {
  const {
    count,
    error,
  } = await db
    .from('threads')
    .select('id', {
      count: 'exact',
      head: true,
    })
    .eq('circle_id', circleId);

  if (error) {
    throw error;
  }

  return Number(count || 0);
}

async function getUserById(userId) {
  if (!userId) {
    return null;
  }

  const {
    data,
    error,
  } = await db
    .from('users')
    .select(
      'id, name, avatar_url, is_guide'
    )
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function getThreadReplyCount(threadId) {
  const {
    count,
    error,
  } = await db
    .from('replies')
    .select('id', {
      count: 'exact',
      head: true,
    })
    .eq('thread_id', threadId);

  if (error) {
    throw error;
  }

  return Number(count || 0);
}

async function getThreadLikeCount(threadId) {
  const {
    count,
    error,
  } = await db
    .from('thread_likes')
    .select('user_id', {
      count: 'exact',
      head: true,
    })
    .eq('thread_id', threadId);

  if (error) {
    throw error;
  }

  return Number(count || 0);
}

async function hasThreadLike(
  threadId,
  userId
) {
  if (!userId) {
    return false;
  }

  const {
    data,
    error,
  } = await db
    .from('thread_likes')
    .select('user_id')
    .eq('thread_id', threadId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return !!data;
}

/* =========================================================
   LIST CIRCLES
   GET /circles
========================================================= */

router.get(
  '/',
  async (req, res, next) => {
    try {
      const {
        data: circles,
        error,
      } = await db
        .from('circles')
        .select('*')
        .order('id', {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      const result = await Promise.all(
        (circles || []).map(
          async (circle) => {
            const threadCount =
              await getCircleThreadCount(
                circle.id
              );

            return s.circle(
              circle,
              threadCount
            );
          }
        )
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   LIST THREADS IN CIRCLE
   GET /circles/:slug/threads
========================================================= */

router.get(
  '/:slug/threads',
  optionalAuth,
  async (req, res, next) => {
    try {
      const circle =
        await getCircleBySlug(
          req.params.slug
        );

      if (!circle) {
        return next(
          notFound('Circle')
        );
      }

      const {
        data: threads,
        error: threadsError,
      } = await db
        .from('threads')
        .select('*')
        .eq(
          'circle_id',
          circle.id
        )
        .order('created_at', {
          ascending: false,
        });

      if (threadsError) {
        throw threadsError;
      }

      const threadItems =
        await Promise.all(
          (threads || []).map(
            async (thread) => {
              const [
                author,
                replyCount,
                likeCount,
                liked,
              ] =
                await Promise.all([
                  getUserById(
                    thread.author_id
                  ),

                  getThreadReplyCount(
                    thread.id
                  ),

                  getThreadLikeCount(
                    thread.id
                  ),

                  hasThreadLike(
                    thread.id,
                    req.userId
                  ),
                ]);

              return s.threadSummary(
                thread,
                author,
                replyCount,
                likeCount,
                liked
              );
            }
          )
        );

      res.json({
        circle: s.circle(
          circle,
          threads?.length || 0
        ),

        threads: threadItems,
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   IMAGE VALIDATION
========================================================= */

const MAX_THREAD_IMAGE_LENGTH =
  2_000_000;

const imageUrlSchema = z
  .string()
  .trim()
  .max(
    MAX_THREAD_IMAGE_LENGTH,
    'Image is too large. Try a smaller photo.'
  )
  .refine(
    (value) =>
      value === '' ||
      /^https?:\/\//.test(value) ||
      /^data:image\/(png|jpe?g|webp|gif);base64,/.test(
        value
      ),
    {
      message:
        'Image must be a valid http(s) image URL or uploaded image.',
    }
  )
  .optional()
  .or(z.literal(''));

/* =========================================================
   CREATE THREAD
   POST /circles/:slug/threads
========================================================= */

const newThreadSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(160),

  body: z
    .string()
    .trim()
    .min(1, 'Add some detail')
    .max(4000),

  imageUrl: imageUrlSchema,
});

router.post(
  '/:slug/threads',
  requireAuth,
  validateBody(newThreadSchema),
  async (req, res, next) => {
    try {
      const circle =
        await getCircleBySlug(
          req.params.slug
        );

      if (!circle) {
        return next(
          notFound('Circle')
        );
      }

      const {
        title,
        body,
        imageUrl,
      } = req.body;

      const id =
        genId('thread');

      /*
       * Create thread.
       */
      const {
        data: thread,
        error: threadError,
      } = await db
        .from('threads')
        .insert({
          id,
          circle_id:
            circle.id,
          author_id:
            req.userId,
          title:
            title.trim(),
          body:
            body.trim(),
          image_url:
            imageUrl || null,
        })
        .select('*')
        .single();

      if (threadError) {
        throw threadError;
      }

      /*
       * Award milestone m2.
       *
       * This replaces SQLite's
       * INSERT OR IGNORE.
       */
      const {
        error:
          milestoneError,
      } = await db
        .from('user_milestones')
        .upsert(
          {
            user_id:
              req.userId,
            milestone_id:
              'm2',
          },
          {
            onConflict:
              'user_id,milestone_id',
            ignoreDuplicates:
              true,
          }
        );

      if (milestoneError) {
        throw milestoneError;
      }

      /*
       * Get thread author.
       */
      const author =
        await getUserById(
          req.userId
        );

      res
        .status(201)
        .json(
          s.threadSummary(
            thread,
            author,
            0,
            0,
            false
          )
        );
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;