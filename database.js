const Database = require('better-sqlite3');

const db = new Database('effenza.db');

// Safety & performance
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS uniq_membership ON memberships(user_id, group_id)').run();

// Groups table
db.prepare(`
  CREATE TABLE IF NOT EXISTS groups (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  )
`).run();

// Users table
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL
  )
`).run();

// Memberships table
db.prepare(`
  CREATE TABLE IF NOT EXISTS memberships (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER NOT NULL,
    group_id  INTEGER NOT NULL,
    role      TEXT NOT NULL CHECK(role IN ('viewer','editor','group-admin','dashboard-admin')),
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  )
`).run();

db.prepare('CREATE INDEX IF NOT EXISTS idx_memberships_user  ON memberships(user_id)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_memberships_group ON memberships(group_id)').run();

module.exports = db;
