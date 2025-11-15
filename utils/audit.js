const crypto = require('crypto');
const db = require('../database');

/**
 * Build a canonical event object based on how the row is stored in DB.
 * This avoids differences between "insert-time" JSON and "read-back" JSON.
 */
function canonicalEvent(row) {
  // Normalize timestamp to ISO string
  const ts = row.event_ts instanceof Date
    ? row.event_ts.toISOString()
    : new Date(row.event_ts).toISOString();

  return {
    event_ts: ts,
    user_id: row.user_id ?? null,
    session_id: row.session_id ?? null,
    event_type: row.event_type,
    ip: row.ip ?? null,
    user_agent: row.user_agent ?? null,
    payload: row.payload || {}
  };
}

/**
 * Compute hash for a DB row + its prev_hash.
 */
function computeHash(prevHashBuf, row) {
  const ordered = canonicalEvent(row);
  const json = JSON.stringify(ordered);
  const h = crypto.createHash('sha256');
  if (prevHashBuf) h.update(prevHashBuf);
  h.update(json, 'utf8');
  return h.digest(); // Buffer for bytea
}

/**
 * Append a new audit event to the chain:
 *  1. Look up last hash
 *  2. Insert row with prev_hash (but no hash yet)
 *  3. Read that row back from DB
 *  4. Compute hash from the DB row
 *  5. UPDATE hash column
 */
async function appendAuditEvent({ userId, sessionId, eventType, ip, userAgent, payload }) {
  // 1) Last hash
  const last = await db.query('SELECT id, hash FROM audit_log ORDER BY id DESC LIMIT 1');
  const prevHash = last.rows[0]?.hash || null;

  // 2) Insert row without hash, but with prev_hash
  const eventTs = new Date().toISOString();
  const insert = await db.query(
    `INSERT INTO audit_log
       (event_ts, user_id, session_id, event_type, ip, user_agent, payload, prev_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      eventTs,
      userId ?? null,
      sessionId ?? null,
      eventType,
      ip || null,
      userAgent || null,
      payload || {},
      prevHash
    ]
  );

  const id = insert.rows[0].id;

  // 3) Read the row back as DB sees it
  const rowRes = await db.query(
    `SELECT id, event_ts, user_id, session_id, event_type, ip, user_agent, payload, prev_hash, hash
     FROM audit_log
     WHERE id = $1`,
    [id]
  );
  const row = rowRes.rows[0];

  // 4) Compute hash from DB row
  const hash = computeHash(row.prev_hash, row);

  // 5) Update hash column
  await db.query(
    'UPDATE audit_log SET hash = $1 WHERE id = $2',
    [hash, id]
  );
}

module.exports = {
  appendAuditEvent,
  computeHash
};
