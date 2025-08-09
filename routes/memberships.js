const express = require('express');
const router = express.Router();
const db = require('../database');

const VALID_ROLES = ['viewer', 'editor', 'group-admin', 'dashboard-admin'];

// GET /memberships
router.get('/', (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT m.id,
             m.user_id, u.name AS user_name,
             m.group_id, g.name AS group_name,
             m.role
      FROM memberships m
      JOIN users u  ON m.user_id  = u.id
      JOIN groups g ON m.group_id = g.id
      ORDER BY m.id
    `).all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /memberships
router.post('/', (req, res) => {
  const { user_id, group_id, role } = req.body;
  if (!user_id || !group_id || !role) {
    return res.status(400).json({ error: 'user_id, group_id, role required' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  try {
    // prevent duplicate membership (same user + group)
    const exists = db.prepare(
      'SELECT id FROM memberships WHERE user_id=? AND group_id=?'
    ).get(user_id, group_id);
    if (exists) return res.status(409).json({ error: 'Membership already exists for this user & group' });

    const info = db.prepare(
      'INSERT INTO memberships (user_id, group_id, role) VALUES (?, ?, ?)'
    ).run(user_id, group_id, role);

    res.status(201).json({ id: info.lastInsertRowid, user_id, group_id, role });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PUT /memberships/:id  (change role)
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { role } = req.body;
  if (!id || !role) return res.status(400).json({ error: 'id and role required' });
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(', ')}` });
  }
  try {
    const info = db.prepare('UPDATE memberships SET role=? WHERE id=?').run(role, id);
    if (info.changes === 0) return res.status(404).json({ error: 'Membership not found' });
    res.json({ id, role });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /memberships/:id
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    const info = db.prepare('DELETE FROM memberships WHERE id=?').run(id);
    if (info.changes === 0) return res.status(404).json({ error: 'Membership not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
