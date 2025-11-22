// utils/audit.js
'use strict';

const crypto = require('crypto');
const db = require('../database');
const logger = require('./logger');

/**
 * Canonical audit-chain payload builder.
 * This MUST stay in lockstep with scripts/verify_audit_chain.js
 */
function buildChainPayload(rowLike) {
  return {
    user_id: rowLike.user_id ?? null,
    session_id: rowLike.session_id ?? null,
    event_type: rowLike.event_type,
    // event_ts must be a string in ISO8601 form for deterministic hashing
    event_ts:
      rowLike.event_ts instanceof Date
        ? rowLike.event_ts.toISOString()
        : String(rowLike.event_ts),
    ip: rowLike.ip || null,
    user_agent: rowLike.user_agent || null,
    payload: rowLike.payload || {},
  };
}

/**
 * Compute the chained SHA-256 over:
 *   prev_hash (or '' for first event) + JSON.stringify(chainPayload)
 */
function computeAuditHash(prevHash, rowLike) {
  const h = crypto.createHash('sha256');
  const chainPayload = buildChainPayload(rowLike);

  h.update(String(prevHash || ''));
  h.update(JSON.stringify(chainPayload));

  return h.digest('hex');
}

/**
 * Append an audit event with hash-chain fields.
 *
 * @param {Object} opts
 * @param {number|null} opts.userId
 * @param {string|null} opts.sessionId
 * @param {string} opts.eventType
 * @param {string|null} opts.ip
 * @param {string|null} opts.userAgent
 * @param {Object} [opts.payload]
 */
async function appendAuditEvent({
  userId = null,
  sessionId = null,
  eventType,
  ip = null,
  userAgent = null,
  payload = {},
}) {
  if (!eventType) {
    throw new Error('appendAuditEvent: eventType is required');
  }

  // 1. Get previous hash in chain (by id ascending)
  const prevRes = await db.query(
    `SELECT curr_hash
       FROM audit_log
      ORDER BY id DESC
      LIMIT 1`
  );

  const prevHash = prevRes.rows.length ? prevRes.rows[0].curr_hash : null;

  // 2. We control event_ts to make hashing deterministic
  const eventTs = new Date();

  // 3. Build chain payload and compute new hash
  const chainRow = {
    user_id: userId,
    session_id: sessionId,
    event_type: eventType,
    event_ts: eventTs.toISOString(),
    ip,
    user_agent: userAgent,
    payload,
  };

  const currHash = computeAuditHash(prevHash, chainRow);

  // 4. Insert row with prev_hash + curr_hash
  const insertSql = `
    INSERT INTO audit_log (
      event_ts,
      user_id,
      session_id,
      event_type,
      ip,
      user_agent,
      payload,
      prev_hash,
      curr_hash
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING id
  `;

  try {
    const { rows } = await db.query(insertSql, [
      eventTs,
      userId,
      sessionId,
      eventType,
      ip,
      userAgent,
      payload,
      prevHash,
      currHash,
    ]);

    const insertedId = rows[0]?.id;
    logger.app('audit_append', {
      id: insertedId,
      user_id: userId,
      event_type: eventType,
    });

    return { id: insertedId, prev_hash: prevHash, curr_hash: currHash };
  } catch (err) {
    logger.app('audit_append_error', {
      message: err.message,
      code: err.code,
    });
    throw err;
  }
}

module.exports = {
  appendAuditEvent,
  buildChainPayload,
  computeAuditHash,
};
