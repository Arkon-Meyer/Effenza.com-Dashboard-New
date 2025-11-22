// utils/acl.js
'use strict';

const db = require('../database');

async function isInRole(userId, roleKey) {
  if (!userId) return false;

  const sql = `
    SELECT 1
    FROM assignments a
    JOIN roles r ON r.id = a.role_id
    WHERE a.user_id = $1 AND r.key = $2
    LIMIT 1;
  `;

  const { rows } = await db.query(sql, [userId, roleKey]);
  return rows.length > 0;
}

// Example permission check
async function can(userId, action, resource) {
  if (!userId) return false;

  const sql = `
    SELECT 1
    FROM assignments a
    JOIN roles r ON r.id = a.role_id
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE a.user_id = $1
      AND p.action = $2
      AND p.resource = $3
    LIMIT 1;
  `;

  const { rows } = await db.query(sql, [userId, action, resource]);
  return rows.length > 0;
}

module.exports = { isInRole, can };
