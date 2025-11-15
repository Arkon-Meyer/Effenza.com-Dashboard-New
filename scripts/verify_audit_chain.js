const db = require('../database');
const { computeHash } = require('../utils/audit');

(async () => {
  try {
    const res = await db.query(`
      SELECT id, event_ts, user_id, session_id, event_type, ip, user_agent, payload, prev_hash, hash
      FROM audit_log
      ORDER BY id ASC
    `);

    const rows = res.rows || [];
    if (rows.length === 0) {
      console.log('ℹ️  audit_log is empty – nothing to verify.');
      process.exit(0);
    }

    let ok = true;
    let prevStoredHash = null;

    for (const row of rows) {
      // Check prev_hash linkage
      if (row.id === rows[0].id) {
        // First row: prev_hash must be null
        if (row.prev_hash) {
          console.error(`❌ Chain break at id=${row.id}: first row has non-null prev_hash`);
          ok = false;
          break;
        }
      } else {
        // Subsequent rows: prev_hash must equal previous row's hash
        if (!row.prev_hash || !Buffer.isBuffer(row.prev_hash) || !row.prev_hash.equals(prevStoredHash)) {
          console.error(`❌ Chain break at id=${row.id}: prev_hash does not match previous hash`);
          ok = false;
          break;
        }
      }

      // Recompute hash from the DB row
      const expectedHash = computeHash(row.prev_hash, row);
      if (!row.hash || !Buffer.isBuffer(row.hash) || !row.hash.equals(expectedHash)) {
        console.error(`❌ Hash mismatch at id=${row.id}: stored hash does not match recomputed hash`);
        ok = false;
        break;
      }

      prevStoredHash = row.hash;
    }

    if (!ok) {
      console.error('❌ Audit chain verification FAILED.');
      process.exit(1);
    }

    console.log(`✅ Audit chain verification PASSED for ${rows.length} events.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during audit chain verification:', err.message);
    process.exit(1);
  }
})();
