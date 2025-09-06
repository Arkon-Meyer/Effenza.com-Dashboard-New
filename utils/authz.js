// utils/authz.js — Postgres version (no SQLite PRAGMAs, no AUTOINCREMENT)
'use strict';

const { prepare } = require('../database');

/**
 * Minimal RBAC:
 *  - "admin" role grants everything
 *  - Otherwise, permission must exist via role_permissions for (action, resource)
 *  - Scope: if orgUnitId is provided, allow if the user's assignment is either
 *    global (NULL org_unit_id) or matches the provided orgUnitId.
 */

const qIsAdmin = prepare(`
  SELECT 1
    FROM assignments a
    JOIN roles r ON r.id = a.role_id
   WHERE a.user_id = ?
     AND r.key = 'admin'
   LIMIT 1
`);

const qHasPerm = prepare(`
  SELECT 1
    FROM assignments a
    JOIN roles r           ON r.id = a.role_id
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p     ON p.id = rp.permission_id
   WHERE a.user_id = ?
     AND p.action = ?
     AND p.resource = ?
     AND (a.org_unit_id IS NULL OR a.org_unit_id = COALESCE(?, a.org_unit_id))
   LIMIT 1
`);

async function can(actor, action, resource, opts = {}) {
  if (!actor || !actor.id) return false;
  const orgUnitId = opts.orgUnitId ?? null;

  // admins can do everything
  if (await qIsAdmin.get(actor.id)) return true;

  // otherwise check role->permission with optional scope
  return !!(await qHasPerm.get(actor.id, String(action), String(resource), orgUnitId));
}

module.exports = { can };
