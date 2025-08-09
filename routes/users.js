const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /users
router.get('/', (_req, res) => {
  try {
    const rows = db.prepare('SELECT id, name, email FROM users ORDER BY id').all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /users
router.post('/', (req, res) => {
  const { name, email } = req.body;
  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  try {
    const info = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)').run(name.trim(), email.trim());
    res.status(201).json({ id: info.lastInsertRowid, name: name.trim(), email: email.trim() });
  } catch (e) {
    res.status(400).json({ error: 'Email must be unique' });
  }
});

// PUT /users/:id
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, email } = req.body;
  if (!id || !name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'id, name, email required' });
  }
  try {
    const info = db.prepare('UPDATE users SET name=?, email=? WHERE id=?')
                   .run(name.trim(), email.trim(), id);
    if (info.changes === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ id, name: name.trim(), email: email.trim() });
  } catch (e) {
    res.status(400).json({ error: 'Email must be unique' });
  }
});

// DELETE /users/:id
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'id required' });

  try {
    const info = db.prepare('DELETE FROM users WHERE id=?').run(id);
    if (info.changes === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
