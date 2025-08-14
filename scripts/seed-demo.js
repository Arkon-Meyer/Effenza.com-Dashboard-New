// scripts/seed-demo.js
const db = require('../database');

function id(sql, ...args) { return db.prepare(sql).run(...args).lastInsertRowid; }
function one(sql, ...args) { return db.prepare(sql).get(...args); }

db.exec('BEGIN');

// tiny org tree
const bu = id(`INSERT INTO org_units (org_id, parent_id, type, name) VALUES (1, NULL, 'business_unit', 'BU A')`);
const r1 = id(`INSERT INTO org_units (org_id, parent_id, type, name) VALUES (1, ?, 'region', 'Region 1')`, bu);
const t1 = id(`INSERT INTO org_units (org_id, parent_id, type, name) VALUES (1, ?, 'team', 'Team 1')`, r1);
const d1 = id(`INSERT INTO org_units (org_id, parent_id, type, name) VALUES (1, ?, 'distributor', 'Distributor 1')`, t1);
const rs = id(`INSERT INTO org_units (org_id, parent_id, type, name) VALUES (1, ?, 'reseller', 'Reseller 1')`, d1);

// users
const uAdmin = id(`INSERT INTO users (name, email, org_id) VALUES ('Admin', 'admin@example.com', 1)`);
const uBU    = id(`INSERT INTO users (name, email, org_id) VALUES ('BU Owner', 'bu@example.com', 1)`);
const uReg   = id(`INSERT INTO users (name, email, org_id) VALUES ('Region Lead', 'region@example.com', 1)`);
const uDist  = id(`INSERT INTO users (name, email, org_id) VALUES ('Dist Manager', 'dm@example.com', 1)`);
const uRes   = id(`INSERT INTO users (name, email, org_id) VALUES ('Reseller User', 'res@example.com', 1)`);

// roles
const rid = key => one('SELECT id FROM roles WHERE key=?', key).id;

// assignments (scoped)
db.prepare(`INSERT INTO assignments (user_id, role_id, org_unit_id) VALUES (?, ?, ?)`).run(uAdmin, rid('admin'), null);
db.prepare(`INSERT INTO assignments (user_id, role_id, org_unit_id) VALUES (?, ?, ?)`).run(uBU, rid('business_unit_admin'), bu);
db.prepare(`INSERT INTO assignments (user_id, role_id, org_unit_id) VALUES (?, ?, ?)`).run(uReg, rid('region_admin'), r1);
db.prepare(`INSERT INTO assignments (user_id, role_id, org_unit_id) VALUES (?, ?, ?)`).run(uDist, rid('dist_manager'), d1);
db.prepare(`INSERT INTO assignments (user_id, role_id, org_unit_id) VALUES (?, ?, ?)`).run(uRes, rid('reseller'), rs);

db.exec('COMMIT');
console.log('✅ Seeded demo org, users, and assignments');
