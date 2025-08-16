// routes/users.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { can } = require('../utils/authz');
const { audit } = require('../utils/audit');

const toInt = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};
const pickLimit = (v, dflt = 100, max = 500) => {
  const n = Number(v);
  if (!Number.isInteger(n)) return dflt;
  return Math.min(Math.max(n, 1), max);
};
const normEmail = (e) => String(e || '').trim().toLowerCase();
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// -------------------- GET /users (admin only) --------------------
router.get('/', (req, res) => {
  if (!req.actor || !can(req.actor, 'manage', 'users')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const q = (req.query.q || '').toString().trim();
  const limit = pickLimit(req.query.limit);
  const offset = Math.max(toInt(req.query.offset) || 0, 0);

  let sql = 'SELECT id, name, email FROM users';
  const params = [];
  if (q) {
    sql += ' WHERE (LOWER(name) LIKE ? OR LOWER(email) LIKE ?)';
    params.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
  }
  sql += ' ORDER BY id LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params);
  res.json({ items: rows, limit, offset, q: q || null });
});

// -------------------- GET /users/me --------------------
router.get('/me', (req, res) => {
  if (!req.actor) {
    return res.status(401).json({
      error: 'Missing or invalid X-User-Id',
      hint: 'Send a valid X-User-Id header matching a user in the database',
    });
  }
  res.json(req.actor);
});

// -------------------- GET /users/:id --------------------
router.get('/:id', (req, res) => {
  const id = toInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  // If admin → can read any user; otherwise only self
  const isAdmin = req.actor && can(req.actor, 'manage', 'users');
  if (!isAdmin && (!req.actor || req.actor.id !== id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const row = db.prepare('SELECT id, name, email FROM users WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json(row);
});

// -------------------- POST /users (admin) --------------------
router.post('/', (req, res) => {
  if (!req.actor || !can(req.actor, 'manage', 'users')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const name = String((req.body?.name || '')).trim();
  const email = normEmail(req.body?.email);
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Invalid email format' });

  try {
    const info = db
      .prepare('INSERT INTO users (name, email) VALUES (?, ?)')
      .run(name, email);

    const created = { id: info.lastInsertRowid, name, email };
    audit(req, { action: 'create', resource: 'users', resource_id: created.id, org_unit_id: null, details: created });
    res.status(201).set('Location', `/users/${created.id}`).json(created);
  } catch (e) {
    const msg = String(e.message || '');
    if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('constraint')) {
      return res.status(400).json({ error: 'Email must be unique' });
    }
    res.status(400).json({ error: 'Unable to create user' });
  }
});

// -------------------- PUT /users/:id (admin) --------------------
router.put('/:id', (req, res) => {
  if (!req.actor || !can(req.actor, 'manage', 'users')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const id = toInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const name = String((req.body?.name || '')).trim();
  const email = normEmail(req.body?.email);
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Invalid email format' });

  const before = db.prepare('SELECT id, name, email FROM users WHERE id=?').get(id);
  if (!before) return res.status(404).json({ error: 'User not found' });

  try {
    const info = db
      .prepare('UPDATE users SET name = ?, email = ? WHERE id = ?')
      .run(name, email, id);

    if (!info.changes) return res.status(404).json({ error: 'User not found' });

    const after = { id, name, email };
    audit(req, {
      action: 'update',
      resource: 'users',
      resource_id: id,
      org_unit_id: null,
      details: { before, after }
    });
    res.json(after);
  } catch (e) {
    const msg = String(e.message || '');
    if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('constraint')) {
      return res.status(400).json({ error: 'Email must be unique' });
    }
    res.status(400).json({ error: 'Unable to update user' });
  }
});

// -------------------- DELETE /users/:id (admin) --------------------
router.delete('/:id', (req, res) => {
  if (!req.actor || !can(req.actor, 'manage', 'users')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const id = toInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const before = db.prepare('SELECT id, name, email FROM users WHERE id=?').get(id);
  if (!before) return res.status(404).json({ error: 'User not found' });

  db.prepare('DELETE FROM users WHERE id=?').run(id);
  audit(req, {
    action: 'delete',
    resource: 'users',
    resource_id: id,
    org_unit_id: null,
    details: before
  });
  res.status(204).end();
});

module.exports = router;
