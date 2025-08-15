// utils/authz.js
const db = require('../database');

// Walk up the org tree (team -> region -> BU …) and include null (tenant/global)
function getAncestors(orgUnitId) {
  const chain = [];
  let id = orgUnitId || null;
  while (id) {
    const row = db.prepare(
      'SELECT id, parent_id FROM org_units WHERE id=? AND deleted_at IS NULL'
    ).get(id);
    if (!row) break;
    chain.push(row.id);
    id = row.parent_id;
  }
  chain.push(null);
  return chain; // e.g. [teamId, regionId, buId, null]
}

// Returns true if user holds the 'admin' role at any ancestor (or tenant/null)
function isAdminInScope(userId, orgUnitId) {
  const scope = getAncestors(orgUnitId);
  const row = db.prepare(
    `
    SELECT 1
    FROM assignments a
    JOIN roles r ON r.id = a.role_id
    WHERE a.user_id = ?
      AND r.key = 'admin'
      AND (a.org_unit_id IS NULL OR a.org_unit_id IN (${scope.map(() => '?').join(',')}))
    LIMIT 1
    `
  ).get(userId, ...scope);
  return !!row;
}

function userPermissionKeys(userId, orgUnitId) {
  const scope = getAncestors(orgUnitId);
  const rows = db.prepare(
    `
    SELECT p.action || ':' || p.resource AS k
    FROM assignments a
    JOIN role_permissions rp ON rp.role_id = a.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE a.user_id = ?
      AND (a.org_unit_id IS NULL OR a.org_unit_id IN (${scope.map(() => '?').join(',')}))
    `
  ).all(userId, ...scope);
  return new Set(rows.map(r => r.k));
}

function can(user, action, resource, { orgUnitId } = {}) {
  if (!user) return false;

  // Admin is universal within scope (tenant/null or ancestor chain)
  if (isAdminInScope(user.id, orgUnitId)) return true;

  const keys = userPermissionKeys(user.id, orgUnitId);
  return keys.has(`${action}:${resource}`);
}

module.exports = { can, getAncestors, userPermissionKeys, isAdminInScope };
