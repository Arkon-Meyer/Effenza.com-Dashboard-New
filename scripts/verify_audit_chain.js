#!/usr/bin/env node
'use strict';

require('dotenv').config({ override: true, quiet: true });

const db = require('../database');
const { buildChainPayload, computeAuditHash } = require('../utils/audit');

async function main() {
  // Pull all events in chain order
  const { rows } = await db.query(`
    SELECT
      id,
      event_ts,
      user_id,
      session_id,
      event_type,
      ip,
      user_agent,
      payload,
      prev_hash,
      curr_hash
    FROM audit_log
    ORDER BY id ASC
  `);

  if (!rows.length) {
    console.log('ℹ️  audit_log is empty – nothing to verify.');
    process.exit(0);
  }

  let prevHash = null;

  for (const row of rows) {
    // 1) Check that prev_hash matches the previous curr_hash
    const expectedPrev = prevHash || null;
    const actualPrev = row.prev_hash || null;

    if (actualPrev !== expectedPrev) {
      console.error(
        `❌ Hash mismatch at id=${row.id}: prev_hash=${actualPrev} expected=${expectedPrev}`
      );
      process.exit(1);
    }

    // 2) Recompute curr_hash using the *same* canonical function
    const chainRow = {
      user_id: row.user_id,
      session_id: row.session_id,
      event_type: row.event_type,
      event_ts: row.event_ts instanceof Date
        ? row.event_ts.toISOString()
        : String(row.event_ts),
      ip: row.ip,
      user_agent: row.user_agent,
      payload: row.payload,
    };

    const recomputed = computeAuditHash(prevHash, chainRow);

    if (row.curr_hash !== recomputed) {
      console.error(
        `❌ Hash mismatch at id=${row.id}: stored curr_hash does not match recomputed hash`
      );
      process.exit(1);
    }

    prevHash = row.curr_hash;
  }

  console.log(`✅ Audit chain verification PASSED for ${rows.length} events.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error during audit chain verification:', err.message);
  process.exit(1);
});
