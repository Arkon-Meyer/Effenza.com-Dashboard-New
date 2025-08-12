const express = require('express');
const router = express.Router();
const db = require('../database');
const { isDashboardAdmin, canManageGroup } = require('../utils/acl');

// GET /groups (everyone can read)
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT id, name FROM groups ORDER BY id').all();
  res.json(rows);
});

// POST /groups (dashboard-admin only)
router.post('/', (req, res) => {
  if (!req.actor || !isDashboardAdmin(req.actor.id)) {
    return res.status(403).json({ error: 'dashboard-admin required' });
  }
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const info = db.prepare('INSERT INTO groups(name) VALUES (?)').run(name.trim());
    res.status(201).json({ id: info.lastInsertRowid, name: name.trim() });
  } catch {
    res.status(400).json({ error: 'Group name must be unique' });
  }
});

// PUT /groups/:id (group-admin of that group or dashboard-admin)
router.put('/:id', (req, res) => {
  const groupId = Number(req.params.id);
  if (!req.actor || !canManageGroup(req.actor.id, groupId)) {
    return res.status(403).json({ error: 'not allowed' });
  }
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const info = db.prepare('UPDATE groups SET name=? WHERE id=?').run(name.trim(), groupId);
  if (!info.changes) return res.status(404).json({ error: 'group not found' });
  res.json({ id: groupId, name: name.trim() });
});

// DELETE /groups/:id (dashboard-admin only — safer)
router.delete('/:id', (req, res) => {
  if (!req.actor || !isDashboardAdmin(req.actor.id)) {
    return res.status(403).json({ error: 'dashboard-admin required' });
  }
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM groups WHERE id=?').run(id);
  if (!info.changes) return res.status(404).json({ error: 'group not found' });
  res.json({ ok: true });
});

module.exports = router;
