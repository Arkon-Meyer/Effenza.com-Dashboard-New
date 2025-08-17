/* eslint-disable no-console */
const { tx } = require('../database');

(async () => {
  try {
    await tx(async (db) => {
      // ----- extensions (safe if already enabled) -----
      await db.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
      await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

      // ----- audit_log -----
      await db.query(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id           BIGSERIAL PRIMARY KEY,
          actor_id     INTEGER,
          action       TEXT NOT NULL,
          resource     TEXT NOT NULL,
          resource_id  INTEGER,
          org_unit_id  INTEGER,
          details      JSONB,
          ip           INET,
          user_agent   TEXT,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_created    ON audit_log (created_at);`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_resource   ON audit_log (resource);`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_org        ON audit_log (org_unit_id);`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_actor      ON audit_log (actor_id);`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_res_id     ON audit_log (resource, resource_id);`);

      // ----- org_units -----
      await db.query(`
        CREATE TABLE IF NOT EXISTS org_units (
          id         BIGSERIAL PRIMARY KEY,
          org_id     INTEGER NOT NULL DEFAULT 1,
          parent_id  BIGINT REFERENCES org_units(id) ON DELETE SET NULL,
          type       TEXT NOT NULL CHECK (type IN ('business_unit','region','team','distributor','reseller')),
          name       TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          deleted_at TIMESTAMPTZ
        );
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_org_units_parent ON org_units(parent_id);`);
      // unique across name within scope (use functional unique index)
      await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_orgunit_org_parent_type_name
        ON org_units (org_id, COALESCE(parent_id,0), type, name);
      `);

      // ----- roles / permissions / links / assignments -----
      await db.query(`
        CREATE TABLE IF NOT EXISTS roles (
          id   BIGSERIAL PRIMARY KEY,
          key  TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL
        );
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS permissions (
          id       BIGSERIAL PRIMARY KEY,
          action   TEXT NOT NULL,
          resource TEXT NOT NULL,
          UNIQUE(action, resource)
        );
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS role_permissions (
          role_id       BIGINT NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
          permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
          PRIMARY KEY (role_id, permission_id)
        );
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS assignments (
          id          BIGSERIAL PRIMARY KEY,
          user_id     BIGINT NOT NULL,
          role_id     BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
          org_unit_id BIGINT REFERENCES org_units(id) ON DELETE CASCADE,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id);`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_assignments_org  ON assignments(org_unit_id);`);
      await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_assignment_user_role_scope
        ON assignments(user_id, role_id, COALESCE(org_unit_id, 0));
      `);

      // Backfills for users/groups/memberships if present in schema
      await db.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='users')
             AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='org_id')
          THEN
            EXECUTE 'ALTER TABLE users ADD COLUMN org_id INTEGER NOT NULL DEFAULT 1';
          END IF;
        END$$;
      `);
      await db.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='groups')
             AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='groups' AND column_name='org_id')
          THEN
            EXECUTE 'ALTER TABLE groups ADD COLUMN org_id INTEGER NOT NULL DEFAULT 1';
          END IF;
        END$$;
      `);
      await db.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='memberships')
             AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='memberships' AND column_name='org_id')
          THEN
            EXECUTE 'ALTER TABLE memberships ADD COLUMN org_id INTEGER NOT NULL DEFAULT 1';
          END IF;
        END$$;
      `);

      // Seed permissions/roles (idempotent)
      const insPerm = `INSERT INTO permissions(action,resource)
                       VALUES ($1,$2) ON CONFLICT (action,resource) DO NOTHING`;
      const perms = [
        ['manage','users'],
        ['manage','org_units'],
        ['write','pipeline'],
        ['approve','requests'],
        ['read','audit'],
        ['read','audit_full']
      ];
      for (const p of perms) await db.query(insPerm, p);

      const insRole = `INSERT INTO roles(key,name) VALUES ($1,$2)
                       ON CONFLICT (key) DO NOTHING`;
      const roles = [
        ['admin','Admin'],
        ['business_unit_admin','Business Unit Admin'],
        ['region_admin','Region Admin'],
        ['dist_manager','Distribution Manager'],
        ['distributor','Distributor'],
        ['reseller','Reseller']
      ];
      for (const r of roles) await db.query(insRole, r);

      // link role → permissions
      const roleId = async (key) => (await db.query(`SELECT id FROM roles WHERE key=$1`, [key])).rows[0]?.id;
      const permId = async (a, r) => (await db.query(`SELECT id FROM permissions WHERE action=$1 AND resource=$2`, [a, r])).rows[0]?.id;
      const link = async (rkey, pairs) => {
        const rid = await roleId(rkey);
        if (!rid) return;
        for (const [a, res] of pairs) {
          const pid = await permId(a, res);
          if (pid) {
            await db.query(
              `INSERT INTO role_permissions(role_id,permission_id)
               VALUES ($1,$2) ON CONFLICT DO NOTHING`,
              [rid, pid]
            );
          }
        }
      };

      await link('admin', [['manage','users'], ['manage','org_units'], ['write','pipeline'], ['approve','requests'], ['read','audit'], ['read','audit_full']]);
      await link('business_unit_admin', [['manage','users'], ['manage','org_units'], ['write','pipeline'], ['read','audit']]);
      await link('region_admin', [['manage','users'], ['manage','org_units'], ['read','audit']]);
      await link('dist_manager', [['write','pipeline'], ['approve','requests'], ['read','audit']]);
      await link('distributor', [['write','pipeline'], ['read','audit']]);
      await link('reseller', [['write','pipeline'], ['read','audit']]);
    });

    console.log('✅ Migration complete (Postgres)');
  } catch (e) {
    console.error('❌ Migration failed:', e?.message || e);
    process.exit(1);
  }
})();
