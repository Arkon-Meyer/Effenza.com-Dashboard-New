// routes/groups.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { isDashboardAdmin, canManageGroup } = require('../utils/acl');
const { audit } = require('../utils/audit');

// helpers
const toInt = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};
const pickLimit = (v, dflt = 50, max = 200) => {
  const n = Number(v);
  if (!Number.isInteger(n)) return dflt;
  return Math.min(Math.max(n, 1), max);
};

// GET /groups?limit=&offset=&q=
router.get('/', (req, res) => {
  const limit = pickLimit(req.query.limit);
  const offset = Math.max(toInt(req.query.offset) || 0, 0);
  const q = (req.query.q || '').toString().trim();

  let rows;
  if (q) {
    rows = db
      .prepare(
        `SELECT id, name
           FROM groups
          WHERE name LIKE ?
          ORDER BY id
          LIMIT ? OFFSET ?`
      )
      .all(`%${q}%`, limit, offset);
  } else {
    rows = db
      .prepare(`SELECT id, name FROM groups ORDER BY id LIMIT ? OFFSET ?`)
      .all(limit, offset);
  }

  res.json({ items: rows, limit, offset, q: q || undefined });
});

// POST /groups  { name }
router.post('/', (req, res) => {
  if (!req.actor || !isDashboardAdmin(req.actor.id)) {
    return res.status(403).json({ error: 'dashboard-admin required' });
  }

  const name = (req.body?.name || '').toString().trim();
  if (!name) return res.status(400).json({ error: 'name required' });

  try {
    const info = db.prepare('INSERT INTO groups(name) VALUES (?)').run(name);
    const row = db.prepare('SELECT id, name FROM groups WHERE id=?').get(info.lastInsertRowid);

    audit(req, {
      action: 'create',
      resource: 'groups',
      resource_id: row.id,
      details: { name },
    });

    return res.status(201).set('Location', `/groups/${row.id}`).json(row);
  } catch (err) {
    // UNIQUE(name) violation or other constraint
    if ((err && err.message) && /UNIQUE|unique/i.test(err.message)) {
      return res.status(409).json({ error: 'Group name must be unique' });
    }
    console.error('[groups:create] error:', err?.message || err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// PUT /groups/:id  { name }
router.put('/:id', (req, res) => {
  const groupId = toInt(req.params.id);
  if (Number.isNaN(groupId)) return res.status(400).json({ error: 'invalid id' });

  if (!req.actor || !canManageGroup(req.actor.id, groupId)) {
    return res.status(403).json({ error: 'not allowed' });
  }

  const name = (req.body?.name || '').toString().trim();
  if (!name) return res.status(400).json({ error: 'name required' });

  try {
    const before = db.prepare('SELECT id, name FROM groups WHERE id=?').get(groupId);
    if (!before) return res.status(404).json({ error: 'group not found' });

    const info = db.prepare('UPDATE groups SET name=? WHERE id=?').run(name, groupId);
    if (!info.changes) {
      // no change; return current state
      return res.json(before);
    }
    const row = db.prepare('SELECT id, name FROM groups WHERE id=?').get(groupId);

    audit(req, {
      action: 'update',
      resource: 'groups',
      resource_id: groupId,
      details: { before, after: row },
    });

    res.json(row);
  } catch (err) {
    if ((err && err.message) && /UNIQUE|unique/i.test(err.message)) {
      return res.status(409).json({ error: 'Group name must be unique' });
    }
    console.error('[groups:update] error:', err?.message || err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// DELETE /groups/:id
router.delete('/:id', (req, res) => {
  if (!req.actor || !isDashboardAdmin(req.actor.id)) {
    return res.status(403).json({ error: 'dashboard-admin required' });
  }

  const id = toInt(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid id' });

  const row = db.prepare('SELECT id, name FROM groups WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'group not found' });

  db.prepare('DELETE FROM groups WHERE id=?').run(id);

  audit(req, {
    action: 'delete',
    resource: 'groups',
    resource_id: id,
    details: row,
  });

  res.status(204).end();
});

module.exports = router;
