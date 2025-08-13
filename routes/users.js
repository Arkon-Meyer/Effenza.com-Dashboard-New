// routes/users.js
const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /users
router.get('/', (_req, res) => {
  const users = db.prepare('SELECT id, name, email FROM users').all();
  res.json(users);
});

// GET /users/me  (uses req.actor set by middleware/actor)
router.get('/me', (req, res) => {
  if (!req.actor) {
    return res.status(401).json({
      error: 'Missing or invalid X-User-Id',
      hint: 'Send a valid X-User-Id header matching a user in the database',
    });
  }
  res.json(req.actor);
});

// POST /users
router.post('/', (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

  try {
    const info = db
      .prepare('INSERT INTO users (name, email) VALUES (?, ?)')
      .run(name.trim(), email.trim());
    res.status(201).json({ id: info.lastInsertRowid, name: name.trim(), email: email.trim() });
  } catch (e) {
    res.status(400).json({ error: 'Email must be unique' });
  }
});

// PUT /users/:id
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, email } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

  const info = db
    .prepare('UPDATE users SET name = ?, email = ? WHERE id = ?')
    .run(name.trim(), email.trim(), id);

  if (!info.changes) return res.status(404).json({ error: 'User not found' });
  res.json({ id, name: name.trim(), email: email.trim() });
});

// DELETE /users/:id
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (!info.changes) return res.status(404).json({ error: 'User not found' });
  res.status(204).end();
});

module.exports = router;
