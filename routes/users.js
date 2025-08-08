const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /users
router.get('/', (_req, res) => {
  try {
    const rows = db.prepare('SELECT id, name, email FROM users').all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /users
router.post('/', (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  try {
    const info = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)').run(name, email);
    res.status(201).json({ id: info.lastInsertRowid, name, email });
  } catch (e) {
    res.status(400).json({ error: 'Email must be unique' });
  }
});

module.exports = router;
