const express = require('express');
const db = require('../database');
const { issuePair } = require('../utils/tokens');
const { verifyPassword } = require('../utils/passwords');
const { appendAuditEvent } = require('../utils/audit');

const router = express.Router();

function setRefreshCookie(res, token) {
  const secure = String(process.env.COOKIE_SECURE || 'false') === 'true';
  const domain = process.env.COOKIE_DOMAIN || undefined;
  res.cookie('rt', token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    domain
  });
}

async function findUserByEmail(email) {
  const r = await db.query(
    'SELECT id, email, password_hash FROM users WHERE email = $1 LIMIT 1',
    [email]
  );
  return r.rows[0] || null;
}

/**
 * POST /login
 * Body: { email, password }
 * - Verifies Argon2id password hash in users.password_hash
 * - Writes audit_log events (success and failure)
 */
router.post('/', async (req, res) => {
  const { email, password } = req.body || {};
  const ip = req.ip;
  const ua = req.get('user-agent') || null;

  try {
    if (!email || !password) {
      await appendAuditEvent({
        userId: null,
        sessionId: null,
        eventType: 'auth.login.missing_fields',
        ip,
        userAgent: ua,
        payload: { email: email || null }
      });
      return res.status(400).json({ error: 'email_and_password_required' });
    }

    const user = await findUserByEmail(email);

    if (!user) {
      await appendAuditEvent({
        userId: null,
        sessionId: null,
        eventType: 'auth.login.unknown_email',
        ip,
        userAgent: ua,
        payload: { email }
      });
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    if (!user.password_hash) {
      await appendAuditEvent({
        userId: user.id,
        sessionId: null,
        eventType: 'auth.login.no_password',
        ip,
        userAgent: ua,
        payload: { email }
      });
      return res.status(401).json({ error: 'user_has_no_password' });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      await appendAuditEvent({
        userId: user.id,
        sessionId: null,
        eventType: 'auth.login.bad_password',
        ip,
        userAgent: ua,
        payload: { email }
      });
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const meta = { ip, ua };
    const pair = await issuePair({ id: user.id }, meta);

    await appendAuditEvent({
      userId: user.id,
      sessionId: null,
      eventType: 'auth.login.success',
      ip,
      userAgent: ua,
      payload: { email }
    });

    setRefreshCookie(res, pair.refreshToken);

    return res.status(200).json({
      token: pair.accessToken,
      access_token: pair.accessToken,
      token_type: 'Bearer',
      refresh_token: pair.refreshToken,
      refresh_expires_at: pair.refreshExpiresAt
    });
  } catch (e) {
    console.error('login error', e);
    await appendAuditEvent({
      userId: null,
      sessionId: null,
      eventType: 'auth.login.error',
      ip,
      userAgent: ua,
      payload: { email, message: e.message }
    });
    return res.status(500).json({ error: 'login_failed' });
  }
});

module.exports = router;
