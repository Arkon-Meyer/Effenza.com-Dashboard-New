// scripts/seed-demo.js
/* eslint-disable no-console */
const db = require('../database');

function row(obj) { return Object.assign({}, obj); }

// helpers: select-or-insert patterns (idempotent)
const qUserByEmail = db.prepare('SELECT id FROM users WHERE email=?');
const insUser      = db.prepare('INSERT INTO users(name,email,org_id) VALUES (?,?,1)');
function ensureUser(name, email) {
  const hit = qUserByEmail.get(email);
  if (hit) return hit.id;
  return insUser.run(name, email).lastInsertRowid;
}

// NOTE: uniqueness is enforced by uniq_orgunit_org_parent_type_name in migrate.js
const qOrgUnit = db.prepare(`
  SELECT id FROM org_units
  WHERE org_id=1 AND type=? AND name=? AND COALESCE(parent_id,0)=COALESCE(?,0)
`);
const insOrgUnit = db.prepare(`
  INSERT INTO org_units(org_id, parent_id, type, name)
  VALUES (1, ?, ?, ?)
`);
function ensureOrgUnit({ parentId = null, type, name }) {
  const hit = qOrgUnit.get(type, name, parentId ?? null);
  if (hit) return hit.id;
  return insOrgUnit.run(parentId ?? null, type, name).lastInsertRowid;
}

const qRoleId = db.prepare('SELECT id FROM roles WHERE key=?');
const insAssign = db.prepare(`
  INSERT OR IGNORE INTO assignments(user_id, role_id, org_unit_id)
  VALUES (?, ?, ?)
`);
function ensureAssignment({ userId, roleKey, orgUnitId = null }) {
  const r = qRoleId.get(roleKey);
  if (!r) throw new Error(`Role not found: ${roleKey}`);
  insAssign.run(userId, r.id, orgUnitId ?? null); // unique index prevents dupes
}

try {
  db.exec('BEGIN');

  /* ------------------------------- users ---------------------------------- */
  const adminId   = ensureUser('Admin',               'admin@example.com');
  const buOwnerId = ensureUser('BU Owner',            'bu@example.com');
  const regLeadId = ensureUser('Region Lead',         'region@example.com');
  const distMgrId = ensureUser('Dist Manager',        'dm@example.com');
  const resUserId = ensureUser('Reseller User',       'res@example.com');

  // extra demo users from your previous seeds
  ensureUser('Arkon',                  'arkon@example.com');
  ensureUser('Alice',                  'alice@example.com');
  ensureUser('BU Admin',               'buadmin@example.com');
  ensureUser('Region North Admin',     'region.north@example.com');
  ensureUser('Region South Admin',     'region.south@example.com');
  ensureUser('Dist Manager',           'dist.manager@example.com');
  ensureUser('Distributor User',       'distributor.user@example.com');
  ensureUser('Reseller User',          'reseller.user@example.com');

  /* ------------------------------ org tree -------------------------------- */
  const buA = ensureOrgUnit({ type: 'business_unit', name: 'BU A' });

  const regionX = ensureOrgUnit({ parentId: buA, type: 'region', name: 'Region X' });
  const regionY = ensureOrgUnit({ parentId: buA, type: 'region', name: 'Region Y' });

  const teamA = ensureOrgUnit({ parentId: regionY, type: 'team', name: 'Team A' });
  const teamB = ensureOrgUnit({ parentId: regionY, type: 'team', name: 'Team B' });

  const distD1 = ensureOrgUnit({ parentId: buA, type: 'distributor', name: 'Distributor D1' });
  ensureOrgUnit({ parentId: distD1, type: 'reseller', name: 'Reseller R1' });

  /* ------------------------------- RBAC ----------------------------------- */
  // global admin
  ensureAssignment({ userId: adminId,   roleKey: 'admin',                orgUnitId: null });

  // BU owner/admin over BU A
  ensureAssignment({ userId: buOwnerId, roleKey: 'business_unit_admin',  orgUnitId: buA });

  // Region lead over Region Y
  ensureAssignment({ userId: regLeadId, roleKey: 'region_admin',         orgUnitId: regionY });

  // Dist manager over Distributor D1
  ensureAssignment({ userId: distMgrId, roleKey: 'dist_manager',         orgUnitId: distD1 });

  // Reseller user (writer)
  ensureAssignment({ userId: resUserId, roleKey: 'reseller',             orgUnitId: teamA });

  db.exec('COMMIT');

  // pretty prints
  const users = db.prepare('SELECT id, name, email FROM users ORDER BY id').all();
  console.table(users);

  const orgs = db.prepare(`
    WITH RECURSIVE t(id, parent_id, type, name, depth) AS (
      SELECT id, parent_id, type, name, 0 FROM org_units WHERE parent_id IS NULL
      UNION ALL
      SELECT u.id, u.parent_id, u.type, u.name, t.depth+1
      FROM org_units u JOIN t ON u.parent_id = t.id
    ) SELECT * FROM t ORDER BY id
  `).all();
  console.table(orgs);

  console.log('[seed] done (idempotent).');
} catch (err) {
  try { db.exec('ROLLBACK'); } catch {}
  console.error('[seed] error:', err?.message || err);
  process.exit(1);
}
