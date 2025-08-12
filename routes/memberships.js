const express = require('express');
const router = express.Router();
const db = require('../database');
const { isDashboardAdmin, canManageGroup } = require('../utils/acl');

// GET /memberships
// - dashboard-admin: all
// - others: only memberships for themselves
router.get('/', (req, res) => {
  const actorId = req.actor?.id;
  const dash = isDashboardAdmin(actorId);

  let rows;
  if (dash) {
    rows = db.prepare(`
      SELECT m.id, u.name AS user_name, g.name AS group_name, m.role
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      JOIN groups g ON g.id = m.group_id
      ORDER BY m.id
    `).all();
  } else if (actorId) {
    rows = db.prepare(`
      SELECT m.id, u.name AS user_name, g.name AS group_name, m.role
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      JOIN groups g ON g.id = m.group_id
      WHERE m.user_id = ?
      ORDER BY m.id
    `).all(actorId);
  } else {
    rows = [];
  }
  res.json(rows);
});

// POST /memberships (dashboard-admin or group-admin of that group)
router.post('/', (req, res) => {
  const actorId = req.actor?.id;
  const { user_id, group_id, role } = req.body || {};
  if (!user_id || !group_id || !role) return res.status(400).json({ error: 'user_id, group_id, role required' });

  if (!actorId || !canManageGroup(actorId, Number(group_id))) {
    return res.status(403).json({ error: 'not allowed' });
  }

  try {
    const info = db.prepare(`
      INSERT INTO memberships(user_id, group_id, role) VALUES (?, ?, ?)
    `).run(Number(user_id), Number(group_id), String(role));
    res.status(201).json({ id: info.lastInsertRowid, user_id, group_id, role });
  } catch (e) {
    const msg = String(e.message || '');
    if (msg.includes('uniq_membership')) {
      return res.status(400).json({ error: 'User already has a membership in this group' });
    }
    res.status(400).json({ error: 'Invalid membership (check user/group exist & role name)' });
  }
});

// PUT /memberships/:id (dashboard-admin or group-admin of that membership’s group)
router.put('/:id', (req, res) => {
  const actorId = req.actor?.id;
  const id = Number(req.params.id);
  const { role } = req.body || {};
  if (!role) return res.status(400).json({ error: 'role required' });

  const mem = db.prepare('SELECT * FROM memberships WHERE id=?').get(id);
  if (!mem) return res.status(404).json({ error: 'membership not found' });

  if (!actorId || !canManageGroup(actorId, mem.group_id)) {
    return res.status(403).json({ error: 'not allowed' });
  }
  db.prepare('UPDATE memberships SET role=? WHERE id=?').run(String(role), id);
  res.json({ id, role });
});

// DELETE /memberships/:id (dashboard-admin or group-admin of that membership’s group)
router.delete('/:id', (req, res) => {
  const actorId = req.actor?.id;
  const id = Number(req.params.id);
  const mem = db.prepare('SELECT * FROM memberships WHERE id=?').get(id);
  if (!mem) return res.status(404).json({ error: 'membership not found' });

  if (!actorId || !canManageGroup(actorId, mem.group_id)) {
    return res.status(403).json({ error: 'not allowed' });
  }
  db.prepare('DELETE FROM memberships WHERE id=?').run(id);
  res.json({ ok: true });
});

module.exports = router;
