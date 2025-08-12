const express = require('express');
const router = express.Router();
const db = require('../database');
const { isDashboardAdmin } = require('../utils/acl');

// GET /users (read for everyone)
router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT id, name, email FROM users ORDER BY id').all());
});

// GET /users/:id/memberships (read memberships for a user)
router.get('/:id/memberships', (req, res) => {
  const id = Number(req.params.id);
  const rows = db.prepare(`
    SELECT m.id, m.role, g.name AS group_name, g.id AS group_id
    FROM memberships m JOIN groups g ON g.id = m.group_id
    WHERE m.user_id = ?
    ORDER BY m.id
  `).all(id);
  res.json(rows);
});

// GET /me (who am I?)
router.get('/me', (req, res) => {
  if (!req.actor) return res.status(401).json({ error: 'no actor (set X-User-Id)' });
  res.json(req.actor);
});

// GET /me/permissions
router.get('/me/permissions', (req, res) => {
  if (!req.actor) return res.status(401).json({ error: 'no actor' });
  const dash = isDashboardAdmin(req.actor.id);
  const groups = db.prepare(`
    SELECT m.group_id, g.name AS group_name, m.role
    FROM memberships m JOIN groups g ON g.id = m.group_id
    WHERE m.user_id = ?
    ORDER BY g.name
  `).all(req.actor.id);
  res.json({ dashboard_admin: dash, groups });
});

// POST /users (dashboard-admin only)
router.post('/', (req, res) => {
  if (!req.actor || !isDashboardAdmin(req.actor.id)) {
    return res.status(403).json({ error: 'dashboard-admin required' });
  }
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name & email required' });
  try {
    const info = db.prepare('INSERT INTO users(name,email) VALUES (?,?)').run(name.trim(), email.trim());
    res.status(201).json({ id: info.lastInsertRowid, name: name.trim(), email: email.trim() });
  } catch {
    res.status(400).json({ error: 'email must be unique' });
  }
});

// PUT /users/:id (dashboard-admin only)
router.put('/:id', (req, res) => {
  if (!req.actor || !isDashboardAdmin(req.actor.id)) {
    return res.status(403).json({ error: 'dashboard-admin required' });
  }
  const id = Number(req.params.id);
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name & email required' });
  const info = db.prepare('UPDATE users SET name=?, email=? WHERE id=?').run(name.trim(), email.trim(), id);
  if (!info.changes) return res.status(404).json({ error: 'user not found' });
  res.json({ id, name: name.trim(), email: email.trim() });
});

// DELETE /users/:id (dashboard-admin only)
router.delete('/:id', (req, res) => {
  if (!req.actor || !isDashboardAdmin(req.actor.id)) {
    return res.status(403).json({ error: 'dashboard-admin required' });
  }
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM users WHERE id=?').run(id);
  if (!info.changes) return res.status(404).json({ error: 'user not found' });
  res.json({ ok: true });
});

module.exports = router;
