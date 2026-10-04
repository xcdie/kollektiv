const express = require('express');
const { z } = require('zod');

const db = require('../db');
const { genId } = require('../lib/id');
const { requireAuth } = require('../lib/auth');
const { validateBody } = require('../lib/validate');

const {
  notFound,
  badRequest,
} = require('../lib/errors');

const router = express.Router();

const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

/* =========================================================
   VALIDATION
========================================================= */

const sendMessageSchema = z.object({
  toUserId: z
    .string()
    .trim()
    .min(1, 'Recipient is required')
    .max(128),

  text: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(2000),
});

/* =========================================================
   SERIALIZATION
========================================================= */

function serializeMessage(row) {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    text: row.body,
    createdAt: row.created_at,
    readAt: row.read_at || null,
  };
}

/* =========================================================
   HELPERS
========================================================= */

async function getUserById(userId) {
  const {
    data,
    error,
  } = await db
    .from('users')
    .select('id, name')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

/* =========================================================
   LIST CONVERSATIONS
   GET /messages
========================================================= */

router.get(
  '/',
  requireAuth,
  async (req, res, next) => {
    try {
      /*
       * Get all messages involving the
       * authenticated user.
       */
      const {
        data: rows,
        error,
      } = await db
        .from('messages')
        .select('*')
        .or(
          `from_user_id.eq.${req.userId},to_user_id.eq.${req.userId}`
        )
        .order('created_at', {
          ascending: false,
        });

      if (error) {
        throw error;
      }

      const conversations =
        new Map();

      /*
       * Build one conversation entry
       * for each other user.
       */
      for (const row of rows || []) {
        const otherUserId =
          row.from_user_id ===
          req.userId
            ? row.to_user_id
            : row.from_user_id;

        if (
          !conversations.has(
            otherUserId
          )
        ) {
          const otherUser =
            await getUserById(
              otherUserId
            );

          conversations.set(
            otherUserId,
            {
              userId:
                otherUserId,

              name:
                otherUser?.name ||
                'Unknown user',

              lastMessage:
                row.body,

              createdAt:
                row.created_at,
            }
          );
        }

        const conversation =
          conversations.get(
            otherUserId
          );

        /*
         * Keep the latest message
         * in the conversation.
         */
        if (
          !conversation.createdAt ||
          new Date(row.created_at) >
            new Date(
              conversation.createdAt
            )
        ) {
          conversation.createdAt =
            row.created_at;

          conversation.lastMessage =
            row.body;
        }
      }

      /*
       * Get unread message notification
       * counts for each conversation.
       */
      const items = [];

      for (
        const conversation of
          conversations.values()
      ) {
        const {
          count,
          error:
            unreadError,
        } = await db
          .from('notifications')
          .select('id', {
            count: 'exact',
            head: true,
          })
          .eq(
            'user_id',
            req.userId
          )
          .eq(
            'type',
            'message'
          )
          .eq(
            'link',
            `messages:${conversation.userId}`
          )
          .is(
            'read_at',
            null
          );

        if (unreadError) {
          throw unreadError;
        }

        items.push({
          userId:
            conversation.userId,

          name:
            conversation.name,

          lastMessage:
            conversation.lastMessage,

          createdAt:
            conversation.createdAt,

          unreadCount:
            Number(count || 0),
        });
      }

      /*
       * Newest conversations first.
       */
      items.sort(
        (a, b) =>
          new Date(b.createdAt) -
          new Date(a.createdAt)
      );

      res.json(items);
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   SEND MESSAGE
   POST /messages
========================================================= */

router.post(
  '/',
  requireAuth,
  validateBody(sendMessageSchema),
  async (req, res, next) => {
    try {
      if (
        req.body.toUserId ===
        req.userId
      ) {
        return next(
          badRequest(
            'You cannot message yourself.'
          )
        );
      }

      /*
       * Make sure recipient exists.
       */
      const recipient =
        await getUserById(
          req.body.toUserId
        );

      if (!recipient) {
        return next(
          notFound('User')
        );
      }

      /*
       * Get sender information for
       * the notification.
       */
      const sender =
        await getUserById(
          req.userId
        );

      if (!sender) {
        return next(
          notFound('User')
        );
      }

      const id =
        genId('message');

      const createdAt =
        new Date().toISOString();

      const text =
        req.body.text.trim();

      /*
       * Insert message.
       */
      const {
        data: message,
        error:
          messageError,
      } = await db
        .from('messages')
        .insert({
          id,
          from_user_id:
            req.userId,
          to_user_id:
            req.body.toUserId,
          body: text,
          created_at:
            createdAt,
          read_at: null,
        })
        .select('*')
        .single();

      if (messageError) {
        throw messageError;
      }

      /*
       * Create notification for recipient.
       */
      const preview =
        `${sender.name}: ${text.slice(0, 120)}${
          text.length > 120
            ? '…'
            : ''
        }`;

      const {
        error:
          notificationError,
      } = await db
        .from('notifications')
        .insert({
          id: genId(
            'notification'
          ),

          user_id:
            req.body.toUserId,

          type:
            'message',

          title:
            'New message',

          body:
            preview,

          link:
            `messages:${req.userId}`,

          read_at: null,
        });

      if (notificationError) {
        throw notificationError;
      }

      res
        .status(201)
        .json(
          serializeMessage(
            message
          )
        );
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   GET CONVERSATION
   GET /messages/:userId
========================================================= */

router.get(
  '/:userId',
  requireAuth,
  async (req, res, next) => {
    try {
      if (
        !ID_RE.test(
          req.params.userId
        )
      ) {
        return next(
          badRequest(
            'Invalid user ID format'
          )
        );
      }

      /*
       * Make sure the other user exists.
       */
      const otherUser =
        await getUserById(
          req.params.userId
        );

      if (!otherUser) {
        return next(
          notFound('User')
        );
      }

      /*
       * Get messages between the
       * authenticated user and the
       * selected user.
       */
      const {
        data: rows,
        error,
      } = await db
        .from('messages')
        .select('*')
        .or(
          `and(from_user_id.eq.${req.userId},to_user_id.eq.${req.params.userId}),and(from_user_id.eq.${req.params.userId},to_user_id.eq.${req.userId})`
        )
        .order('created_at', {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      res.json(
        (rows || []).map(
          serializeMessage
        )
      );
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;