// routes/audit.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { can } = require('../utils/authz');

/* -------------------------------- helpers -------------------------------- */

const toSqlDateTime = (d) => {
  const dt = (d instanceof Date) ? d : new Date(d);
  return dt.toISOString().slice(0, 19).replace('T', ' '); // "YYYY-MM-DD HH:MM:SS"
};
const toInt = (v) => (v == null ? null : Number.parseInt(v, 10));
const nonEmpty = (xs) => Array.isArray(xs) && xs.length > 0;

function parseBool(v) {
  return v === true || v === 'true' || v === '1';
}
function parseDate(value, def) {
  if (!value) return def ?? null;
  const d = new Date(value);
  return isNaN(d) ? def ?? null : toSqlDateTime(d);
}
function maskIp(ip) {
  if (!ip) return null;
  if (ip.includes(':')) return ip.split(':').slice(0, 4).join(':') + '::/64';
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}
function maskUA(ua) {
  if (!ua) return null;
  const first = ua.split(' ')[0];
  return first.length > 40 ? first.slice(0, 40) : first;
}
function descendantsOrSelf(id) {
  if (id == null) return [null];
  const root = Number(id);
  const out = new Set([root]);
  const q = db.prepare('SELECT id FROM org_units WHERE parent_id = ? AND deleted_at IS NULL');
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    for (const row of q.all(cur)) {
      if (!out.has(row.id)) { out.add(row.id); stack.push(row.id); }
    }
  }
  return [...out];
}

/* ----------------------------- rate limiting ----------------------------- */

const BUCKET_CAP = 30;
const REFILL_EVERY_MS = 2000;
const buckets = new Map();

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

/* --------------------------------- route --------------------------------- */

router.get('/', rateLimit, (req, res) => {
  try {
    const user = req.actor;
    if (!user) return res.status(401).json({ error: 'Missing or invalid X-User-Id' });

    const mode = (req.query.mode || 'aggregate').toString();
    const wantPII = parseBool(req.query.pii);
    const reason = (req.query.reason || '').toString().slice(0, 200);

    const action   = req.query.action ? String(req.query.action) : null;
    const resource = req.query.resource ? String(req.query.resource) : null;
    const limit    = Math.min(Number(req.query.limit ?? 50) || 50, 500);
    const offset   = Math.max(Number(req.query.offset ?? 0) || 0, 0);

    const now = new Date();
    const defFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Parse dates -> TEXT "YYYY-MM-DD HH:MM:SS"
    let from = parseDate(req.query.from, toSqlDateTime(defFrom));
    let to   = parseDate(req.query.to,   toSqlDateTime(now));
    // Auto-correct flipped windows
    if (from && to && from > to) { const t = from; from = to; to = t; }

    const scopeParam = (req.query.org_unit_id != null) ? toInt(req.query.org_unit_id) : null;

    // Determine admin + a reasonable org hint for RBAC checks
    const isAdmin = can(user, 'read', 'audit_full', { orgUnitId: scopeParam ?? null });

    // For non-admins, find one org assignment as a default scope anchor
    let userAssignedOrg = null;
    if (!isAdmin) {
      const r = db.prepare(`
        SELECT org_unit_id
        FROM assignments
        WHERE user_id = ? AND org_unit_id IS NOT NULL
        ORDER BY id DESC LIMIT 1
      `).get(user.id);
      userAssignedOrg = r?.org_unit_id ?? null;
    }

    // Use explicit scope if provided; otherwise fall back to user’s assigned org
    const orgHint = scopeParam ?? userAssignedOrg ?? null;

    const canAggregateAny =
      isAdmin ||
      can(user, 'read', 'audit',      { orgUnitId: orgHint }) ||
      can(user, 'read', 'audit_agg',  { orgUnitId: orgHint });

    if (mode !== 'detail' && !canAggregateAny) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    /* ------------------------------- detail ------------------------------- */
    if (mode === 'detail') {
      if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

      const scopeIds = scopeParam != null ? descendantsOrSelf(scopeParam) : null;
      const where = [];
      const params = [];

      // Coerce to datetime() on both sides to avoid TEXT comparison pitfalls
      where.push('created_at BETWEEN ?::timestamp AND ?::timestamp'); params.push(from, to);
      if (action)   { where.push('action = ?');   params.push(action); }
      if (resource) { where.push('resource = ?'); params.push(resource); }
      if (Array.isArray(scopeIds) && scopeIds.length > 0) {
        where.push(`org_unit_id IN (${scopeIds.map(()=>'?').join(',')})`);
        params.push(...scopeIds);
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

      const items = (Array.isArray(rows)?rows:(rows&&rows.rows)||[]).map(r => {
        if (!wantPII) {
          return {
            id: r.id, action: r.action, resource: r.resource,
            resource_id: r.resource_id, org_unit_id: r.org_unit_id,
            created_at: r.created_at,
          };
        }
        return {
          id: r.id, actor_id: r.actor_id, action: r.action, resource: r.resource,
          resource_id: r.resource_id, org_unit_id: r.org_unit_id,
          details: r.details, ip: maskIp(r.ip), user_agent: maskUA(r.user_agent),
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
        limit, offset, pii: wantPII,
        from, to,
        items
      });
    }

    /* ------------------------------ aggregate ----------------------------- */

    let scopeIds = null;
    if (isAdmin) {
      scopeIds = (scopeParam != null) ? descendantsOrSelf(scopeParam) : null;
    } else {
      scopeIds = userAssignedOrg ? descendantsOrSelf(userAssignedOrg) : [];
      if (!nonEmpty(scopeIds)) {
        return res.json({ scope_org_unit_id: null, window: 'last_7_days', from, to, totals: [] });
      }
    }

    const where = [];
    const params = [];

    // Coerce to datetime() on both sides
    where.push('created_at BETWEEN ?::timestamp AND ?::timestamp'); params.push(from, to);
    if (action)   { where.push('action = ?');   params.push(action); }
    if (resource) { where.push('resource = ?'); params.push(resource); }

    if (Array.isArray(scopeIds) && scopeIds.length > 0) {
      const validIds = scopeIds.filter(id => id != null);
      if (validIds.length > 0) {
        where.push(`(org_unit_id IN (${validIds.map(()=>'?').join(',')}))`);
        params.push(...validIds);
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
      scope_org_unit_id: isAdmin ? (scopeParam ?? null) : (scopeIds?.[0] ?? null),
      window: 'last_7_days',
      from, to,
      filters: { action: action || null, resource: resource || null },
      totals: rows
    });
  } catch (err) {
    console.error('[audit] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
