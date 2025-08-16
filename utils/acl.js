// utils/acl.js
const db = require('../database');

// keep in sync with database.js CHECK(role IN (...))
const ROLES = {
  DASH: 'dashboard-admin',
  GROUP: 'group-admin',
};

const STMT = {
  isDash: db.prepare(`
    SELECT 1 FROM memberships
    WHERE user_id = ? AND role = ? LIMIT 1
  `),
  isGroupAdmin: db.prepare(`
    SELECT 1 FROM memberships
    WHERE user_id = ? AND group_id = ? AND role IN (?, ?) LIMIT 1
  `),
};

function isDashboardAdmin(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return false;
  return !!STMT.isDash.get(id, ROLES.DASH);
}

function isGroupAdmin(userId, groupId) {
  const uid = Number(userId);
  const gid = Number(groupId);
  if (!Number.isInteger(uid) || uid <= 0) return false;
  if (!Number.isInteger(gid) || gid <= 0) return false;
  return !!STMT.isGroupAdmin.get(uid, gid, ROLES.GROUP, ROLES.DASH);
}

function canManageGroup(userId, groupId) {
  return isDashboardAdmin(userId) || isGroupAdmin(userId, groupId);
}

module.exports = { isDashboardAdmin, isGroupAdmin, canManageGroup };
