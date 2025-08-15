const express = require('express');
const router = express.Router();
const db = require('../database');
const { can } = require('../utils/authz');
const { audit } = require('../utils/audit');

// list (optionally by parent_id)
router.get('/', (req, res) => {
  const parent = req.query.parent_id ? Number(req.query.parent_id) : null;
  const rows = parent === null
    ? db.prepare('SELECT * FROM org_units WHERE parent_id IS NULL AND deleted_at IS NULL ORDER BY id').all()
    : db.prepare('SELECT * FROM org_units WHERE parent_id=? AND deleted_at IS NULL ORDER BY id').all(parent);
  res.json(rows);
});

// create child under parent_id (parent_id can be NULL for root under tenant)
router.post('/', (req, res) => {
  const { parent_id = null, type, name } = req.body || {};
  if (!type || !name) return res.status(400).json({ error: 'type and name required' });

  const scopeId = parent_id || null; // permission scoped to where we insert
  if (!can(req.actor, 'manage', 'org_units', { orgUnitId: scopeId })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const info = db.prepare(`
    INSERT INTO org_units (org_id, parent_id, type, name)
    VALUES (1, ?, ?, ?)
  `).run(scopeId, String(type), String(name).trim());

  const row = db.prepare('SELECT * FROM org_units WHERE id=?').get(info.lastInsertRowid);
  audit(req, { action:'create', resource:'org_units', resource_id: row.id, org_unit_id: scopeId, details:{ type: row.type, name: row.name } });
  res.status(201).json(row);
});

// update name or parent
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, parent_id } = req.body || {};
  const node = db.prepare('SELECT * FROM org_units WHERE id=? AND deleted_at IS NULL').get(id);
  if (!node) return res.status(404).json({ error: 'Not found' });

  const scopeId = node.parent_id || node.id;
  if (!can(req.actor, 'manage', 'org_units', { orgUnitId: scopeId })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const n = name != null ? String(name).trim() : node.name;
  const p = (parent_id === undefined) ? node.parent_id : (parent_id || null);

  db.prepare('UPDATE org_units SET name=?, parent_id=? WHERE id=?').run(n, p, id);
  audit(req, { action:'update', resource:'org_units', resource_id:id, org_unit_id:p, details:{ name:n, parent_id:p } });
  res.json(db.prepare('SELECT * FROM org_units WHERE id=?').get(id));
});

// soft delete
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const node = db.prepare('SELECT * FROM org_units WHERE id=? AND deleted_at IS NULL').get(id);
  if (!node) return res.status(404).json({ error: 'Not found' });

  const scopeId = node.parent_id || node.id;
  if (!can(req.actor, 'manage', 'org_units', { orgUnitId: scopeId })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  db.prepare('UPDATE org_units SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
  audit(req, { action:'delete', resource:'org_units', resource_id:id, org_unit_id:scopeId });
  res.status(204).end();
});

module.exports = router;
