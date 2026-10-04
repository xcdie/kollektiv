const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const {
      data: rows,
      error,
    } = await db
      .from('milestones')
      .select('id, label')
      .order('sort_order', {
        ascending: true,
      });

    if (error) {
      throw error;
    }

    res.json(rows || []);
  } catch (error) {
    next(error);
  }
});

module.exports = router;