// routes/audit.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { can } = require('../utils/authz');

/* ------------------------ binding/parse helper functions ------------------------ */

const toSqlDateTime = (d) => {
  const dt = (d instanceof Date) ? d : new Date(d);
  // "YYYY-MM-DD HH:MM:SS"
  return dt.toISOString().slice(0, 19).replace('T', ' ');
};
const toInt = (v) => (v == null ? null : Number.parseInt(v, 10));
const nonEmpty = (xs) => Array.isArray(xs) && xs.length > 0;

function parseBool(v) {
  return v === true || v === 'true' || v === '1';
}
function parseDate(value, def) {
  if (!value) return def ?? null;
  const d = new Date(value);
  return isNaN(d) ? (def ?? null) : toSqlDateTime(d);
}

// lightweight privacy-respecting masking
function maskIp(ip) {
  if (!ip) return null;
  if (ip.includes(':')) return ip.split(':').slice(0, 4).join(':') + '::/64'; // IPv6 /64
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`; // IPv4 /24
}
function maskUA(ua) {
  if (!ua) return null;
  const first = ua.split(' ')[0];
  return first.length > 40 ? first.slice(0, 40) : first;
}

// Find all descendants (including self) for org scope filtering
function descendantsOrSelf(id) {
  if (id == null) return [null]; // special case (tenant/global)
  const root = Number(id);
  const out = new Set([root]);
  const q = db.prepare('SELECT id FROM org_units WHERE parent_id = ? AND deleted_at IS NULL');
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    for (const row of q.all(cur)) {
      if (!out.has(row.id)) {
        out.add(row.id);
        stack.push(row.id);
      }
    }
  }
  return [...out];
}

/* -------------------------------- rate limiting ------------------------------- */
// very small in-memory token bucket per IP
const BUCKET_CAP = 30;            // max requests in burst
const REFILL_EVERY_MS = 2000;     // 1 token / 2s
const buckets = new Map();        // ip -> { tokens, last }

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const b = buckets.get(ip) || { tokens: BUCKET_CAP, last: now };
  const elapsed = now - b.last;
  const refill = Math.floor(elapsed / REFILL_EVERY_MS);
  if (refill > 0) {
    b.tokens = Math.min(BUCKET_CAP, b.tokens + refill);
    b.last = now;
  }
  if (b.tokens <= 0) {
    res.set('Retry-After', Math.ceil(REFILL_EVERY_MS / 1000));
    return res.status(429).json({ error: 'Too many requests' });
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  next();
}

/* ----------------------------------- route ----------------------------------- */

router.get('/', rateLimit, (req, res) => {
  try {
    const user = req.actor;
    if (!user) return res.status(401).json({ error: 'Missing or invalid X-User-Id' });

    const mode = String(req.query.mode || 'aggregate');  // 'aggregate' | 'detail'
    const wantPII = parseBool(req.query.pii);
    const reason = (req.query.reason || '').toString().slice(0, 200);

    // Optional filters (normalized)
    const action   = req.query.action ? String(req.query.action) : null;       // 'create'|'update'|'delete'
    const resource = req.query.resource ? String(req.query.resource) : null;   // e.g. 'org_units'
    const limit    = Math.min(Number(req.query.limit ?? 50) || 50, 500);
    const offset   = Math.max(Number(req.query.offset ?? 0) || 0, 0);

    // Time window (default last 7 days) – ensure strings are bound to SQLite
    const nowStr   = toSqlDateTime(new Date());
    const weekAgo  = toSqlDateTime(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const from     = parseDate(req.query.from, weekAgo);
    const to       = parseDate(req.query.to,   nowStr);

    // Scope
    const scopeParam = (req.query.org_unit_id != null) ? toInt(req.query.org_unit_id) : null;

    const isAdmin         = can(user, 'read', 'audit_full');
    const canAggregateAny = isAdmin || can(user, 'read', 'audit') || can(user, 'read', 'audit_agg');

    /* ------------------------------ DETAIL MODE ------------------------------ */
    if (mode === 'detail') {
      if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

      const scopeIds = (scopeParam != null) ? descendantsOrSelf(scopeParam) : null;

      const where = [];
      const params = [];

      // time window
      where.push('created_at BETWEEN ? AND ?');
      params.push(from, to); // strings

      if (action)   { where.push('action = ?');   params.push(String(action)); }
      if (resource) { where.push('resource = ?'); params.push(String(resource)); }

      if (scopeIds) {
        const ids = scopeIds.map(toInt).filter((n) => Number.isInteger(n));
        if (nonEmpty(ids)) {
          where.push(`org_unit_id IN (${ids.map(() => '?').join(',')})`);
          params.push(...ids);
        } else if (ids.length === 0) {
          // explicitly no scope → no rows
          where.push('1=0');
        }
      }

      const sql = `
        SELECT id, actor_id, action, resource, resource_id, org_unit_id,
               details, ip, user_agent, created_at
        FROM audit_log
        WHERE ${where.length ? where.join(' AND ') : '1=1'}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `;
      params.push(limit, offset);

      const rows = db.prepare(sql).all(...params);

      const items = rows.map((r) => {
        if (!wantPII) {
          return {
            id: r.id,
            action: r.action,
            resource: r.resource,
            resource_id: r.resource_id,
            org_unit_id: r.org_unit_id,
            created_at: r.created_at,
          };
        }
        return {
          id: r.id,
          actor_id: r.actor_id,
          action: r.action,
          resource: r.resource,
          resource_id: r.resource_id,
          org_unit_id: r.org_unit_id,
          details: r.details,
          ip: maskIp(r.ip),
          user_agent: maskUA(r.user_agent),
          created_at: r.created_at,
        };
      });

      if (wantPII) {
        // Log the sensitive read itself
        db.prepare(`
          INSERT INTO audit_log (actor_id, action, resource, resource_id, org_unit_id, details, ip, user_agent)
          VALUES (?, 'read', 'audit_full', NULL, ?, json(?), ?, ?)
        `).run(
          user.id,
          scopeParam ?? null,
          JSON.stringify({ reason: reason || 'audit detail view' }),
          (req.ip || '').toString(),
          (req.headers['user-agent'] || '').toString()
        );
      }

      return res.json({
        scope_org_unit_id: scopeParam ?? null,
        limit,
        offset,
        pii: wantPII,
        from,
        to,
        items,
      });
    }

    /* ---------------------------- AGGREGATE MODE ----------------------------- */
    if (!canAggregateAny) return res.status(403).json({ error: 'Forbidden' });

    let scopeIds = null;
    if (isAdmin) {
      scopeIds = (scopeParam != null) ? descendantsOrSelf(scopeParam) : null; // admin may omit
    } else {
      // non-admins must be scoped to their assigned subtree
      const scopeRow = db.prepare(`
        SELECT a.org_unit_id
        FROM assignments a
        WHERE a.user_id = ? AND a.org_unit_id IS NOT NULL
        ORDER BY a.id DESC LIMIT 1
      `).get(user.id);
      scopeIds = scopeRow?.org_unit_id ? descendantsOrSelf(scopeRow.org_unit_id) : [];
      if (!nonEmpty(scopeIds)) {
        return res.json({ scope_org_unit_id: null, window: 'last_7_days', from, to, totals: [] });
      }
    }

    const where = [];
    const params = [];

    where.push('created_at BETWEEN ? AND ?'); params.push(from, to);
    if (action)   { where.push('action = ?');   params.push(String(action)); }
    if (resource) { where.push('resource = ?'); params.push(String(resource)); }

    if (scopeIds) {
      const ids = scopeIds.map(toInt).filter((n) => Number.isInteger(n));
      if (nonEmpty(ids)) {
        where.push(`org_unit_id IN (${ids.map(() => '?').join(',')})`);
        params.push(...ids);
      } else if (ids.length === 0) {
        where.push('1=0');
      }
    }

    const sqlAgg = `
      SELECT action, COUNT(*) AS count
      FROM audit_log
      WHERE ${where.length ? where.join(' AND ') : '1=1'}
      GROUP BY action
      ORDER BY action
    `;
    const rows = db.prepare(sqlAgg).all(...params);

    return res.json({
      scope_org_unit_id: isAdmin ? (scopeParam ?? null) : (Array.isArray(scopeIds) ? scopeIds[0] ?? null : null),
      window: 'last_7_days',
      from,
      to,
      filters: { action: action || null, resource: resource || null },
      totals: rows,
    });
  } catch (err) {
    console.error('[audit] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
