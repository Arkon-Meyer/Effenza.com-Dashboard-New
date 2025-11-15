const fs = require('fs');
const path = require('path');
const db = require('../database');

(async () => {
  try {
    const sqlPath = path.join(__dirname, '..', 'migrations', '20251115_audit_log.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await db.query(sql);
    console.log('✅ Migration complete: audit_log');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
})();
