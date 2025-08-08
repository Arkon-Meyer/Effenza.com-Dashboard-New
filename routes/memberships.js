const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /memberships
router.get('/', (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT m.id, m.user_id, u.name AS user_name, m.group_id, g.name AS group_name, m.role
      FROM memberships m
      JOIN users u ON m.user_id = u.id
      JOIN groups g ON m.group_id = g.id
    `).all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /memberships
router.post('/', (req, res) => {
  const { user_id, group_id, role } = req.body;
  const validRoles = ['viewer', 'editor', 'group-admin', 'dashboard-admin'];

  if (!user_id || !group_id || !role) {
    return res.status(400).json({ error: 'user_id, group_id, and role are required' });
  }
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${validRoles.join(', ')}` });
  }

  try {
    const info = db.prepare(`
      INSERT INTO memberships (user_id, group_id, role)
      VALUES (?, ?, ?)
    `).run(user_id, group_id, role);
    res.status(201).json({ id: info.lastInsertRowid, user_id, group_id, role });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
