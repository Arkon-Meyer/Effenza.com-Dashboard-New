const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../database');

const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || '30d';
const JWT_SECRET  = process.env.JWT_SECRET || 'dev_only_change_me';

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function generateOpaqueToken(bytes = 48) {
  return base64url(crypto.randomBytes(bytes));
}
function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest(); // Buffer for bytea
}
function parseDurationToSeconds(s) {
  if (!s) return 900;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const m = s.match(/^(\d+)\s*([smhd])$/i);
  if (!m) return 900;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return n * mult;
}

async function insertRefreshToken({ userId, refreshToken, ip, userAgent }) {
  const expiresSec = parseDurationToSeconds(REFRESH_TTL);
  const tokenHash = hashToken(refreshToken);
  const res = await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, now() + ($3 || ' seconds')::interval, $4, $5)
     RETURNING id, user_id, issued_at, expires_at`,
    [userId, tokenHash, expiresSec, ip || null, userAgent || null]
  );
  return res.rows[0];
}

async function revokeRefreshByHash(token) {
  const tokenHash = hashToken(token);
  await db.query(
    `UPDATE refresh_tokens
        SET revoked_at = now(), revoke_reason = 'logout'
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
}

async function revokeAllForUser(userId, reason = 'logout_all') {
  await db.query(`SELECT revoke_all_refresh_tokens($1, $2)`, [userId, reason]);
}

async function findActiveRefreshByToken(token) {
  const tokenHash = hashToken(token);
  const res = await db.query(
    `SELECT *
       FROM refresh_tokens
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND now() < expires_at
      LIMIT 1`,
    [tokenHash]
  );
  return res.rows[0] || null;
}

// Atomic rotation in one statement (no explicit transaction)
async function rotateRefresh(oldRow, userId, meta) {
  const newRefresh = generateOpaqueToken(48);
  const newHash = hashToken(newRefresh);
  const expiresSec = parseDurationToSeconds(REFRESH_TTL);

  const res = await db.query(
    `WITH updated AS (
       UPDATE refresh_tokens
          SET revoked_at = now(), revoke_reason = 'rotated'
        WHERE id = $1 AND revoked_at IS NULL
        RETURNING id
     ), inserted AS (
       INSERT INTO refresh_tokens (user_id, token_hash, expires_at, rotated_from, ip, user_agent)
       VALUES ($2, $3, now() + ($4 || ' seconds')::interval, $1, $5, $6)
       RETURNING id, user_id, issued_at, expires_at
     )
     SELECT * FROM inserted`,
    [oldRow.id, userId, newHash, expiresSec, meta?.ip || null, meta?.ua || null]
  );

  return { record: res.rows[0], refreshToken: newRefresh };
}

function issueAccessToken(user) {
  const payload = { sub: String(user.id) };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TTL });
}

async function issuePair(user, meta) {
  const accessToken = issueAccessToken(user);
  const refreshToken = generateOpaqueToken(48);
  const rec = await insertRefreshToken({
    userId: user.id,
    refreshToken,
    ip: meta?.ip,
    userAgent: meta?.ua
  });
  return { accessToken, refreshToken, refreshId: rec.id, refreshExpiresAt: rec.expires_at };
}

module.exports = {
  issuePair,
  issueAccessToken,
  findActiveRefreshByToken,
  rotateRefresh,
  revokeRefreshByHash,
  revokeAllForUser,
  parseDurationToSeconds
};
