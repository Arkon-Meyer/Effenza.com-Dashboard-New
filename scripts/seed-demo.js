// scripts/seed-demo.js
const db = require('../database');
const QUIET = process.env.SEED_QUIET === '1' || process.argv.includes('--quiet');

// --- tiny helpers ------------------------------------------------------------
const run = (sql, ...args) => db.prepare(sql).run(...args);
const get = (sql, ...args) => db.prepare(sql).get(...args);
const all = (sql, ...args) => db.prepare(sql).all(...args);

function ensureUser(name, email) {
  run('INSERT OR IGNORE INTO users(name, email) VALUES (?, ?)', name, email);
  return get('SELECT id, name, email FROM users WHERE email = ?', email);
}

function ensureRole(key, name) {
  run('INSERT OR IGNORE INTO roles(key, name) VALUES (?, ?)', key, name);
  return get('SELECT id, key, name FROM roles WHERE key = ?', key);
}

function ensureAssignment(userId, roleId, orgUnitId /* may be null */) {
  run(
    `INSERT OR IGNORE INTO assignments (user_id, role_id, org_unit_id)
     VALUES (?, ?, ?)`,
    userId, roleId, orgUnitId ?? null
  );
}

function ensureRootBU(name = 'BU A') {
  run(
    `INSERT OR IGNORE INTO org_units (org_id, parent_id, type, name)
     VALUES (1, NULL, 'business_unit', ?)`,
    name
  );
  return get(
    `SELECT id, org_id, parent_id, type, name
       FROM org_units
      WHERE parent_id IS NULL AND type='business_unit' AND name=?`,
    name
  );
}

// --- seed --------------------------------------------------------------------
try {
  // Enforce FKs and keep the seed atomic
  run('PRAGMA foreign_keys = ON');
  run('BEGIN');

  // Users (idempotent)
  const uAdmin  = ensureUser('Admin',  'admin@example.com');
  ensureUser('Arkon',  'arkon@example.com');
  ensureUser('Alice',  'alice@example.com');
  ensureUser('BU Owner','bu@example.com');

  // Root business unit
  const buA = ensureRootBU('BU A');

  // If RBAC tables exist, link Admin globally + to BU A
  let adminRoleId = null;
  try {
    // ensure the role exists if the roles table is present
    const r = ensureRole('admin', 'Admin'); // harmless if table missing -> will throw and be caught below
    adminRoleId = r?.id ?? null;
  } catch (_) {
    // roles table may not exist on very early schemas — ignore silently
  }

  if (adminRoleId && uAdmin && buA) {
    ensureAssignment(uAdmin.id, adminRoleId, null);   // global admin
    ensureAssignment(uAdmin.id, adminRoleId, buA.id); // BU A scoped admin
  }

  run('COMMIT');

  if (!QUIET) {
    const users = all('SELECT id, name, email FROM users ORDER BY id LIMIT 5');
    const roots = all(`
      SELECT id, type, name
        FROM org_units
       WHERE parent_id IS NULL AND deleted_at IS NULL
    `);
    console.log('[seed] users:', users);
    console.log('[seed] root org units:', roots);
    console.log('[seed] done (idempotent).');
  }
} catch (err) {
  try { run('ROLLBACK'); } catch (_) {}
  console.error('[seed] ERROR:', err?.message || err);
  process.exit(1);
}
