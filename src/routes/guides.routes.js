const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const {
      data: rows,
      error,
    } = await db
      .from('users')
      .select(
        'id, name, guide_role, guide_focus'
      )
      .eq('is_guide', true)
      .order('name', {
        ascending: true,
      });

    if (error) {
      throw error;
    }

    res.json(
      (rows || []).map((row) => ({
        id: row.id,
        name: row.name,
        role: row.guide_role,
        focus: row.guide_focus,
      }))
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;