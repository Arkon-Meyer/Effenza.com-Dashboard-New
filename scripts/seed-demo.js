// scripts/seed-demo.js
// Idempotent demo seed for Effenza Dashboard.
// Safe to run multiple times (used by npm postinstall).

const db = require('../database');

// Helpers
const get = (sql, ...args) => db.prepare(sql).get(...args);
const all = (sql, ...args) => db.prepare(sql).all(...args);
const run = (sql, ...args) => db.prepare(sql).run(...args);

function ensureUser(name, email) {
  run('INSERT OR IGNORE INTO users(name, email) VALUES (?, ?)', name, email);
  const row = get('SELECT id FROM users WHERE email = ?', email);
  return row?.id;
}

function ensureOrgUnit(parentId, type, name) {
  let row;
  if (parentId == null) {
    row = get(
      'SELECT id FROM org_units WHERE parent_id IS NULL AND type = ? AND name = ? AND deleted_at IS NULL',
      type,
      name
    );
    if (!row) {
      run('INSERT INTO org_units(org_id, parent_id, type, name) VALUES (1, NULL, ?, ?)', type, name);
      row = get(
        'SELECT id FROM org_units WHERE parent_id IS NULL AND type = ? AND name = ? AND deleted_at IS NULL',
        type,
        name
      );
    }
  } else {
    row = get(
      'SELECT id FROM org_units WHERE parent_id = ? AND type = ? AND name = ? AND deleted_at IS NULL',
      parentId,
      type,
      name
    );
    if (!row) {
      run('INSERT INTO org_units(org_id, parent_id, type, name) VALUES (1, ?, ?, ?)', parentId, type, name);
      row = get(
        'SELECT id FROM org_units WHERE parent_id = ? AND type = ? AND name = ? AND deleted_at IS NULL',
        parentId,
        type,
        name
      );
    }
  }
  return row.id;
}

function roleId(key) {
  const r = get('SELECT id FROM roles WHERE key = ?', key);
  if (!r) throw new Error(`Missing role with key=${key} (did you run migrations?)`);
  return r.id;
}

function ensureAssignment(userId, roleId, orgUnitId /* may be null */) {
  run('INSERT OR IGNORE INTO assignments(user_id, role_id, org_unit_id) VALUES (?, ?, ?)', userId, roleId, orgUnitId ?? null);
}

function main() {
  // 1) Core demo users
  const uAdmin   = ensureUser('Admin',        'admin@example.com');
  const uBU      = ensureUser('BU Owner',     'bu@example.com');
  const uRegion  = ensureUser('Region Lead',  'region@example.com');
  const uDM      = ensureUser('Dist Manager', 'dm@example.com');
  const uRes     = ensureUser('Reseller User','res@example.com');

  // 2) Org structure (ensure BU A and Region Y exist)
  const buA = ensureOrgUnit(null, 'business_unit', 'BU A');
  const regionY = ensureOrgUnit(buA, 'region', 'Region Y');

  // 3) Role ids
  const rAdmin         = roleId('admin');
  const rBUAdmin       = roleId('business_unit_admin');
  const rRegionManager = roleId('region_manager');
  const rDistManager   = roleId('dist_manager');
  const rReseller      = roleId('reseller');

  // 4) Assignments (INSERT OR IGNORE keeps it idempotent)
  // Admin: tenant-wide and BU A
  ensureAssignment(uAdmin, rAdmin, null);
  ensureAssignment(uAdmin, rAdmin, buA);

  // BU Owner: admin of BU A
  ensureAssignment(uBU, rBUAdmin, buA);

  // Region Lead: region manager of Region Y
  ensureAssignment(uRegion, rRegionManager, regionY);

  // Dist Manager: attach under Region Y
  ensureAssignment(uDM, rDistManager, regionY);

  // Reseller: attach under Region Y
  ensureAssignment(uRes, rReseller, regionY);

  // 5) Optional: echo a tiny summary
  const users = all('SELECT id, name, email FROM users ORDER BY id LIMIT 5');
  const roots = all('SELECT id, type, name FROM org_units WHERE parent_id IS NULL AND deleted_at IS NULL');
  console.log('[seed] users:', users);
  console.log('[seed] root org units:', roots);
  console.log('[seed] done (idempotent).');
}

try {
  main();
} catch (err) {
  console.error('[seed] error:', err);
  process.exit(1);
}
