#!/usr/bin/env node
/* scripts/seed-demo.js — Postgres demo data (idempotent) */
'use strict';

const { query } = require('../database');
require('dotenv').config({ override: true, quiet: true });

async function one(sql, params = []) {
  const r = await query(sql, params);
  return r.rows[0];
}

async function idOrInsertUser(name, email) {
  const found = await one(`SELECT id FROM users WHERE email=$1`, [email]);
  if (found) return found.id;
  const row = await one(
    `INSERT INTO users(name,email,org_id) VALUES ($1,$2,1) ON CONFLICT DO NOTHING RETURNING id`,
    [name, email]
  );
  if (row?.id) return row.id;
  return (await one(`SELECT id FROM users WHERE email=$1`, [email])).id;
}

async function idOrInsertOrg({ parentId = null, type, name }) {
  const found = await one(
    `SELECT id FROM org_units WHERE org_id=1 AND type=$1 AND name=$2 AND COALESCE(parent_id,0)=COALESCE($3,0)`,
    [type, name, parentId]
  );
  if (found) return found.id;
  const row = await one(
    `INSERT INTO org_units(org_id, parent_id, type, name)
     VALUES (1, $1, $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [parentId, type, name]
  );
  if (row?.id) return row.id;
  return (
    await one(
      `SELECT id FROM org_units WHERE org_id=1 AND type=$1 AND name=$2 AND COALESCE(parent_id,0)=COALESCE($3,0)`,
      [type, name, parentId]
    )
  ).id;
}

async function roleIdByKey(key) {
  const r = await one(`SELECT id FROM roles WHERE key=$1`, [key]);
  if (!r) throw new Error(`Role not found: ${key}`);
  return r.id;
}

async function ensureAssignment({ userId, roleKey, orgUnitId = null }) {
  const rid = await roleIdByKey(roleKey);
  await query(
    `INSERT INTO assignments(user_id, role_id, org_unit_id)
     VALUES ($1,$2,$3)
     ON CONFLICT DO NOTHING`,
    [userId, rid, orgUnitId]
  );
}

async function seed() {
  // users
  const adminId   = await idOrInsertUser('Admin',        'admin@example.com');
  const buOwnerId = await idOrInsertUser('BU Owner',     'bu@example.com');
  const regLeadId = await idOrInsertUser('Region Lead',  'region@example.com');
  const distMgrId = await idOrInsertUser('Dist Manager', 'dm@example.com');
  const resUserId = await idOrInsertUser('Reseller User','res@example.com');

  // extras
  await idOrInsertUser('Arkon',                'arkon@example.com');
  await idOrInsertUser('Alice',                'alice@example.com');
  await idOrInsertUser('BU Admin',             'buadmin@example.com');
  await idOrInsertUser('Region North Admin',   'region.north@example.com');
  await idOrInsertUser('Region South Admin',   'region.south@example.com');
  await idOrInsertUser('Dist Manager',         'dist.manager@example.com');
  await idOrInsertUser('Distributor User',     'distributor.user@example.com');
  await idOrInsertUser('Reseller User',        'reseller.user@example.com');

  // org tree
  const buA     = await idOrInsertOrg({ type: 'business_unit', name: 'BU A' });
  const regionX = await idOrInsertOrg({ parentId: buA, type: 'region', name: 'Region X' });
  const regionY = await idOrInsertOrg({ parentId: buA, type: 'region', name: 'Region Y' });
  const teamA   = await idOrInsertOrg({ parentId: regionY, type: 'team', name: 'Team A' });
  await idOrInsertOrg({ parentId: regionY, type: 'team', name: 'Team B' });
  const distD1  = await idOrInsertOrg({ parentId: buA, type: 'distributor', name: 'Distributor D1' });
  await idOrInsertOrg({ parentId: distD1, type: 'reseller', name: 'Reseller R1' });

  // RBAC grants
  await ensureAssignment({ userId: adminId,   roleKey: 'admin',               orgUnitId: null });
  await ensureAssignment({ userId: buOwnerId, roleKey: 'business_unit_admin', orgUnitId: buA });
  await ensureAssignment({ userId: regLeadId, roleKey: 'region_admin',        orgUnitId: regionY });
  await ensureAssignment({ userId: distMgrId, roleKey: 'dist_manager',        orgUnitId: distD1 });
  await ensureAssignment({ userId: resUserId, roleKey: 'reseller',            orgUnitId: teamA });

  // pretty prints
  const users = await query(`SELECT id, name, email FROM users ORDER BY id`);
  console.table(users.rows);
  const orgs = await query(`
    WITH RECURSIVE t(id, parent_id, type, name, depth) AS (
      SELECT id, parent_id, type, name, 0 FROM org_units WHERE parent_id IS NULL
      UNION ALL
      SELECT u.id, u.parent_id, u.type, u.name, t.depth+1
        FROM org_units u
        JOIN t ON u.parent_id = t.id
    )
    SELECT * FROM t ORDER BY id
  `);
  console.table(orgs.rows);
  console.log('[seed] done (PG, idempotent).');
}

seed().catch((e) => {
  console.error('[seed] error:', e.message || e);
  process.exit(1);
});
