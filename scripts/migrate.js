// scripts/migrate.js
/* eslint-disable no-console */
const db = require('../database');

// ---- helpers ---------------------------------------------------------------
const exec = (sql) => db.exec(sql);
const tableExists = (name) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
const columnsOf = (table) => db.prepare(`PRAGMA table_info(${table})`).all();
const columnExists = (table, col) => columnsOf(table).some((c) => c.name === col);

// Enforce FKs for this connection (database.js also sets PRAGMA globally)
exec('PRAGMA foreign_keys = ON');

try {
  exec('BEGIN');

  /* -------------------------- audit_log (singular) -------------------------- */
  if (!tableExists('audit_log')) {
    exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id     INTEGER,
        action       TEXT NOT NULL,
        resource     TEXT NOT NULL,
        resource_id  INTEGER,
        org_unit_id  INTEGER,
        details      TEXT,              -- JSON string
        ip           TEXT,
        user_agent   TEXT,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  // Backfill created_at if older shapes are present
  if (!columnExists('audit_log', 'created_at')) {
    exec(`ALTER TABLE audit_log ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
  }

  // Indexes used by /audit queries (idempotent)
  exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_created      ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_resource     ON audit_log(resource);
    CREATE INDEX IF NOT EXISTS idx_audit_org          ON audit_log(org_unit_id);
    CREATE INDEX IF NOT EXISTS idx_audit_actor        ON audit_log(actor_id);
    CREATE INDEX IF NOT EXISTS idx_audit_res_and_id   ON audit_log(resource, resource_id);
  `);

  // One-time forward copy from legacy plural table if it exists
  if (tableExists('audit_logs')) {
    const hasAt          = columnExists('audit_logs', 'at');
    const hasActorUserId = columnExists('audit_logs', 'actor_user_id');
    const createdCol = hasAt
      ? 'at'
      : (columnExists('audit_logs', 'created_at') ? 'created_at' : "datetime('now')");
    const actorCol = hasActorUserId
      ? 'actor_user_id'
      : (columnExists('audit_logs', 'actor_id') ? 'actor_id' : 'NULL');

    exec(`
      INSERT INTO audit_log (actor_id, action, resource, resource_id, org_unit_id, details, ip, user_agent, created_at)
      SELECT ${actorCol}, action, resource, resource_id, org_unit_id, details, ip, user_agent, ${createdCol}
      FROM audit_logs
    `);
    // Keep legacy table for now (no DROP) to stay safe.
  }

  /* ------------------------------- org_units -------------------------------- */
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

  // Deduplicate legacy rows so the unique index can be created safely
  exec(`
    DELETE FROM org_units
    WHERE rowid NOT IN (
      SELECT MIN(rowid)
      FROM org_units
      GROUP BY org_id, COALESCE(parent_id,0), type, name
    )
    AND (org_id, COALESCE(parent_id,0), type, name) IN (
      SELECT org_id, COALESCE(parent_id,0), type, name
      FROM org_units
      GROUP BY org_id, COALESCE(parent_id,0), type, name
      HAVING COUNT(*) > 1
    );
  `);

  // Uniqueness guard to make seeding idempotent
  exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_orgunit_org_parent_type_name
      ON org_units (org_id, COALESCE(parent_id, 0), type, name);
  `);

  /* --------------------------------- RBAC ---------------------------------- */
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

  // Deduplicate legacy assignment rows BEFORE adding the unique constraint
  exec(`
    DELETE FROM assignments
    WHERE rowid NOT IN (
      SELECT MIN(rowid)
      FROM assignments
      GROUP BY user_id, role_id, COALESCE(org_unit_id, 0)
    )
    AND (user_id, role_id, COALESCE(org_unit_id, 0)) IN (
      SELECT user_id, role_id, COALESCE(org_unit_id, 0)
      FROM assignments
      GROUP BY user_id, role_id, COALESCE(org_unit_id, 0)
      HAVING COUNT(*) > 1
    );
  `);

  // Prevent duplicate role grants to the same user at the same scope
  exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_assignment_user_role_scope
      ON assignments(user_id, role_id, COALESCE(org_unit_id, 0));
  `);

  /* ------------------------------ backfills -------------------------------- */
  if (tableExists('users') && !columnExists('users', 'org_id')) {
    exec(`ALTER TABLE users ADD COLUMN org_id INTEGER NOT NULL DEFAULT 1`);
  }
  if (tableExists('groups') && !columnExists('groups', 'org_id')) {
    exec(`ALTER TABLE groups ADD COLUMN org_id INTEGER NOT NULL DEFAULT 1`);
  }
  if (tableExists('memberships') && !columnExists('memberships', 'org_id')) {
    exec(`ALTER TABLE memberships ADD COLUMN org_id INTEGER NOT NULL DEFAULT 1`);
  }

  /* -------------------------- seed roles & perms --------------------------- */
  const insPerm = db.prepare(
    'INSERT OR IGNORE INTO permissions (action, resource) VALUES (?, ?)'
  );
  [
    ['manage','users'],
    ['manage','org_units'],
    ['write','pipeline'],
    ['approve','requests'],
    ['read','audit'],       // aggregate/scoped
    ['read','audit_full'],  // admin-only PII view
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
  const insRP   = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');

  const link = (roleKey, pairs) => {
    const r = qRoleId.get(roleKey);
    if (!r) return;
    for (const [a, res] of pairs) {
      const p = qPermId.get(a, res);
      if (p) insRP.run(r.id, p.id);
    }
  };

  link('admin', [
    ['manage','users'],
    ['manage','org_units'],
    ['write','pipeline'],
    ['approve','requests'],
    ['read','audit'],
    ['read','audit_full'],
  ]);
  link('business_unit_admin', [
    ['manage','users'],
    ['manage','org_units'],
    ['write','pipeline'],
    ['read','audit'],
  ]);
  link('region_admin', [
    ['manage','users'],
    ['manage','org_units'],
    ['read','audit'],
  ]);
  link('dist_manager', [
    ['write','pipeline'],
    ['approve','requests'],
    ['read','audit'],
  ]);
  link('distributor', [['write','pipeline'], ['read','audit']]);
  link('reseller',    [['write','pipeline'], ['read','audit']]);

  exec('COMMIT');
  console.log('✅ Migration complete');
} catch (err) {
  try { exec('ROLLBACK'); } catch {}
  console.error('❌ Migration failed:', err?.message || err);
  process.exit(1);
}
