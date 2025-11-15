// routes/user_audit_export.js
//
// GDPR / CPRA audit export for a single user.
// Endpoint: GET /users/:id/audit
//
// - Uses req.actor (via legacy actor middleware / X-User-Id)
// - Allows:
//     * Admins with `audit_full`
//     * The user exporting their own data (self-export)
// - Supports JSON (default) and CSV (?format=csv)
// - IP + User-Agent are ALWAYS pseudonymized in this export;
//   full raw values remain available internally (DB / admin-only tools).

const express = require('express');
const router = express.Router();
const db = require('../database');
const { can } = require('../utils/authz');

function parseDateParam(value, defDate) {
  if (!value) return defDate;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? defDate : d;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Pseudonymize IP (IPv4 → /24, IPv6 → /64)
function maskIp(ip) {
  if (!ip) return null;
  if (ip.includes(':')) {
    // IPv6: keep first 4 hextets
    return ip.split(':').slice(0, 4).join(':') + '::/64';
  }
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

// Shorten UA to first token, max 40 chars
function maskUA(ua) {
  if (!ua) return null;
  const first = ua.split(' ')[0];
  return first.length > 40 ? first.slice(0, 40) : first;
}

router.get('/:id/audit', async (req, res) => {
  try {
    const actor = req.actor;
    if (!actor) {
      return res.status(401).json({ error: 'Missing or invalid X-User-Id' });
    }

    const targetUserId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(targetUserId)) {
      return res.status(400).json({ error: 'invalid_user_id' });
    }

    const format = (req.query.format || 'json').toString().toLowerCase();

    // Default window: last 365 days
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    const fromDate = parseDateParam(req.query.from, defaultFrom);
    const toDate   = parseDateParam(req.query.to,   now);

    // Swap if user accidentally flipped them
    let from = fromDate;
    let to   = toDate;
    if (from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }

    // Normalize actor.id so "15" and 15 are treated as same user
    const actorIdNum = Number.parseInt(actor.id, 10);
    const isSelf = Number.isFinite(actorIdNum) && actorIdNum === targetUserId;

    // Admin flag via RBAC
    const isAdmin = can(actor, 'read', 'audit_full', { userId: targetUserId });

    // Only allow admin or self
    if (!isAdmin && !isSelf) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Fetch all audit events for the user in the window
    const q = await db.query(
      `
        SELECT
          id,
          event_ts,
          user_id,
          session_id,
          event_type,
          ip,
          user_agent,
          payload
        FROM audit_log
        WHERE user_id = $1
          AND event_ts BETWEEN $2 AND $3
        ORDER BY event_ts ASC, id ASC
      `,
      [targetUserId, from.toISOString(), to.toISOString()]
    );

    const rawEvents = q.rows || [];

    // Always pseudonymize IP + UA in this export
    const events = rawEvents.map(r => {
      const event_ts = r.event_ts instanceof Date
        ? r.event_ts.toISOString()
        : String(r.event_ts);

      return {
        id: String(r.id),
        event_ts,
        user_id: r.user_id,
        session_id: r.session_id,
        event_type: r.event_type,
        ip: maskIp(r.ip),
        user_agent: maskUA(r.user_agent),
        payload: r.payload || {}
      };
    });

    if (format === 'csv') {
      const header = [
        'id',
        'event_ts',
        'user_id',
        'session_id',
        'event_type',
        'ip',
        'user_agent',
        'payload_json'
      ];

      const lines = [];
      lines.push(header.map(csvEscape).join(','));

      for (const ev of events) {
        const row = [
          ev.id,
          ev.event_ts,
          ev.user_id,
          ev.session_id,
          ev.event_type,
          ev.ip,
          ev.user_agent,
          JSON.stringify(ev.payload)
        ];
        lines.push(row.map(csvEscape).join(','));
      }

      const csv = lines.join('\n');

      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set(
        'Content-Disposition',
        `attachment; filename="user-${targetUserId}-audit.csv"`
      );

      return res.status(200).send(csv);
    }

    // Default: JSON
    return res.json({
      user_id: targetUserId,
      from: from.toISOString(),
      to: to.toISOString(),
      count: events.length,
      events
    });
  } catch (err) {
    console.error('[user_audit_export] error:', err);
    return res.status(500).json({ error: 'audit_export_failed' });
  }
});

module.exports = router;