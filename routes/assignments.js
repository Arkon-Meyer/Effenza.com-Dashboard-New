const express = require('express');
const router = express.Router();
const db = require('../database');
const { can } = require('../utils/authz');
const { audit } = require('../utils/audit');

// List a user's assignments (admin only for now)
router.get('/user/:id', (req, res) => {
  if (!can(req.actor, 'read', 'assignments')) return res.status(403).json({ error: 'Forbidden' });

  const userId = Number(req.params.id);
  const rows = db.prepare(`
    SELECT a.id, a.user_id, a.role_id, a.org_unit_id,
           r.key  AS role_key, r.name AS role_name,
           ou.type AS org_type, ou.name AS org_name
    FROM assignments a
    JOIN roles r      ON r.id  = a.role_id
    LEFT JOIN org_units ou ON ou.id = a.org_unit_id
    WHERE a.user_id = ?
    ORDER BY a.id
  `).all(userId);
  res.json(rows);
});

// Create an assignment (admin only to keep simple)
router.post('/', (req, res) => {
  if (!can(req.actor, 'create', 'assignments')) return res.status(403).json({ error: 'Forbidden' });

  const { user_id, role_key, org_unit_id = null } = req.body || {};
  if (!user_id || !role_key) return res.status(400).json({ error: 'user_id and role_key required' });

  const role = db.prepare('SELECT id FROM roles WHERE key=?').get(String(role_key));
  if (!role) return res.status(400).json({ error: 'invalid role_key' });

  const info = db.prepare(`
    INSERT INTO assignments (user_id, role_id, org_unit_id)
    VALUES (?, ?, ?)
  `).run(Number(user_id), role.id, org_unit_id || null);

  audit(req, { action:'create', resource:'assignments', resource_id: info.lastInsertRowid, org_unit_id: org_unit_id || null, details:{ user_id, role_key } });
  res.status(201).json(db.prepare('SELECT * FROM assignments WHERE id=?').get(info.lastInsertRowid));
});

// Delete an assignment (admin)
router.delete('/:id', (req, res) => {
  if (!can(req.actor, 'delete', 'assignments')) return res.status(403).json({ error: 'Forbidden' });

  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM assignments WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  db.prepare('DELETE FROM assignments WHERE id=?').run(id);
  audit(req, { action:'delete', resource:'assignments', resource_id:id, org_unit_id: row.org_unit_id || null });
  res.status(204).end();
});

module.exports = router;
