
function isNotFound(error) {
  return Boolean(
    error &&
      (error.status === 404 ||
        error.code === 'user_not_found' ||
        /not found/i.test(error.message || ''))
  );
}

function createSupabaseRepo(db) {
  return {
    async markPending(userId) {
      const { error } = await db
        .from('users')
        .update({ deletion_requested_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) throw error;
    },

    async clearPending(userId) {
      const { error } = await db
        .from('users')
        .update({ deletion_requested_at: null })
        .eq('id', userId);

      if (error) throw error;
    },

    async deleteAuthUser(userId) {
      const { error } = await db.auth.admin.deleteUser(userId);

      // Already deleted counts as success so retries are safe.
      if (error && !isNotFound(error)) throw error;
    },

    async deleteProfile(userId) {
      const { error } = await db.from('users').delete().eq('id', userId);

      if (error) throw error;
    },

    async listPending(limit = 100) {
      const { data, error } = await db
        .from('users')
        .select('id')
        .not('deletion_requested_at', 'is', null)
        .limit(limit);

      if (error) throw error;

      return (data || []).map((row) => row.id);
    },
  };
}

async function deleteAccount(repo, userId, log = console) {
  await repo.markPending(userId);

  try {
    await repo.deleteAuthUser(userId);
  } catch (authError) {
    log.error(
      '[account-deletion] could not delete auth user',
      userId,
      authError && authError.message
    );

    try {
      await repo.clearPending(userId);
    } catch (clearError) {
      log.error(
        '[account-deletion] could not clear pending flag',
        userId,
        clearError && clearError.message
      );
    }

    return { status: 'failed' };
  }

  try {
    await repo.deleteProfile(userId);
    return { status: 'deleted' };
  } catch (profileError) {
    log.error(
      '[account-deletion] profile removal pending retry',
      userId,
      profileError && profileError.message
    );

    return { status: 'cleanup_pending' };
  }
}

async function finishPendingDeletions(repo, log = console) {
  const ids = await repo.listPending();

  let completed = 0;
  let failed = 0;

  for (const id of ids) {
    try {
      await repo.deleteAuthUser(id);
      await repo.deleteProfile(id);
      completed += 1;
    } catch (error) {
      failed += 1;
      log.error(
        '[account-deletion] retry failed',
        id,
        error && error.message
      );
    }
  }

  return { completed, failed };
}

module.exports = {
  createSupabaseRepo,
  deleteAccount,
  finishPendingDeletions,
};