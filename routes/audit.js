// routes/assignments.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { can } = require('../utils/authz');
const { audit } = require('../utils/audit');

// helpers
const toInt = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};
const pickLimit = (v, dflt = 50, max = 200) => {
  const n = toInt(v);
  if (Number.isNaN(n)) return dflt;
  return Math.min(Math.max(n, 1), max);
};

// GET /assignments/user/:id?limit=&offset=
router.get('/user/:id', (req, res) => {
  if (!can(req.actor, 'read', 'assignments')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const userId = toInt(req.params.id);
  if (Number.isNaN(userId)) return res.status(400).json({ error: 'Invalid user id' });

  const limit = pickLimit(req.query.limit);
  const offset = Math.max(toInt(req.query.offset) || 0, 0);

  const rows = db.prepare(
    `
    SELECT a.id, a.user_id, a.role_id, a.org_unit_id,
           r.key  AS role_key, r.name AS role_name,
           ou.type AS org_type, ou.name AS org_name
      FROM assignments a
      JOIN roles r        ON r.id  = a.role_id
 LEFT JOIN org_units ou   ON ou.id = a.org_unit_id
     WHERE a.user_id = ?
     ORDER BY a.id
     LIMIT ? OFFSET ?
    `
  ).all(userId, limit, offset);

  res.json({ items: rows, limit, offset });
});

// POST /assignments  { user_id, role_key, org_unit_id? }
router.post('/', (req, res) => {
  if (!can(req.actor, 'create', 'assignments')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const user_id = toInt(req.body?.user_id);
    const role_key = String(req.body?.role_key || '').trim();
    const org_unit_id_raw = req.body?.org_unit_id ?? null;
    const org_unit_id = org_unit_id_raw === null || org_unit_id_raw === undefined
      ? null
      : toInt(org_unit_id_raw);

    if (Number.isNaN(user_id) || !role_key) {
      return res.status(400).json({ error: 'user_id and role_key required' });
    }
    if (org_unit_id_raw != null && Number.isNaN(org_unit_id)) {
      return res.status(400).json({ error: 'Invalid org_unit_id' });
    }

    const role = db.prepare('SELECT id FROM roles WHERE key=?').get(role_key);
    if (!role) return res.status(400).json({ error: 'invalid role_key' });

    if (org_unit_id != null) {
      const ou = db.prepare('SELECT id FROM org_units WHERE id=?').get(org_unit_id);
      if (!ou) return res.status(400).json({ error: 'invalid org_unit_id' });
    }

    const info = db
      .prepare(
        `INSERT INTO assignments (user_id, role_id, org_unit_id)
         VALUES (?, ?, ?)`
      )
      .run(user_id, role.id, org_unit_id);

    const row = db.prepare('SELECT * FROM assignments WHERE id=?').get(info.lastInsertRowid);

    audit(req, {
      action: 'create',
      resource: 'assignments',
      resource_id: info.lastInsertRowid,
      org_unit_id: org_unit_id ?? null,
      details: { user_id, role_key },
    });

    res
      .status(201)
      .set('Location', `/assignments/${info.lastInsertRowid}`)
      .json(row);
  } catch (err) {
    console.error('[assignments:create] error:', err?.message || err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// DELETE /assignments/:id
router.delete('/:id', (req, res) => {
  if (!can(req.actor, 'delete', 'assignments')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const id = toInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const row = db.prepare('SELECT * FROM assignments WHERE id=?').get(id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    db.prepare('DELETE FROM assignments WHERE id=?').run(id);

    audit(req, {
      action: 'delete',
      resource: 'assignments',
      resource_id: id,
      org_unit_id: row.org_unit_id ?? null,
    });

    res.status(204).end();
  } catch (err) {
    console.error('[assignments:delete] error:', err?.message || err);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
