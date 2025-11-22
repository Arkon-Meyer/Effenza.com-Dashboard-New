'use strict';

const express = require('express');
const router = express.Router();

const argon2 = require('@node-rs/argon2');

const db = require('../database');
const {
  issueAccessToken,
  generateRefreshToken,
  storeRefreshToken,
  findActiveRefreshByToken,
  rotateRefresh,
  revokeRefreshByHash,
  revokeAllForUser
} = require('../utils/tokens');
const { appendAuditEvent } = require('../utils/audit');

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

async function findUserByEmail(email) {
  const { rows } = await db.query(
    `SELECT id, email, password_hash
       FROM users
      WHERE email = $1
      LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

function getRefreshFromReq(req) {
  // cookie first
  const fromCookie = req.cookies && req.cookies.rt;
  if (fromCookie) return fromCookie;

  // then Authorization: Refresh <token>
  const h = req.get('authorization') || '';
  const m = h.match(/^refresh\s+(.+)$/i);
  return m ? m[1] : null;
}

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

/* ------------------------------------------------------------------ */
/* POST /auth/login                                                   */
/* ------------------------------------------------------------------ */

router.post('/login', async (req, res) => {
  const ip = req.ip;
  const ua = req.get('user-agent') || null;

  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      await appendAuditEvent({
        userId: null,
        sessionId: null,
        eventType: 'auth.login.missing_fields',
        ip,
        userAgent: ua,
        payload: { email: email || null }
      });
      return res.status(400).json({ error: 'missing_email_or_password' });
    }

    const user = await findUserByEmail(email);

    if (!user) {
      // user not found – don't leak which part failed
      await appendAuditEvent({
        userId: null,
        sessionId: null,
        eventType: 'auth.login.bad_credentials',
        ip,
        userAgent: ua,
        payload: { email }
      });
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const ok = await argon2.verify(user.password_hash, password);
    if (!ok) {
      await appendAuditEvent({
        userId: user.id,
        sessionId: null,
        eventType: 'auth.login.bad_credentials',
        ip,
        userAgent: ua,
        payload: { email }
      });
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    // Successful login
    const accessToken = issueAccessToken({ id: user.id });

    const refreshToken = generateRefreshToken();
    const meta = { ip, ua };
    const record = await storeRefreshToken(user.id, refreshToken, meta);

    setRefreshCookie(res, refreshToken);

    await appendAuditEvent({
      userId: user.id,
      sessionId: null,
      eventType: 'auth.login.success',
      ip,
      userAgent: ua,
      payload: {
        email,
        refresh_id: record?.id || null
      }
    });

    return res.status(200).json({
      access_token: accessToken,
      token_type: 'Bearer',
      refresh_token: refreshToken,
      refresh_expires_at: record?.expires_at || null
    });
  } catch (err) {
    console.error('login error', err);
    await appendAuditEvent({
      userId: null,
      sessionId: null,
      eventType: 'auth.login.error',
      ip,
      userAgent: ua,
      payload: { message: err.message }
    });
    return res.status(500).json({ error: 'login_failed' });
  }
});

/* ------------------------------------------------------------------ */
/* POST /auth/refresh                                                 */
/* ------------------------------------------------------------------ */

router.post('/refresh', async (req, res) => {
  const ip = req.ip;
  const ua = req.get('user-agent') || null;

  try {
    const presented = getRefreshFromReq(req);
    if (!presented) {
      await appendAuditEvent({
        userId: null,
        sessionId: null,
        eventType: 'auth.refresh.missing_refresh',
        ip,
        userAgent: ua,
        payload: {}
      });
      return res.status(401).json({ error: 'missing_refresh_token' });
    }

    const row = await findActiveRefreshByToken(presented);
    if (!row) {
      await appendAuditEvent({
        userId: null,
        sessionId: null,
        eventType: 'auth.refresh.invalid_or_expired',
        ip,
        userAgent: ua,
        payload: {}
      });
      return res.status(401).json({ error: 'invalid_or_expired_refresh_token' });
    }

    const { record: newRow, refreshToken: newRt } = await rotateRefresh(row, row.user_id, { ip, ua });

    const accessToken = issueAccessToken({ id: row.user_id });
    setRefreshCookie(res, newRt);

    await appendAuditEvent({
      userId: row.user_id,
      sessionId: null,
      eventType: 'auth.refresh.success',
      ip,
      userAgent: ua,
      payload: {
        old_refresh_id: row.id,
        new_refresh_id: newRow.id
      }
    });

    return res.status(200).json({
      access_token: accessToken,
      token_type: 'Bearer',
      refresh_token: newRt,
      refresh_expires_at: newRow.expires_at
    });
  } catch (err) {
    console.error('refresh error', err);
    await appendAuditEvent({
      userId: null,
      sessionId: null,
      eventType: 'auth.refresh.error',
      ip,
      userAgent: ua,
      payload: { message: err.message }
    });
    return res.status(500).json({ error: 'refresh_failed' });
  }
});

/* ------------------------------------------------------------------ */
/* POST /auth/logout                                                  */
/* ------------------------------------------------------------------ */

router.post('/logout', async (req, res) => {
  const ip = req.ip;
  const ua = req.get('user-agent') || null;

  try {
    const presented = getRefreshFromReq(req);
    let userId = null;

    if (presented) {
      const row = await findActiveRefreshByToken(presented).catch(() => null);
      if (row) {
        userId = row.user_id;
      }

      await revokeRefreshByHash(presented);
      res.clearCookie('rt', { path: '/' });
    }

    await appendAuditEvent({
      userId,
      sessionId: null,
      eventType: 'auth.logout.single',
      ip,
      userAgent: ua,
      payload: { had_refresh: Boolean(presented) }
    });

    return res.status(204).send();
  } catch (err) {
    console.error('logout error', err);
    await appendAuditEvent({
      userId: null,
      sessionId: null,
      eventType: 'auth.logout.error',
      ip,
      userAgent: ua,
      payload: { message: err.message }
    });
    return res.status(500).json({ error: 'logout_failed' });
  }
});

/* ------------------------------------------------------------------ */
/* POST /auth/logout/all                                              */
/* ------------------------------------------------------------------ */

router.post('/logout/all', async (req, res) => {
  const ip = req.ip;
  const ua = req.get('user-agent') || null;

  try {
    const actorId = req.user?.id || null;
    if (!actorId) {
      await appendAuditEvent({
        userId: null,
        sessionId: null,
        eventType: 'auth.logout_all.unauthenticated',
        ip,
        userAgent: ua,
        payload: {}
      });
      return res.status(401).json({ error: 'auth_required' });
    }

    await revokeAllForUser(actorId);
    res.clearCookie('rt', { path: '/' });

    await appendAuditEvent({
      userId: actorId,
      sessionId: null,
      eventType: 'auth.logout_all.success',
      ip,
      userAgent: ua,
      payload: {}
    });

    return res.status(204).send();
  } catch (err) {
    console.error('logout_all error', err);
    await appendAuditEvent({
      userId: null,
      sessionId: null,
      eventType: 'auth.logout_all.error',
      ip,
      userAgent: ua,
      payload: { message: err.message }
    });
    return res.status(500).json({ error: 'logout_all_failed' });
  }
});

module.exports = router;
