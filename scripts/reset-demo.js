// scripts/reset-demo.js
const db = require('../database');
try {
  db.exec('BEGIN');
  db.exec(`
    DELETE FROM audit_log;
    DELETE FROM assignments;
    DELETE FROM org_units;
    -- keep users/roles/permissions if you prefer; or clear demo users:
    -- DELETE FROM users WHERE email LIKE '%@example.com';
  `);
  db.exec('COMMIT');
  console.log('✅ Demo data cleared');
} catch (e) {
  try { db.exec('ROLLBACK'); } catch {}
  console.error('❌ reset-demo failed:', e?.message || e);
  process.exit(1);
}
