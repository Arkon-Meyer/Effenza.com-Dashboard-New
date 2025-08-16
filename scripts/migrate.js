// scripts/migrate.js
const db = require('../database');

function hasColumn(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some(c => c.name === column);
}
function exec(sql) { db.exec(sql); }

// Ensure FK enforcement for this connection
exec('PRAGMA foreign_keys = ON');

try {
  exec('BEGIN');

  // --- Schema ----------------------------------------------------------------

  exec(`
  CREATE TABLE IF NOT EXISTS org_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL DEFAULT 1,
    parent_id INTEGER REFERENCES org_units(id) ON DELETE SET NULL,
    type TEXT CHECK(type IN ('business_unit','region','team','distributor','reseller')) NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_org_units_parent ON org_units(parent_id);
  `);

  exec(`
  CREATE TABLE IF NOT EXISTS roles (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    key  TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS permissions (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    action   TEXT NOT NULL,
    resource TEXT NOT NULL,
    UNIQUE(action, resource)
  );

  CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       INTEGER NOT NULL REFERENCES roles(id)        ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id)  ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
    role_id     INTEGER NOT NULL REFERENCES roles(id)     ON DELETE CASCADE,
    org_unit_id INTEGER     REFERENCES org_units(id)      ON DELETE CASCADE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id);
  CREATE INDEX IF NOT EXISTS idx_assignments_org  ON assignments(org_unit_id);
  `);

  exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    actor_user_id INTEGER REFERENCES users(id),
    action        TEXT NOT NULL,
    resource      TEXT NOT NULL,
    resource_id   INTEGER,
    org_unit_id   INTEGER,
    ip            TEXT,
    user_agent    TEXT,
    details       TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_audit_logs_at            ON audit_logs(at);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_org_unit      ON audit_logs(org_unit_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
  `);

  // Backfills on existing tables (idempotent)
  if (!hasColumn('users','org_id'))       exec(`ALTER TABLE users       ADD COLUMN org_id INTEGER NOT NULL DEFAULT 1;`);
  if (!hasColumn('groups','org_id'))      exec(`ALTER TABLE groups      ADD COLUMN org_id INTEGER NOT NULL DEFAULT 1;`);
  if (!hasColumn('memberships','org_id')) exec(`ALTER TABLE memberships ADD COLUMN org_id INTEGER NOT NULL DEFAULT 1;`);

  // --- Seed (idempotent) -----------------------------------------------------

  const insPerm = db.prepare('INSERT OR IGNORE INTO permissions (action, resource) VALUES (?, ?)');
  [
    ['manage','users'],
    ['manage','org_units'],
    ['write','pipeline'],
    ['approve','requests'],
  ].forEach(p => insPerm.run(...p));

  const insRole = db.prepare('INSERT OR IGNORE INTO roles (key, name) VALUES (?, ?)');
  [
    ['admin','Admin'],
    ['business_unit_admin','Business Unit Admin'],
    ['region_admin','Region Admin'],
    ['dist_manager','Distribution Manager'],
    ['distributor','Distributor'],
    ['reseller','Reseller'],
  ].forEach(r => insRole.run(...r));

  const roleId = db.prepare('SELECT id FROM roles WHERE key=?');
  const permId = db.prepare('SELECT id FROM permissions WHERE action=? AND resource=?');
  const insRolePerm = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');

  function link(roleKey, pairs) {
    const rId = roleId.get(roleKey).id;
    pairs.forEach(([a, r]) => insRolePerm.run(rId, permId.get(a, r).id));
  }

  // Admin: everything
  link('admin', [
    ['manage','users'],
    ['manage','org_units'],
    ['write','pipeline'],
    ['approve','requests'],
  ]);

  // Business unit admin
  link('business_unit_admin', [
    ['manage','users'],
    ['manage','org_units'],
    ['write','pipeline'],
  ]);

  // Region admin
  link('region_admin', [
    ['manage','users'],
    ['manage','org_units'],
  ]);

  // Dist. manager
  link('dist_manager', [
    ['write','pipeline'],
    ['approve','requests'],
  ]);

  // Distributor
  link('distributor', [
    ['write','pipeline'],
  ]);

  // Reseller
  link('reseller', [
    ['write','pipeline'],
  ]);

  exec('COMMIT');
  console.log('✅ Migration complete');
} catch (err) {
  try { exec('ROLLBACK'); } catch (_) {}
  console.error('❌ Migration failed:', err && err.message ? err.message : err);
  process.exit(1);
}
