const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT id, label FROM milestones ORDER BY sort_order').all();
  res.json(rows);
});

module.exports = router;
