const fs = require('fs');
const path = require('path');
const db = require('../database'); // must export .query(text, params)

(async () => {
  try {
    const sqlPath = path.join(__dirname, '..', 'migrations', '20251005_refresh_tokens.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await db.query(sql); // executes all statements at once
    console.log('✅ Migration complete: refresh_tokens');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
})();
