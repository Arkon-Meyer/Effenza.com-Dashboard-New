#!/usr/bin/env node
require('dotenv').config({ override: true });

const crypto = require('crypto');
const db = require('../database');

async function getTimestampColumn() {
  const sql = `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'audit_log'
      AND column_name IN ('event_ts', 'created_at')
    ORDER BY (column_name = 'event_ts') DESC
    LIMIT 1;
  `;
  const res = await db.query(sql);
  if (!res.rows.length) {
    throw new Error('No timestamp column (event_ts/created_at) found on audit_log');
  }
  return res.rows[0].column_name;
}

async function getUserColumn() {
  const sql = `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'audit_log'
      AND column_name IN ('user_id', 'actor_id')
    ORDER BY (column_name = 'user_id') DESC
    LIMIT 1;
  `;
  const res = await db.query(sql);
  if (!res.rows.length) {
    throw new Error('No user column (user_id/actor_id) found on audit_log');
  }
  return res.rows[0].column_name;
}

function computeHash(prevHash, row) {
  const h = crypto.createHash('sha256');

  h.update(String(prevHash || ''));

  const payload = {
    id: row.id,
    user_id: row.user_id,
    session_id: row.session_id,
    event_type: row.event_type,
    event_ts:
      row.event_ts instanceof Date
        ? row.event_ts.toISOString()
        : String(row.event_ts),
    ip: row.ip || null,
    user_agent: row.user_agent || null,
    payload: row.payload || {},
  };

  h.update(JSON.stringify(payload));
  return h.digest('hex');
}

async function main() {
  const tsCol = await getTimestampColumn();
  const userCol = await getUserColumn();

  const { rows } = await db.query(`
    SELECT
      id,
      ${tsCol}   AS event_ts,
      ${userCol} AS user_id,
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
    const expectedPrev = prevHash || null;

    if ((row.prev_hash || null) !== expectedPrev) {
      console.error(
        \`❌ Hash mismatch at id=\${row.id}: prev_hash=\${row.prev_hash} expected=\${expectedPrev}\`
      );
      process.exit(1);
    }

    const computed = computeHash(prevHash, row);
    if (row.curr_hash !== computed) {
      console.error(
        \`❌ Hash mismatch at id=\${row.id}: stored curr_hash does not match recomputed hash\`
      );
      process.exit(1);
    }

    prevHash = row.curr_hash;
  }

  console.log(\`✅ Audit chain verification PASSED for \${rows.length} events.\`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error during audit chain verification:', err.message);
  process.exit(1);
});
