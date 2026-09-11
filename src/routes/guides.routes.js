const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT id, name, guide_role, guide_focus FROM users WHERE is_guide = 1 ORDER BY name').all();
  res.json(rows.map((r) => ({ id: r.id, name: r.name, role: r.guide_role, focus: r.guide_focus })));
});

module.exports = router;
