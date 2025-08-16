// scripts/reset-demo.js
/* eslint-disable no-console */
const db = require('../database');

try {
  db.exec('BEGIN');

  // Wipe audit logs (demo/dev only!)
  db.exec(`DELETE FROM audit_log;`);

  // Wipe assignments first, then org_units (FKs handle children)
  db.exec(`DELETE FROM assignments;`);
  db.exec(`DELETE FROM org_units;`);

  // Wipe demo users only (keep Admin account)
  db.exec(`
    DELETE FROM users
    WHERE email IN (
      'bu@example.com','region@example.com','dm@example.com','res@example.com',
      'arkon@example.com','alice@example.com',
      'buadmin@example.com','region.north@example.com','region.south@example.com',
      'dist.manager@example.com','distributor.user@example.com','reseller.user@example.com'
    );
  `);

  db.exec('COMMIT');
  console.log('✅ Demo data reset.');
} catch (e) {
  try { db.exec('ROLLBACK'); } catch {}
  console.error('❌ reset-demo:', e?.message || e);
  process.exit(1);
}
