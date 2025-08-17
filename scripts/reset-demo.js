/* eslint-disable no-console */
const { tx } = require('../database');

(async () => {
  try {
    await tx(async (db) => {
      await db.query(`DELETE FROM audit_log;`);
      await db.query(`DELETE FROM assignments;`);
      await db.query(`DELETE FROM org_units;`);
      await db.query(`
        DELETE FROM users
        WHERE email IN (
          'bu@example.com','region@example.com','dm@example.com','res@example.com',
          'arkon@example.com','alice@example.com',
          'buadmin@example.com','region.north@example.com','region.south@example.com',
          'dist.manager@example.com','distributor.user@example.com','reseller.user@example.com'
        );
      `);
    });
    console.log('✅ Demo data reset (Postgres).');
  } catch (e) {
    console.error('❌ reset-demo:', e?.message || e);
    process.exit(1);
  }
})();
