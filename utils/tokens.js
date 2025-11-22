'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../database');
const { appendAuditEvent } = require('./audit');

const ACCESS_SECRET = process.env.JWT_SECRET || 'dev-secret';
const ACCESS_TTL = '15m'; // adjust later

// -------------------------------------------------------------
// 1) Basic helpers
// -------------------------------------------------------------

function issueAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      typ: 'access'
    },
    ACCESS_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// -------------------------------------------------------------
// 2) Refresh-token storage
// -------------------------------------------------------------

async function storeRefreshToken(userId, rawToken, meta = {}) {
  const tokenHash = hashToken(rawToken);

  const sql = `
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at, issued_ip, issued_ua)
    VALUES ($1, $2, NOW() + INTERVAL '30 days', $3, $4)
    RETURNING *;
  `;

  const values = [
    userId,
    tokenHash,
    meta.ip || null,
    meta.ua || null
  ];

  const { rows } = await db.query(sql, values);
  return rows[0];
}

async function findActiveRefreshByToken(rawToken) {
  if (!rawToken) return null;
  const hashed = hashToken(rawToken);

  const sql = `
    SELECT *
    FROM refresh_tokens
    WHERE token_hash = $1
      AND revoked_at IS NULL
      AND expires_at > NOW()
    LIMIT 1;
  `;

  const { rows } = await db.query(sql, [hashed]);
  return rows[0] || null;
}

// -------------------------------------------------------------
// 3) Token rotation
// -------------------------------------------------------------

async function rotateRefresh(oldRow, userId, meta = {}) {
  // 1) revoke old
  await db.query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE id = $1`,
    [oldRow.id]
  );

  // 2) issue new
  const newRaw = generateRefreshToken();
  const newRow = await storeRefreshToken(userId, newRaw, meta);

  return {
    record: newRow,
    refreshToken: newRaw
  };
}

// -------------------------------------------------------------
// 4) Revocation helpers
// -------------------------------------------------------------

async function revokeRefreshByHash(rawToken) {
  const hashed = hashToken(rawToken);

  await db.query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE token_hash = $1`,
    [hashed]
  );
}

async function revokeAllForUser(userId) {
  await db.query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE user_id = $1
       AND revoked_at IS NULL`,
    [userId]
  );
}

// -------------------------------------------------------------
// Exports
// -------------------------------------------------------------

module.exports = {
  issueAccessToken,
  generateRefreshToken,
  hashToken,
  storeRefreshToken,
  findActiveRefreshByToken,
  rotateRefresh,
  revokeRefreshByHash,
  revokeAllForUser
};
