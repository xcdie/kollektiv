router.patch('/me', requireAuth, validateBody(updateMeSchema), (req, res, next) => {
  try {
    const fields = req.body;
    const columnMap = {
      name: 'name',
      avatarUrl: 'avatar_url',
      goal: 'goal',
      targetRole: 'target_role',
      workPref: 'work_pref',
      availability: 'availability',
    };
    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries(columnMap)) {
      if (fields[key] !== undefined) {
        sets.push(`${column} = ?`);
        values.push(fields[key] === '' ? null : fields[key]);
      }
    }
    if (sets.length === 0) return next(badRequest('No recognized fields to update.'));
    values.push(req.userId);

    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    res.json({
      ...s.basicUser(user),
      goal: user.goal,
      careerGoals: { targetRole: user.target_role, workPref: user.work_pref, availability: user.availability },
    });
  } catch (error) {
    next(error);
  }
});