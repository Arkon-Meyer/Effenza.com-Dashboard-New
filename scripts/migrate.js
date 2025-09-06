#!/usr/bin/env node
/* scripts/migrate.js — Postgres schema (idempotent) */
'use strict';

const { query } = require('../database');
require('dotenv').config({ override: true, quiet: true });

async function migrate() {
  // Users / basic entities
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      org_id INTEGER NOT NULL DEFAULT 1
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS groups (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      org_id INTEGER NOT NULL DEFAULT 1
    );
  `);

  // Memberships (user <-> group)
  await query(`
    CREATE TABLE IF NOT EXISTS memberships (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      role TEXT NOT NULL
    );
  `);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_membership ON memberships(user_id, group_id);`);

  // Org units (tree)
  await query(`
    CREATE TABLE IF NOT EXISTS org_units (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL DEFAULT 1,
      parent_id INTEGER REFERENCES org_units(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK (type IN ('business_unit','region','team','distributor','reseller')),
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_org_units_parent ON org_units(parent_id);`);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_orgunit_org_parent_type_name
      ON org_units (org_id, COALESCE(parent_id, 0), type, name);
  `);

  // RBAC
  await query(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS permissions (
      id SERIAL PRIMARY KEY,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      CONSTRAINT uniq_perm UNIQUE(action, resource)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS assignments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      org_unit_id INTEGER REFERENCES org_units(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_assignments_org  ON assignments(org_unit_id);`);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_assignment_user_role_scope
      ON assignments(user_id, role_id, COALESCE(org_unit_id, 0));
  `);

  // Audit
  await query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      actor_id INTEGER,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      resource_id INTEGER,
      org_unit_id INTEGER,
      details JSONB,
      ip TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_created     ON audit_log(created_at);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_resource    ON audit_log(resource);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_org         ON audit_log(org_unit_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_actor       ON audit_log(actor_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_res_and_id  ON audit_log(resource, resource_id);`);

  // Seed roles + permissions (idempotent, PG-style upserts)
  await query(`
    INSERT INTO permissions (action, resource) VALUES
      ('manage','users'),
      ('manage','org_units'),
      ('write','pipeline'),
      ('approve','requests'),
      ('read','audit'),
      ('read','audit_full')
    ON CONFLICT DO NOTHING;
  `);

  await query(`
    INSERT INTO roles (key, name) VALUES
      ('admin','Admin'),
      ('business_unit_admin','Business Unit Admin'),
      ('region_admin','Region Admin'),
      ('dist_manager','Distribution Manager'),
      ('distributor','Distributor'),
      ('reseller','Reseller')
    ON CONFLICT DO NOTHING;
  `);

  console.log('✅ Migration complete (Postgres)');
}

migrate().catch((e) => {
  console.error('❌ migrate:', e.message || e);
  process.exit(1);
});
