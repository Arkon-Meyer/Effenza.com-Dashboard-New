// routes/users.js
const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /users
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT id, name, email FROM users ORDER BY id').all();
  res.json(rows);
});

// 👇 ADD THIS — must be before /:id
// GET /users/me  (requires header: X-User-Id: <id>)
router.get('/me', (req, res) => {
  if (!req.actor) return res.status(401).json({ error: 'Missing or invalid X-User-Id' });
  res.json(req.actor);
});

// POST /users
router.post('/', (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  try {
    const info = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)').run(name.trim(), email.trim());
    res.status(201).json({ id: info.lastInsertRowid, name, email });
  } catch (e) {
    res.status(400).json({ error: 'Email must be unique' });
  }
});

// PUT /users/:id
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, email } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  const info = db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(name.trim(), email.trim(), id);
  if (!info.changes) return res.status(404).json({ error: 'User not found' });
  res.json({ id, name, email });
});

// DELETE /users/:id
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (!info.changes) return res.status(404).json({ error: 'User not found' });
  res.status(204).end();
});

module.exports = router;
