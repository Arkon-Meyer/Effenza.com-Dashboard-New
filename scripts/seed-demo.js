/* eslint-disable no-console */
const { tx } = require('../database');

(async () => {
  try {
    await tx(async (db) => {
      // Demo users (idempotent by email)
      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id BIGSERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      const users = [
        ['Admin', 'admin@example.com'],
        ['asgegs','asgr@gmal.com'],
        ['Arkon','arkon@example.com'],
        ['Alice','alice@example.com'],
        ['BU Owner','bu@example.com'],
        ['Region Lead','region@example.com'],
        ['Dist Manager','dm@example.com'],
        ['Reseller User','res@example.com'],
        ['BU Admin','buadmin@example.com'],
        ['Region North Admin','region.north@example.com'],
        ['Region South Admin','region.south@example.com'],
        ['Dist Manager','dist.manager@example.com'],
        ['Distributor User','distributor.user@example.com'],
        ['Reseller User','reseller.user@example.com']
      ];
      for (const [name, email] of users) {
        await db.query(
          `INSERT INTO users(name,email,org_id) VALUES ($1,$2,1)
           ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name`,
          [name, email]
        );
      }

      // org_units shape from your demo
      const upsertOU = `
        INSERT INTO org_units(org_id,parent_id,type,name)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (org_id, COALESCE(parent_id,0), type, name) DO NOTHING
        RETURNING id
      `;
      const root = await db.query(upsertOU, [1, null, 'business_unit', 'BU A']);
      const buA = root.rows[0]?.id || (await db.query(`SELECT id FROM org_units WHERE name='BU A' AND type='business_unit'`)).rows[0].id;

      const id = async (name, type, parent) => {
        const ins = await db.query(upsertOU, [1, parent, type, name]);
        if (ins.rows[0]) return ins.rows[0].id;
        return (await db.query(
          `SELECT id FROM org_units WHERE org_id=1 AND name=$1 AND type=$2 AND COALESCE(parent_id,0)=COALESCE($3,0)`,
          [name, type, parent]
        )).rows[0].id;
      };

      const region1 = await id('Region 1','region', buA);
      const team1   = await id('Team 1','team', region1);
      const dist1   = await id('Distributor 1','distributor', team1);
      await id('Reseller 1','reseller', dist1);
      const rx = await id('Region X','region', buA);
      const ry = await id('Region Y','region', buA);
      await id('Team A','team', ry);
      await id('Team B','team', ry);
      await id('Region QA','region', buA);
      await id('Region QA2','region', buA);
      await id('Team QA2','team', ry);
      const north = await id('North','region', buA);
      const south = await id('South','region', buA);
      await id('Alpha','team', north);
      await id('Beta','team', south);
      const d1 = await id('Distributor D1','distributor', buA);
      await id('Reseller R1','reseller', d1);
    });

    console.log('✅ Seed complete (idempotent)');
  } catch (e) {
    console.error('❌ Seed failed:', e?.message || e);
    process.exit(1);
  }
})();
