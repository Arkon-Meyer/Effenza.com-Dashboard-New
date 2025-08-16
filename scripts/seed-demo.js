// scripts/seed-demo.js
const db = require('../database');
const QUIET = process.env.SEED_QUIET === '1' || process.argv.includes('--quiet');

// ---------- tiny helpers ----------
const run = (sql, ...args) => db.prepare(sql).run(...args);
const get = (sql, ...args) => db.prepare(sql).get(...args);
const all = (sql, ...args) => db.prepare(sql).all(...args);

function tableExists(name) {
  return !!get("SELECT name FROM sqlite_master WHERE type='table' AND name=?", name);
}

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

// Ensure (or fetch) an org unit by org_id + parent_id + type + name
function ensureOrgUnit({ orgId = 1, parentId = null, type, name }) {
  run(
    `INSERT OR IGNORE INTO org_units (org_id, parent_id, type, name)
     VALUES (?, ?, ?, ?)`,
    orgId, parentId, type, name
  );
  // Lookup uses same uniqueness tuple
  return get(
    `SELECT id, org_id, parent_id, type, name
       FROM org_units
      WHERE org_id = ? AND type = ? AND name = ? AND
            ( (? IS NULL AND parent_id IS NULL) OR parent_id = ? )`,
    orgId, type, name, parentId, parentId
  );
}

// Fetch role id (null-safe)
const roleId = (key) => get('SELECT id FROM roles WHERE key=?', key)?.id ?? null;

// ---------- seed ----------
try {
  // Defensive: require baseline tables
  if (!tableExists('users')) {
    console.error("[seed] ERROR: 'users' table missing. Run migrations first (npm run migrate).");
    process.exit(1);
  }
  if (!tableExists('org_units')) {
    console.error("[seed] ERROR: 'org_units' table missing. Run migrations first (npm run migrate).");
    process.exit(1);
  }

  run('PRAGMA foreign_keys = ON');
  run('BEGIN');

  // Core demo users
  const uAdmin   = ensureUser('Admin', 'admin@example.com');
  const uBU      = ensureUser('BU Admin', 'buadmin@example.com');
  const uNorth   = ensureUser('Region North Admin', 'region.north@example.com');
  const uSouth   = ensureUser('Region South Admin', 'region.south@example.com');
  const uDistMgr = ensureUser('Dist Manager', 'dist.manager@example.com');
  const uDist    = ensureUser('Distributor User', 'distributor.user@example.com');
  const uRes     = ensureUser('Reseller User', 'reseller.user@example.com');

  // Org tree
  const buA         = ensureOrgUnit({ type: 'business_unit', name: 'BU A' });
  const regionNorth = ensureOrgUnit({ parentId: buA.id, type: 'region', name: 'North' });
  const regionSouth = ensureOrgUnit({ parentId: buA.id, type: 'region', name: 'South' });
  const teamAlpha   = ensureOrgUnit({ parentId: regionNorth.id, type: 'team', name: 'Alpha' });
  const teamBeta    = ensureOrgUnit({ parentId: regionSouth.id, type: 'team', name: 'Beta' });

  // Distribution branch
  const distD1      = ensureOrgUnit({ parentId: buA.id, type: 'distributor', name: 'Distributor D1' });
  const resR1       = ensureOrgUnit({ parentId: distD1.id, type: 'reseller', name: 'Reseller R1' });

  // RBAC (optional—tables may not exist yet). Try to ensure roles and wire assignments.
  let rAdmin=null, rBUAdmin=null, rRegionAdmin=null, rDistMgr=null, rDist=null, rRes=null;
  if (tableExists('roles')) {
    rAdmin       = ensureRole('admin', 'Admin').id;
    rBUAdmin     = ensureRole('business_unit_admin', 'Business Unit Admin').id;
    rRegionAdmin = ensureRole('region_admin', 'Region Admin').id;
    rDistMgr     = ensureRole('dist_manager', 'Distribution Manager').id;
    rDist        = ensureRole('distributor', 'Distributor').id;
    rRes         = ensureRole('reseller', 'Reseller').id;

    // Assignments (only if roles table exists)
    if (tableExists('assignments')) {
      if (rAdmin) {
        // Global + BU admin
        ensureAssignment(uAdmin.id, rAdmin, null);
        ensureAssignment(uAdmin.id, rAdmin, buA.id);
      }
      if (rBUAdmin)     ensureAssignment(uBU.id,    rBUAdmin,     buA.id);
      if (rRegionAdmin) { 
        ensureAssignment(uNorth.id,  rRegionAdmin, regionNorth.id);
        ensureAssignment(uSouth.id,  rRegionAdmin, regionSouth.id);
      }
      if (rDistMgr)     ensureAssignment(uDistMgr.id, rDistMgr,   distD1.id);
      if (rDist)        ensureAssignment(uDist.id,    rDist,      distD1.id);
      if (rRes)         ensureAssignment(uRes.id,     rRes,       resR1.id);
    }
  }

  run('COMMIT');

  if (!QUIET) {
    const users = all('SELECT id, name, email FROM users ORDER BY id LIMIT 20');
    const tree  = all(`
      WITH RECURSIVE r(id, parent_id, type, name, depth) AS (
        SELECT id, parent_id, type, name, 0 FROM org_units WHERE parent_id IS NULL
        UNION ALL
        SELECT ou.id, ou.parent_id, ou.type, ou.name, r.depth+1
          FROM org_units ou JOIN r ON ou.parent_id = r.id
      )
      SELECT id, parent_id, type, name, depth
      FROM r
      ORDER BY depth, type, name, id
    `);

    console.log('[seed] users:');
    console.table(users);
    console.log('[seed] org tree:');
    console.table(tree);
    console.log('[seed] done (idempotent).');
  }
} catch (err) {
  try { run('ROLLBACK'); } catch (_) {}
  console.error('[seed] ERROR:', err?.message || err);
  process.exit(1);
}
