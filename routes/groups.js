const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /groups
router.get('/', (_req, res) => {
  try {
    const rows = db.prepare('SELECT id, name FROM groups').all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /groups
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Group name is required' });
  try {
    const info = db.prepare('INSERT INTO groups (name) VALUES (?)').run(name);
    res.status(201).json({ id: info.lastInsertRowid, name });
  } catch (e) {
    res.status(400).json({ error: 'Group name must be unique' });
  }
});

module.exports = router;
