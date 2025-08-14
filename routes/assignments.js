// routes/assignments.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { can } = require('../utils/authz');
const { audit } = require('../utils/audit');

// list assignments for a user (admin-only for now)
router.get('/user/:userId', (req, res) => {
  if (!can(req.actor, 'manage', 'users')) return res.status(403).json({ error:'Forbidden' });
  const userId = Number(req.params.userId);
  const rows = db.prepare(`
    SELECT a.id, a.user_id, a.role_id, a.org_unit_id, r.key as role_key, r.name as role_name, ou.name as org_name, ou.type as org_type
    FROM assignments a
    JOIN roles r ON r.id = a.role_id
    LEFT JOIN org_units ou ON ou.id = a.org_unit_id
    WHERE a.user_id=?
  `).all(userId);
  res.json(rows);
});

// assign role to user at scope (org_unit_id nullable = tenant/global)
router.post('/', (req, res) => {
  const { user_id, role_id, org_unit_id = null } = req.body || {};
  if (!user_id || !role_id) return res.status(400).json({ error:'user_id and role_id required' });

  if (!can(req.actor, 'manage', 'users', { orgUnitId: org_unit_id || null })) {
    return res.status(403).json({ error:'Forbidden' });
  }

  const info = db.prepare(`
    INSERT INTO assignments (user_id, role_id, org_unit_id) VALUES (?, ?, ?)
  `).run(Number(user_id), Number(role_id), org_unit_id || null);

  audit(req, { action:'assign', resource:'roles', resource_id:role_id, org_unit_id:org_unit_id || null, details:{ user_id } });
  res.status(201).json(db.prepare('SELECT * FROM assignments WHERE id=?').get(info.lastInsertRowid));
});

// remove assignment
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const a = db.prepare('SELECT * FROM assignments WHERE id=?').get(id);
  if (!a) return res.status(404).json({ error:'Not found' });

  if (!can(req.actor, 'manage', 'users', { orgUnitId: a.org_unit_id || null })) {
    return res.status(403).json({ error:'Forbidden' });
  }

  db.prepare('DELETE FROM assignments WHERE id=?').run(id);
  audit(req, { action:'unassign', resource:'roles', resource_id:a.role_id, org_unit_id:a.org_unit_id || null, details:{ user_id:a.user_id } });
  res.status(204).end();
});

module.exports = router;
