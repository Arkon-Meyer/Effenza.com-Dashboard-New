// routes/users.js
const express = require('express');
const router = express.Router();
const db = require('../database'); // Must export a pg.Pool or similar
const { can } = require('../utils/authz');
const { audit } = require('../utils/audit');
const auth = require('../middleware/auth');

// Apply JWT auth middleware to all routes
router.use(auth);

// --- Helpers ---
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

// -------------------- GET /users/me --------------------
router.get("/me", (req, res) => {
  if (!req.actor) {
    return res.status(401).json({ error: "Unauthorized: no user context" });
  }
  res.json(req.actor);
});

// -------------------- GET /users --------------------
router.get('/', async (req, res) => {
  if (!req.actor || !can(req.actor, 'manage', 'users')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const q = (req.query.q || '').toString().trim();
  const limit = pickLimit(req.query.limit);
  const offset = Math.max(toInt(req.query.offset) || 0, 0);

  const params = [limit, offset];
  let sql = `SELECT id, name, email FROM users`;
  if (q) {
    sql += ` WHERE LOWER(name) LIKE $3 OR LOWER(email) LIKE $4`;
    params.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
  }
  sql += ` ORDER BY id LIMIT $1 OFFSET $2`;

  try {
    const result = await db.query(sql, params);
    res.json({ items: result.rows || [], limit, offset, q: q || null });
  } catch (err) {
    console.error("[GET /users] DB error:", err);
    res.status(500).json({ error: "Database error", detail: err.message });
  }
});

// -------------------- GET /users/:id --------------------
router.get('/:id', async (req, res) => {
  const id = toInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const isAdmin = req.actor && can(req.actor, 'manage', 'users');
  if (!isAdmin && req.actor.id !== id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const result = await db.query('SELECT id, name, email FROM users WHERE id = $1', [id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error("[GET /users/:id] DB error:", err);
    res.status(500).json({ error: "Database error", detail: err.message });
  }
});

// -------------------- POST /users (admin only) --------------------
router.post('/', async (req, res) => {
  if (!req.actor || !can(req.actor, 'manage', 'users')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const name = String((req.body?.name || '')).trim();
  const email = normEmail(req.body?.email);
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Invalid email format' });

  try {
    const result = await db.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id',
      [name, email]
    );
    const created = { id: result.rows[0].id, name, email };
    audit(req, { action: 'create', resource: 'users', resource_id: created.id, org_unit_id: null, details: created });
    res.status(201).set('Location', `/users/${created.id}`).json(created);
  } catch (err) {
    const msg = String(err.message || '').toLowerCase();
    if (msg.includes('unique') || msg.includes('constraint')) {
      return res.status(400).json({ error: 'Email must be unique' });
    }
    console.error("[POST /users] DB error:", err);
    res.status(500).json({ error: 'Unable to create user', detail: err.message });
  }
});

// -------------------- PUT /users/:id (admin only) --------------------
router.put('/:id', async (req, res) => {
  if (!req.actor || !can(req.actor, 'manage', 'users')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const id = toInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const name = String((req.body?.name || '')).trim();
  const email = normEmail(req.body?.email);
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Invalid email format' });

  try {
    const beforeRes = await db.query('SELECT id, name, email FROM users WHERE id = $1', [id]);
    const before = beforeRes.rows[0];
    if (!before) return res.status(404).json({ error: 'User not found' });

    const update = await db.query('UPDATE users SET name = $1, email = $2 WHERE id = $3', [name, email, id]);
    if (!update.rowCount) return res.status(404).json({ error: 'User not found' });

    const after = { id, name, email };
    audit(req, {
      action: 'update',
      resource: 'users',
      resource_id: id,
      org_unit_id: null,
      details: { before, after },
    });

    res.json(after);
  } catch (err) {
    const msg = String(err.message || '').toLowerCase();
    if (msg.includes('unique') || msg.includes('constraint')) {
      return res.status(400).json({ error: 'Email must be unique' });
    }
    console.error("[PUT /users/:id] DB error:", err);
    res.status(500).json({ error: 'Unable to update user', detail: err.message });
  }
});

// -------------------- DELETE /users/:id (admin only) --------------------
router.delete('/:id', async (req, res) => {
  if (!req.actor || !can(req.actor, 'manage', 'users')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const id = toInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const result = await db.query('SELECT id, name, email FROM users WHERE id = $1', [id]);
    const before = result.rows[0];
    if (!before) return res.status(404).json({ error: 'User not found' });

    await db.query('DELETE FROM users WHERE id = $1', [id]);
    audit(req, {
      action: 'delete',
      resource: 'users',
      resource_id: id,
      org_unit_id: null,
      details: before,
    });

    res.status(204).end();
  } catch (err) {
    console.error("[DELETE /users/:id] DB error:", err);
    res.status(500).json({ error: 'Unable to delete user', detail: err.message });
  }
});

// -------------------- GET /users/debug/all-users --------------------
router.get('/debug/all-users', async (req, res) => {
  try {
    const result = await db.query('SELECT id, name, email FROM users');
    res.json({ count: result.rows.length, users: result.rows });
  } catch (err) {
    console.error('[debug/all-users] DB error:', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

module.exports = router;
