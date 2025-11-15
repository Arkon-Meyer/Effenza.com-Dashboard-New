const express = require('express');
const router = express.Router();
const {
  issueAccessToken,
  findActiveRefreshByToken,
  rotateRefresh,
  revokeRefreshByHash,
  revokeAllForUser
} = require('../utils/tokens');
const { appendAuditEvent } = require('../utils/audit');

function getRefreshFromReq(req) {
  const fromCookie = req.cookies && req.cookies.rt;
  if (fromCookie) return fromCookie;
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

    const user = { id: row.user_id };
    const meta = { ip, ua };
    const { record: newRow, refreshToken: newRt } = await rotateRefresh(row, row.user_id, meta);

    const accessToken = issueAccessToken(user);
    setRefreshCookie(res, newRt);

    await appendAuditEvent({
      userId: row.user_id,
      sessionId: null,
      eventType: 'auth.refresh.success',
      ip,
      userAgent: ua,
      payload: { old_refresh_id: row.id, new_refresh_id: newRow.id }
    });

    return res.status(200).json({
      access_token: accessToken,
      token_type: 'Bearer',
      refresh_token: newRt,
      refresh_expires_at: newRow.expires_at
    });
  } catch (e) {
    console.error('refresh error', e);
    await appendAuditEvent({
      userId: null,
      sessionId: null,
      eventType: 'auth.refresh.error',
      ip,
      userAgent: ua,
      payload: { message: e.message }
    });
    return res.status(500).json({ error: 'refresh_failed' });
  }
});

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
  } catch (e) {
    console.error('logout error', e);
    await appendAuditEvent({
      userId: null,
      sessionId: null,
      eventType: 'auth.logout.error',
      ip,
      userAgent: ua,
      payload: { message: e.message }
    });
    return res.status(500).json({ error: 'logout_failed' });
  }
});

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
  } catch (e) {
    console.error('logout_all error', e);
    await appendAuditEvent({
      userId: null,
      sessionId: null,
      eventType: 'auth.logout_all.error',
      ip,
      userAgent: ua,
      payload: { message: e.message }
    });
    return res.status(500).json({ error: 'logout_all_failed' });
  }
});

module.exports = router;
