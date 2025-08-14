// scripts/migrate.js
const db = require('../database');

function hasTable(name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}
function hasColumn(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some(c => c.name === column);
}
function ensure(sql) { db.exec(sql); }

db.exec('BEGIN');

ensure(`
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

ensure(`
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  UNIQUE(action, resource)
);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  org_unit_id INTEGER NULL REFERENCES org_units(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_org ON assignments(org_unit_id);
`);

ensure(`
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at DATETIME DEFAULT CURRENT_TIMESTAMP,
  actor_user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id INTEGER,
  org_unit_id INTEGER,
  ip TEXT, user_agent TEXT,
  details TEXT
);
`);

if (!hasColumn('users','org_id'))      ensure(`ALTER TABLE users ADD COLUMN org_id INTEGER NOT NULL DEFAULT 1;`);
if (!hasColumn('groups','org_id'))     ensure(`ALTER TABLE groups ADD COLUMN org_id INTEGER NOT NULL DEFAULT 1;`);
if (!hasColumn('memberships','org_id'))ensure(`ALTER TABLE memberships ADD COLUMN org_id INTEGER NOT NULL DEFAULT 1;`);

db.exec('COMMIT');

// Seed minimal permissions/roles if empty
const permCount = db.prepare('SELECT COUNT(*) as c FROM permissions').get().c;
if (!permCount) {
  const perms = [
    // action, resource
    ['manage','users'],
    ['manage','org_units'],
    ['write','pipeline'],
    ['approve','requests'],
  ];
  const insP = db.prepare('INSERT INTO permissions (action, resource) VALUES (?, ?)');
  perms.forEach(p => insP.run(...p));
}

const roleCount = db.prepare('SELECT COUNT(*) as c FROM roles').get().c;
if (!roleCount) {
  const roles = [
    ['admin','Admin'],
    ['business_unit_admin','Business Unit Admin'],
    ['region_admin','Region Admin'],
    ['dist_manager','Distribution Manager'],
    ['distributor','Distributor'],
    ['reseller','Reseller'],
  ];
  const insR = db.prepare('INSERT INTO roles (key, name) VALUES (?, ?)');
  roles.forEach(r => insR.run(...r));

  function roleId(key){ return db.prepare('SELECT id FROM roles WHERE key=?').get(key).id; }
  function permId(a,r){ return db.prepare('SELECT id FROM permissions WHERE action=? AND resource=?').get(a,r).id; }
  const insRP = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');

  // Admin: everything we defined
  [['manage','users'],['manage','org_units'],['write','pipeline'],['approve','requests']]
    .forEach(([a,r]) => insRP.run(roleId('admin'), permId(a,r)));

  // Business unit admin
  [['manage','users'],['manage','org_units'],['write','pipeline']].forEach(([a,r]) =>
    insRP.run(roleId('business_unit_admin'), permId(a,r)));

  // Region admin
  [['manage','users'],['manage','org_units']].forEach(([a,r]) =>
    insRP.run(roleId('region_admin'), permId(a,r)));

  // Dist. manager
  [['write','pipeline'],['approve','requests']].forEach(([a,r]) =>
    insRP.run(roleId('dist_manager'), permId(a,r)));

  // Distributor
  [['write','pipeline']].forEach(([a,r]) =>
    insRP.run(roleId('distributor'), permId(a,r)));

  // Reseller (write pipeline)
  [['write','pipeline']].forEach(([a,r]) =>
    insRP.run(roleId('reseller'), permId(a,r)));
}

console.log('✅ Migration complete');
