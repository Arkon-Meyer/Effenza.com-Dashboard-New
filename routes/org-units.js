// routes/org-units.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { can } = require('../utils/authz');
const { audit } = require('../utils/audit');

const ALLOWED_TYPES = new Set(['business_unit', 'region', 'team', 'distributor', 'reseller']);

const toInt = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};
const pickLimit = (v, dflt = 100, max = 500) => {
  const n = Number(v);
  if (!Number.isInteger(n)) return dflt;
  return Math.min(Math.max(n, 1), max);
};

function findUnit(id) {
  return db.prepare('SELECT * FROM org_units WHERE id=? AND deleted_at IS NULL').get(id);
}
function parentExists(id) {
  if (id == null) return true; // root allowed
  return !!findUnit(id);
}
function isDescendant(childId, ancestorId) {
  if (ancestorId == null) return false;
  // WITH RECURSIVE to walk up from child to root; see if we ever hit ancestorId
  const row = db
    .prepare(
      `
      WITH RECURSIVE up(id, parent_id) AS (
        SELECT id, parent_id FROM org_units WHERE id = ?
        UNION ALL
        SELECT ou.id, ou.parent_id
          FROM org_units ou
          JOIN up ON ou.id = up.parent_id
      )
      SELECT 1 AS hit
        FROM up
       WHERE id = ?
      `
    )
    .get(childId, ancestorId);
  return !!row;
}

// ---------------------------------------------------------------------------
// GET /org-units?parent_id=&limit=&offset=
// - parent_id omitted => roots
// - parent_id set     => direct children
router.get('/', (req, res) => {
  const parent = req.query.parent_id !== undefined ? toInt(req.query.parent_id) : null;
  const limit = pickLimit(req.query.limit);
  const offset = Math.max(toInt(req.query.offset) || 0, 0);

  let sql, params;
  if (parent === null || Number.isNaN(parent)) {
    sql =
      'SELECT * FROM org_units WHERE parent_id IS NULL AND deleted_at IS NULL ORDER BY id LIMIT ? OFFSET ?';
    params = [limit, offset];
  } else {
    sql =
      'SELECT * FROM org_units WHERE parent_id = ? AND deleted_at IS NULL ORDER BY id LIMIT ? OFFSET ?';
    params = [parent, limit, offset];
  }

  const rows = db.prepare(sql).all(...params);
  res.json({ items: rows, limit, offset });
});

// POST /org-units  (create child under parent_id; parent can be NULL for root)
router.post('/', (req, res) => {
  const parent_id = req.body?.parent_id == null ? null : toInt(req.body.parent_id);
  const type = (req.body?.type || '').toString().trim();
  const name = (req.body?.name || '').toString().trim();

  if (!type || !name) return res.status(400).json({ error: 'type and name required' });
  if (!ALLOWED_TYPES.has(type)) return res.status(400).json({ error: 'invalid type' });
  if (parent_id !== null && Number.isNaN(parent_id)) {
    return res.status(400).json({ error: 'invalid parent_id' });
  }
  if (!parentExists(parent_id)) return res.status(400).json({ error: 'parent not found' });

  const scopeId = parent_id || null;
  if (!can(req.actor, 'manage', 'org_units', { orgUnitId: scopeId })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const info = db
    .prepare(
      `INSERT INTO org_units (org_id, parent_id, type, name)
       VALUES (1, ?, ?, ?)`
    )
    .run(scopeId, type, name);

  const row = db.prepare('SELECT * FROM org_units WHERE id=?').get(info.lastInsertRowid);
  audit(req, {
    action: 'create',
    resource: 'org_units',
    resource_id: row.id,
    org_unit_id: scopeId,
    details: { type: row.type, name: row.name }
  });
  res.status(201).set('Location', `/org-units/${row.id}`).json(row);
});

// PATCH /org-units/:id  (update name and/or parent_id)
router.patch('/:id', (req, res) => {
  const id = toInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });

  const node = findUnit(id);
  if (!node) return res.status(404).json({ error: 'Not found' });

  const nextName =
    req.body?.name != null ? String(req.body.name).trim() : node.name;
  const nextParent =
    req.body?.parent_id === undefined
      ? node.parent_id
      : req.body.parent_id == null
      ? null
      : toInt(req.body.parent_id);

  if (nextParent !== null && Number.isNaN(nextParent)) {
    return res.status(400).json({ error: 'invalid parent_id' });
  }
  if (nextParent === id) {
    return res.status(400).json({ error: 'cannot set parent to self' });
  }
  if (!parentExists(nextParent)) {
    return res.status(400).json({ error: 'parent not found' });
  }
  if (isDescendant(nextParent, id)) {
    return res.status(400).json({ error: 'cannot move under own descendant' });
  }

  const scopeId = node.parent_id || node.id;
  if (!can(req.actor, 'manage', 'org_units', { orgUnitId: scopeId })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const before = node;
  db.prepare('UPDATE org_units SET name=?, parent_id=? WHERE id=?').run(nextName, nextParent, id);
  const after = db.prepare('SELECT * FROM org_units WHERE id=?').get(id);

  audit(req, {
    action: 'update',
    resource: 'org_units',
    resource_id: id,
    org_unit_id: nextParent || id,
    details: { before, after }
  });

  res.json(after);
});

// DELETE /org-units/:id  (soft delete)
router.delete('/:id', (req, res) => {
  const id = toInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });

  const node = findUnit(id);
  if (!node) return res.status(404).json({ error: 'Not found' });

  const scopeId = node.parent_id || node.id;
  if (!can(req.actor, 'manage', 'org_units', { orgUnitId: scopeId })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  db.prepare('UPDATE org_units SET deleted_at = CURRENT_TIMESTAMP WHERE id=?').run(id);
  audit(req, {
    action: 'delete',
    resource: 'org_units',
    resource_id: id,
    org_unit_id: scopeId
  });
  res.status(204).end();
});

module.exports = router;
