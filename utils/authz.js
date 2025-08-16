// utils/authz.js
const db = require('../database');

// ---------- prepared statements ----------
const STMT = {
  orgById: db.prepare('SELECT id, parent_id FROM org_units WHERE id=? AND deleted_at IS NULL'),
  userPerms: (placeholders) => db.prepare(`
    SELECT p.action || ':' || p.resource AS k
    FROM assignments a
    JOIN role_permissions rp ON rp.role_id = a.role_id
    JOIN permissions p      ON p.id = rp.permission_id
    WHERE a.user_id = ?
      AND (a.org_unit_id IS NULL OR a.org_unit_id IN (${placeholders}))
  `),
};

// Walk up org tree (include NULL = tenant/global)
function getAncestors(orgUnitId) {
  const chain = [];
  let id = orgUnitId || null;
  while (id) {
    const row = STMT.orgById.get(id);
    if (!row) break;
    chain.push(row.id);
    id = row.parent_id;
  }
  chain.push(null); // allow global assignments
  return chain; // e.g. [teamId, regionId, buId, null]
}

function userPermissionKeys(userId, orgUnitId) {
  const scope = getAncestors(orgUnitId);
  const ph = scope.map(() => '?').join(',');         // e.g. "?,?,?,?"
  const rows = STMT.userPerms(ph).all(userId, ...scope);
  return new Set(rows.map(r => r.k));
}

function can(user, action, resource, { orgUnitId } = {}) {
  if (!user) return false;
  const keys = userPermissionKeys(user.id, orgUnitId);
  return keys.has(`${action}:${resource}`);
}

// --- minimal, idempotent bootstrap (kept conservative & aligned with migrate/seed) ---
db.exec(`
  BEGIN;

  CREATE TABLE IF NOT EXISTS roles (
    id  INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    UNIQUE(action, resource)
  );

  CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    org_unit_id INTEGER REFERENCES org_units(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_assign_user ON assignments(user_id);
  CREATE INDEX IF NOT EXISTS idx_assign_org  ON assignments(org_unit_id);

  /* roles — aligned with migrate/seed */
  INSERT OR IGNORE INTO roles(key,name) VALUES
    ('admin','Admin'),
    ('business_unit_admin','Business Unit Admin'),
    ('region_admin','Region Admin'),
    ('dist_manager','Distribution Manager'),
    ('distributor','Distributor'),
    ('reseller','Reseller'),
    ('viewer','Viewer');

  /* base permissions used by current routes */
  INSERT OR IGNORE INTO permissions(action,resource) VALUES
    ('manage','org_units'),
    ('read','org_units'),
    ('read','assignments'),
    ('create','assignments'),
    ('delete','assignments'),
    ('read','audit');

  /* Admin gets all defined permissions (safe & idempotent) */
  INSERT OR IGNORE INTO role_permissions(role_id, permission_id)
  SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
  WHERE r.key = 'admin';

  COMMIT;
`);

module.exports = { can, getAncestors, userPermissionKeys };
