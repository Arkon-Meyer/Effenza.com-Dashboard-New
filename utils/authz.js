// utils/authz.js
'use strict';

/**
 * Very small, synchronous RBAC helper for now.
 *
 * - Keeps the same API: can(user, action, resource, ctx?)
 * - Does NOT talk to the database (no .prepare, no async).
 * - Treats certain user IDs as "platform admins" who can do everything.
 *
 * This keeps /audit and other routes working while we finish
 * the Postgres migration and clean up old SQLite-era ACL logic.
 */

// Comma-separated admin IDs in .env, fallback to "1"
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || '1')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isInteger(n));

function isAdmin(user) {
  if (!user) return false;
  const id = Number(user.id);
  if (!Number.isInteger(id)) return false;
  return ADMIN_USER_IDS.includes(id);
}

/**
 * Main RBAC entry point.
 *
 * For now:
 *  - Any configured admin user (ADMIN_USER_IDS) => full access.
 *  - All other users => no special permissions yet (returns false).
 *
 * @param {object|null} user    e.g. { id: 1, email: 'demo.user@example.com' }
 * @param {string}      action  e.g. 'read', 'manage'
 * @param {string}      resource e.g. 'audit', 'audit_full'
 * @param {object}      ctx      optional context (orgUnitId, etc.)
 * @returns {boolean}
 */
function can(user, action, resource, ctx = {}) {
  // No user => no access
  if (!user) return false;

  // Platform admins can do anything for now.
  if (isAdmin(user)) {
    return true;
  }

  // TODO: later, replace with real Postgres-backed RBAC using:
  //  - assignments, roles, permissions, role_permissions, org_units
  //  - ctx.orgUnitId scoping for audit access, etc.
  // For now, non-admin users have no special privileges.
  return false;
}

module.exports = {
  can,
  isAdmin,
};
