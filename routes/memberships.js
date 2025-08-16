// routes/memberships.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { isDashboardAdmin, canManageGroup } = require('../utils/acl');
const { audit } = require('../utils/audit');

// ---- helpers ---------------------------------------------------------------
const toInt = v => {
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};
const pickLimit = (v, dflt = 50, max = 200) => {
  const n = Number(v);
  if (!Number.isInteger(n)) return dflt;
  return Math.min(Math.max(n, 1), max);
};

// ---- GET /memberships ------------------------------------------------------
// dashboard-admin: all (with optional filters)
// others: only their own memberships
// Supports: ?limit=&offset=&user_id=&group_id=
router.get('/', (req, res) => {
  const actorId = req.actor?.id ?? null;
  const dash = isDashboardAdmin(actorId);

  const limit = pickLimit(req.query.limit);
  const offset = Math.max(toInt(req.query.offset) || 0, 0);
  const qUser = toInt(req.query.user_id);
  const qGroup = toInt(req.query.group_id);

  let sql = `
    SELECT m.id, m.user_id, m.group_id, m.role,
           u.name AS user_name, g.name AS group_name
      FROM memberships m
      JOIN users  u ON u.id = m.user_id
      JOIN groups g ON g.id = m.group_id
     WHERE 1=1
  `;
  const params = [];

  if (!dash && actorId) {
    sql += ' AND m.user_id = ?';
    params.push(actorId);
  }
  if (Number.isInteger(qUser)) {
    sql += ' AND m.user_id = ?';
    params.push(qUser);
  }
  if (Number.isInteger(qGroup)) {
    sql += ' AND m.group_id = ?';
    params.push(qGroup);
  }

  sql += ' ORDER BY m.id LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params);
  res.json({ items: rows, limit, offset });
});

// ---- POST /memberships -----------------------------------------------------
// body: { user_id, group_id, role }
// dashboard-admin or group-admin of that group
router.post('/', (req, res) => {
  const actorId = req.actor?.id ?? null;
  const user_id = toInt(req.body?.user_id);
  const group_id = toInt(req.body?.group_id);
  const role = (req.body?.role || '').toString().trim();

  if (!Number.isInteger(user_id) || !Number.isInteger(group_id) || !role) {
    return res.status(400).json({ error: 'user_id, group_id, role required' });
  }
  if (!actorId || !canManageGroup(actorId, group_id)) {
    return res.status(403).json({ error: 'not allowed' });
  }

  // sanity: user & group exist
  const user = db.prepare('SELECT id, name FROM users WHERE id=?').get(user_id);
  const group = db.prepare('SELECT id, name FROM groups WHERE id=?').get(group_id);
  if (!user || !group) return res.status(400).json({ error: 'invalid user_id or group_id' });

  try {
    const info = db
      .prepare('INSERT INTO memberships(user_id, group_id, role) VALUES (?, ?, ?)')
      .run(user_id, group_id, role);

    const row = db.prepare('SELECT id, user_id, group_id, role FROM memberships WHERE id=?')
      .get(info.lastInsertRowid);

    audit(req, {
      action: 'create',
      resource: 'memberships',
      resource_id: row.id,
      details: { user_id, group_id, role }
    });

    return res.status(201).set('Location', `/memberships/${row.id}`).json(row);
  } catch (e) {
    const msg = String(e?.message || '');
    if (/uniq|unique/i.test(msg)) {
      // matches UNIQUE constraint like uniq_membership(user_id,group_id)
      return res.status(409).json({ error: 'User already has a membership in this group' });
    }
    console.error('[memberships:create] error:', msg);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ---- PUT /memberships/:id --------------------------------------------------
// body: { role }  (dashboard-admin or group-admin of that membership’s group)
router.put('/:id', (req, res) => {
  const actorId = req.actor?.id ?? null;
  const id = toInt(req.params.id);
  const role = (req.body?.role || '').toString().trim();
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
  if (!role) return res.status(400).json({ error: 'role required' });

  const before = db.prepare('SELECT * FROM memberships WHERE id=?').get(id);
  if (!before) return res.status(404).json({ error: 'membership not found' });

  if (!actorId || !canManageGroup(actorId, before.group_id)) {
    return res.status(403).json({ error: 'not allowed' });
  }

  db.prepare('UPDATE memberships SET role=? WHERE id=?').run(role, id);
  const after = db.prepare('SELECT id, user_id, group_id, role FROM memberships WHERE id=?').get(id);

  audit(req, {
    action: 'update',
    resource: 'memberships',
    resource_id: id,
    details: { before, after }
  });

  res.json(after);
});

// ---- DELETE /memberships/:id -----------------------------------------------
// dashboard-admin or group-admin of that membership’s group
router.delete('/:id', (req, res) => {
  const actorId = req.actor?.id ?? null;
  const id = toInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });

  const row = db.prepare('SELECT * FROM memberships WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'membership not found' });

  if (!actorId || !canManageGroup(actorId, row.group_id)) {
    return res.status(403).json({ error: 'not allowed' });
  }

  db.prepare('DELETE FROM memberships WHERE id=?').run(id);

  audit(req, {
    action: 'delete',
    resource: 'memberships',
    resource_id: id,
    details: { user_id: row.user_id, group_id: row.group_id, role: row.role }
  });

  res.status(204).end();
});

module.exports = router;
