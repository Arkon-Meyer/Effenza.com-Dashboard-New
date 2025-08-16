// scripts/migrate.js
const db = require('../database');

// --- helpers ---------------------------------------------------------------
const exec = (sql) => db.exec(sql);
const tableExists = (name) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
const columnExists = (table, column) =>
  db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);

// Enforce FKs for this connection (database.js already sets pragma globally)
exec('PRAGMA foreign_keys = ON');

try {
  exec('BEGIN');

  // --- audit_log (singular) ------------------------------------------------
  if (!tableExists('audit_log')) {
    exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id     INTEGER,
        action       TEXT NOT NULL,
        resource     TEXT NOT NULL,
        resource_id  INTEGER,
        org_unit_id  INTEGER,
        details      TEXT,
        ip           TEXT,
        user_agent   TEXT,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }
  // Ensure indexes (idempotent)
  exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource);
    CREATE INDEX IF NOT EXISTS idx_audit_org      ON audit_log(org_unit_id);
  `);
  // Ensure created_at column exists (older shapes might miss it)
  if (!columnExists('audit_log', 'created_at')) {
    exec(`ALTER TABLE audit_log ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
  }

  // Migrate legacy audit_logs -> audit_log (if legacy table exists)
  if (tableExists('audit_logs')) {
    const hasAt = columnExists('audit_logs', 'at');
    const hasActorUserId = columnExists('audit_logs', 'actor_user_id');
    const createdCol = hasAt ? 'at' : (columnExists('audit_logs', 'created_at') ? 'created_at' : "datetime('now')");
    const actorCol = hasActorUserId ? 'actor_user_id' : (columnExists('audit_logs', 'actor_id') ? 'actor_id' : 'NULL');

    exec(`
      INSERT INTO audit_log (actor_id, action, resource, resource_id, org_unit_id, details, ip, user_agent, created_at)
      SELECT ${actorCol}, action, resource, resource_id, org_unit_id, details, ip, user_agent, ${createdCol}
      FROM audit_logs
    `);
    // Note: we do NOT drop legacy table automatically; safe to keep for now.
  }

  // --- org_units -----------------------------------------------------------
  exec(`
    CREATE TABLE IF NOT EXISTS org_units (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id     INTEGER NOT NULL DEFAULT 1,
      parent_id  INTEGER REFERENCES org_units(id) ON DELETE SET NULL,
      type       TEXT CHECK(type IN ('business_unit','region','team','distributor','reseller')) NOT NULL,
      name       TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_org_units_parent ON org_units(parent_id);
  `);

  // --- RBAC core -----------------------------------------------------------
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
      role_id       INTEGER NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
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

  // --- Backfills on existing tables ----------------------------------------
  if (tableExists('users') && !columnExists('users', 'org_id')) {
    exec(`ALTER TABLE users ADD COLUMN org_id INTEGER NOT NULL DEFAULT 1`);
  }
  if (tableExists('groups') && !columnExists('groups', 'org_id')) {
    exec(`ALTER TABLE groups ADD COLUMN org_id INTEGER NOT NULL DEFAULT 1`);
  }
  if (tableExists('memberships') && !columnExists('memberships', 'org_id')) {
    exec(`ALTER TABLE memberships ADD COLUMN org_id INTEGER NOT NULL DEFAULT 1`);
  }

  // --- Seed permissions & roles -------------------------------------------
  const insPerm = db.prepare(
    'INSERT OR IGNORE INTO permissions (action, resource) VALUES (?, ?)'
  );
  [
    ['manage','users'],
    ['manage','org_units'],
    ['write','pipeline'],
    ['approve','requests'],
    ['read','audit'],       // aggregate/scoped
    ['read','audit_full'],  // full detail with PII
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

  const qRoleId = db.prepare('SELECT id FROM roles WHERE key=?');
  const qPermId = db.prepare('SELECT id FROM permissions WHERE action=? AND resource=?');
  const insRolePerm = db.prepare(
    'INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)'
  );

  const link = (roleKey, pairs) => {
    const r = qRoleId.get(roleKey);
    if (!r) return;
    for (const [a, res] of pairs) {
      const p = qPermId.get(a, res);
      if (p) insRolePerm.run(r.id, p.id);
    }
  };

  // Admin gets everything we defined
  link('admin', [
    ['manage','users'],
    ['manage','org_units'],
    ['write','pipeline'],
    ['approve','requests'],
    ['read','audit'],
    ['read','audit_full'],
  ]);

  // BU admin
  link('business_unit_admin', [
    ['manage','users'],
    ['manage','org_units'],
    ['write','pipeline'],
    ['read','audit'],
  ]);

  // Region admin
  link('region_admin', [
    ['manage','users'],
    ['manage','org_units'],
    ['read','audit'],
  ]);

  // Dist manager
  link('dist_manager', [
    ['write','pipeline'],
    ['approve','requests'],
    ['read','audit'],
  ]);

  // Distributor & Reseller (writer + can read aggregate)
  link('distributor', [['write','pipeline'], ['read','audit']]);
  link('reseller',    [['write','pipeline'], ['read','audit']]);

  exec('COMMIT');
  console.log('✅ Migration complete');
} catch (err) {
  try { exec('ROLLBACK'); } catch (_) {}
  console.error('❌ Migration failed:', err?.message || err);
  process.exit(1);
}
