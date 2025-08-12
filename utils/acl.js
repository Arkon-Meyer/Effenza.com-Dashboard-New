// utils/acl.js
const db = require('../database');

function isDashboardAdmin(userId) {
  if (!userId) return false;
  const row = db.prepare(`
    SELECT 1 FROM memberships
    WHERE user_id = ? AND role = 'dashboard-admin' LIMIT 1
  `).get(userId);
  return !!row;
}

function isGroupAdmin(userId, groupId) {
  if (!userId || !groupId) return false;
  const row = db.prepare(`
    SELECT 1 FROM memberships
    WHERE user_id = ? AND group_id = ? AND role IN ('group-admin','dashboard-admin')
    LIMIT 1
  `).get(userId, groupId);
  return !!row;
}

function canManageGroup(userId, groupId) {
  return isDashboardAdmin(userId) || isGroupAdmin(userId, groupId);
}

module.exports = { isDashboardAdmin, isGroupAdmin, canManageGroup };
