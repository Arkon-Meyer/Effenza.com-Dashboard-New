// scripts/seed-demo.js
const db = require('../database');
const QUIET = process.env.SEED_QUIET === '1' || process.argv.includes('--quiet');

// Small helpers
function run(sql, ...args) {
  return db.prepare(sql).run(...args);
}
function get(sql, ...args) {
  return db.prepare(sql).get(...args);
}
function all(sql, ...args) {
  return db.prepare(sql).all(...args);
}

// Idempotent inserts
function ensureUser(name, email) {
  run('INSERT OR IGNORE INTO users(name, email) VALUES (?, ?)', name, email);
  return get('SELECT id, name, email FROM users WHERE email = ?', email);
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

function main() {
  // Ensure a few demo users exist (idempotent)
  const uAdmin = ensureUser('Admin', 'admin@example.com');
  ensureUser('asgegs', 'asgr@gmal.com');
  ensureUser('Arkon', 'arkon@example.com');
  ensureUser('Alice', 'alice@example.com');
  ensureUser('BU Owner', 'bu@example.com');

  // Ensure a root Business Unit exists
  const buA = ensureRootBU('BU A');

  // (Optional) Ensure Admin has global + BU assignment to “admin” role if roles table exists
  // Safe-guard: only if the roles table is present and has 'admin'
  try {
    const adminRole = get("SELECT id FROM roles WHERE key='admin'");
    if (adminRole && uAdmin && buA) {
      run(
        `INSERT OR IGNORE INTO assignments (user_id, role_id, org_unit_id)
         VALUES (?, ?, NULL)`,
        uAdmin.id, adminRole.id
      );
      run(
        `INSERT OR IGNORE INTO assignments (user_id, role_id, org_unit_id)
         VALUES (?, ?, ?)`,
        uAdmin.id, adminRole.id, buA.id
      );
    }
  } catch {
    // roles/assignments may not exist on very early schemas — ignore silently
  }

  if (!QUIET) {
    const users = all('SELECT id, name, email FROM users ORDER BY id LIMIT 5');
    const roots = all(
      `SELECT id, type, name
         FROM org_units
        WHERE parent_id IS NULL AND deleted_at IS NULL`
    );
    console.log('[seed] users:', users);
    console.log('[seed] root org units:', roots);
    console.log('[seed] done (idempotent).');
  }
}

main();
