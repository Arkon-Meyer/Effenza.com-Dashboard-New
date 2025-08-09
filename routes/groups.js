const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /groups
router.get('/', (_req, res) => {
  try {
    const rows = db.prepare('SELECT id, name FROM groups ORDER BY id').all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /groups
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Group name is required' });
  try {
    const info = db.prepare('INSERT INTO groups (name) VALUES (?)').run(name.trim());
    res.status(201).json({ id: info.lastInsertRowid, name: name.trim() });
  } catch (e) {
    res.status(400).json({ error: 'Group name must be unique' });
  }
});

// PUT /groups/:id
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name } = req.body;
  if (!id || !name?.trim()) return res.status(400).json({ error: 'id and name required' });

  try {
    const info = db.prepare('UPDATE groups SET name=? WHERE id=?').run(name.trim(), id);
    if (info.changes === 0) return res.status(404).json({ error: 'Group not found' });
    res.json({ id, name: name.trim() });
  } catch (e) {
    res.status(400).json({ error: 'Group name must be unique' });
  }
});

// DELETE /groups/:id
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'id required' });

  try {
    const info = db.prepare('DELETE FROM groups WHERE id=?').run(id);
    if (info.changes === 0) return res.status(404).json({ error: 'Group not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
