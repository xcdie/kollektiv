const express = require('express');
const { z } = require('zod');

const db = require('../db');
const { genId } = require('../lib/id');

const {
  requireAuth,
  optionalAuth,
} = require('../lib/auth');

const {
  validateBody,
} = require('../lib/validate');

const {
  notFound,
  forbidden,
  badRequest,
} = require('../lib/errors');

const s = require('../lib/serialize');

const router = express.Router();

const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

/* =========================================================
   VALIDATION
========================================================= */

const validateIdParam = (req, res, next) => {
  if (!ID_RE.test(req.params.id)) {
    return next(
      badRequest('Invalid thread ID format')
    );
  }

  next();
};

const validateReplyIdParam = (req, res, next) => {
  if (!ID_RE.test(req.params.replyId)) {
    return next(
      badRequest('Invalid reply ID format')
    );
  }

  next();
};

/* =========================================================
   HELPERS
========================================================= */

async function getUserById(userId) {
  if (!userId) {
    return null;
  }

  const { data, error } = await db
    .from('users')
    .select('id, name, avatar_url, is_guide')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function getThreadById(threadId) {
  const { data, error } = await db
    .from('threads')
    .select('*')
    .eq('id', threadId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function getReplyById(replyId, threadId = null) {
  let query = db
    .from('replies')
    .select('*')
    .eq('id', replyId);

  if (threadId) {
    query = query.eq('thread_id', threadId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function getThreadLikeCount(threadId) {
  const { count, error } = await db
    .from('thread_likes')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('thread_id', threadId);

  if (error) {
    throw error;
  }

  return Number(count || 0);
}

async function getReplyLikeCount(replyId) {
  const { count, error } = await db
    .from('reply_likes')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('reply_id', replyId);

  if (error) {
    throw error;
  }

  return Number(count || 0);
}

async function hasThreadLike(threadId, userId) {
  if (!userId) {
    return false;
  }

  const { data, error } = await db
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

async function hasReplyLike(replyId, userId) {
  if (!userId) {
    return false;
  }

  const { data, error } = await db
    .from('reply_likes')
    .select('user_id')
    .eq('reply_id', replyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return !!data;
}

async function getCircleById(circleId) {
  if (!circleId) {
    return null;
  }

  const { data, error } = await db
    .from('circles')
    .select('id, name, slug')
    .eq('id', circleId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

/* =========================================================
   REPLY SERIALIZATION
========================================================= */

async function getReplyWithStats(replyId, currentUserId) {
  const row = await getReplyById(replyId);

  if (!row) {
    return null;
  }

  const author = await getUserById(row.author_id);

  const likeCount = await getReplyLikeCount(row.id);

  const liked = await hasReplyLike(
    row.id,
    currentUserId
  );

  return s.reply(
    row,
    author,
    likeCount,
    liked
  );
}

/* =========================================================
   GET THREAD
   GET /threads/:id
========================================================= */

router.get(
  '/:id',
  validateIdParam,
  optionalAuth,
  async (req, res, next) => {
    try {
      const thread = await getThreadById(
        req.params.id
      );

      if (!thread) {
        return next(
          notFound('Thread')
        );
      }

      const author = await getUserById(
        thread.author_id
      );

      const threadLikeCount =
        await getThreadLikeCount(thread.id);

      const likedByCurrentUser =
        await hasThreadLike(
          thread.id,
          req.userId
        );

      const { data: replyRows, error: repliesError } =
        await db
          .from('replies')
          .select('*')
          .eq('thread_id', thread.id)
          .order('created_at', {
            ascending: true,
          });

      if (repliesError) {
        throw repliesError;
      }

      const replies = await Promise.all(
        (replyRows || []).map(async (replyRow) => {
          const replier = await getUserById(
            replyRow.author_id
          );

          const likeCount =
            await getReplyLikeCount(
              replyRow.id
            );

          const liked =
            await hasReplyLike(
              replyRow.id,
              req.userId
            );

          return s.reply(
            replyRow,
            replier,
            likeCount,
            liked
          );
        })
      );

      res.json(
        s.threadDetail(
          thread,
          author,
          replies,
          threadLikeCount,
          likedByCurrentUser
        )
      );
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   CREATE REPLY
   POST /threads/:id/replies
========================================================= */

const newReplySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Say something first')
    .max(4000),
});

router.post(
  '/:id/replies',
  validateIdParam,
  requireAuth,
  validateBody(newReplySchema),
  async (req, res, next) => {
    try {
      const thread = await getThreadById(
        req.params.id
      );

      if (!thread) {
        return next(
          notFound('Thread')
        );
      }

      const id = genId('reply');

      const { data: reply, error: replyError } =
        await db
          .from('replies')
          .insert({
            id,
            thread_id: thread.id,
            author_id: req.userId,
            body: req.body.body,
          })
          .select('*')
          .single();

      if (replyError) {
        throw replyError;
      }

      /*
       * Notify the thread author.
       */
      if (
        thread.author_id &&
        thread.author_id !== req.userId
      ) {
        const notification = {
          id: genId('notification'),
          user_id: thread.author_id,
          type: 'reply',
          title: 'New reply to your discussion',
          body: `Someone replied to “${thread.title}”.`,
          link: `thread:${thread.id}`,
        };

        const {
          error: notificationError,
        } = await db
          .from('notifications')
          .insert(notification);

        if (notificationError) {
          throw notificationError;
        }
      }

      /*
       * Award milestone m2.
       *
       * upsert is used instead of SQLite's
       * INSERT OR IGNORE.
       */
      const {
        error: milestoneError,
      } = await db
        .from('user_milestones')
        .upsert(
          {
            user_id: req.userId,
            milestone_id: 'm2',
          },
          {
            onConflict: 'user_id,milestone_id',
            ignoreDuplicates: true,
          }
        );

      if (milestoneError) {
        throw milestoneError;
      }

      const completeReplyPayload =
        await getReplyWithStats(
          reply.id,
          req.userId
        );

      res
        .status(201)
        .json(completeReplyPayload);
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   MARK REPLY HELPFUL
   POST /threads/:id/replies/:replyId/helpful
========================================================= */

const helpfulSchema = z.object({
  note: z
    .string()
    .trim()
    .max(280)
    .optional(),
});

router.post(
  '/:id/replies/:replyId/helpful',
  validateIdParam,
  validateReplyIdParam,
  requireAuth,
  validateBody(helpfulSchema),
  async (req, res, next) => {
    try {
      const thread = await getThreadById(
        req.params.id
      );

      if (!thread) {
        return next(
          notFound('Thread')
        );
      }

      /*
       * Only the person who created the thread
       * can mark an answer as helpful.
       */
      if (
        thread.author_id !==
        req.userId
      ) {
        return next(
          forbidden(
            'Only the person who started this thread can mark a reply as helpful.'
          )
        );
      }

      const reply =
        await getReplyById(
          req.params.replyId,
          thread.id
        );

      if (!reply) {
        return next(
          notFound('Reply')
        );
      }

      /*
       * Users cannot mark their own reply
       * as helpful.
       */
      if (
        reply.author_id ===
        req.userId
      ) {
        return next(
          forbidden(
            'You cannot mark your own reply as helpful.'
          )
        );
      }

      const circle =
        await getCircleById(
          thread.circle_id
        );

      const text =
        req.body.note ||
        `Marked as a helpful answer in ${
          circle?.name || 'a circle'
        }.`;

      const alreadyHelpful =
        !!reply.is_helpful;

      /*
       * If it is already helpful, keep the
       * existing behavior and return the
       * current payload.
       */
      if (!alreadyHelpful) {
        const { error: updateError } =
          await db
            .from('replies')
            .update({
              is_helpful: true,
            })
            .eq('id', reply.id);

        if (updateError) {
          throw updateError;
        }

        /*
         * Create recognition.
         */
        const {
          error: recognitionError,
        } = await db
          .from('recognitions')
          .insert({
            id: genId('recog'),
            to_user_id: reply.author_id,
            from_user_id: req.userId,
            text,
          });

        if (recognitionError) {
          throw recognitionError;
        }

        /*
         * Notify the reply author.
         */
        const {
          error: notificationError,
        } = await db
          .from('notifications')
          .insert({
            id: genId('notification'),
            user_id: reply.author_id,
            type: 'recognition',
            title: 'Your reply was marked helpful',
            body: text,
            link: `thread:${thread.id}`,
          });

        if (notificationError) {
          throw notificationError;
        }
      }

      const updatedReplyPayload =
        await getReplyWithStats(
          reply.id,
          req.userId
        );

      res.json(
        updatedReplyPayload
      );
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   LIKE / UNLIKE THREAD
   POST /threads/:id/like
========================================================= */

router.post(
  '/:id/like',
  validateIdParam,
  requireAuth,
  async (req, res, next) => {
    try {
      const thread = await getThreadById(
        req.params.id
      );

      if (!thread) {
        return next(
          notFound('Thread')
        );
      }

      const existing =
        await hasThreadLike(
          thread.id,
          req.userId
        );

      if (existing) {
        /*
         * Unlike.
         */
        const {
          error: deleteError,
        } = await db
          .from('thread_likes')
          .delete()
          .eq('user_id', req.userId)
          .eq('thread_id', thread.id);

        if (deleteError) {
          throw deleteError;
        }
      } else {
        /*
         * Like.
         */
        const {
          error: insertError,
        } = await db
          .from('thread_likes')
          .insert({
            user_id: req.userId,
            thread_id: thread.id,
          });

        if (insertError) {
          /*
           * Ignore duplicate-key races.
           */
          if (
            insertError.code !== '23505'
          ) {
            throw insertError;
          }
        }
      }

      const count =
        await getThreadLikeCount(
          thread.id
        );

      res.json({
        liked: !existing,
        likeCount: Number(count),
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   LIKE / UNLIKE REPLY
   POST /threads/:id/replies/:replyId/like
========================================================= */

router.post(
  '/:id/replies/:replyId/like',
  validateIdParam,
  validateReplyIdParam,
  requireAuth,
  async (req, res, next) => {
    try {
      const thread = await getThreadById(
        req.params.id
      );

      if (!thread) {
        return next(
          notFound('Thread')
        );
      }

      const reply =
        await getReplyById(
          req.params.replyId,
          thread.id
        );

      if (!reply) {
        return next(
          notFound('Reply')
        );
      }

      const existing =
        await hasReplyLike(
          reply.id,
          req.userId
        );

      if (existing) {
        /*
         * Unlike reply.
         */
        const {
          error: deleteError,
        } = await db
          .from('reply_likes')
          .delete()
          .eq('user_id', req.userId)
          .eq('reply_id', reply.id);

        if (deleteError) {
          throw deleteError;
        }
      } else {
        /*
         * Like reply.
         */
        const {
          error: insertError,
        } = await db
          .from('reply_likes')
          .insert({
            user_id: req.userId,
            reply_id: reply.id,
          });

        if (insertError) {
          /*
           * Ignore duplicate-key races.
           */
          if (
            insertError.code !== '23505'
          ) {
            throw insertError;
          }
        }
      }

      const count =
        await getReplyLikeCount(
          reply.id
        );

      res.json({
        liked: !existing,
        likeCount: Number(count),
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;