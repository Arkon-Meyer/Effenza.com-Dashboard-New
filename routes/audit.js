// routes/audit.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { can } = require('../utils/authz');

/* ----------------------------- rate limiting ----------------------------- */
// very small in-memory token bucket per IP
const BUCKET_CAP = 30;            // max requests
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

/* --------------------------------- utils --------------------------------- */

function parseBool(v) {
  return v === true || v === 'true' || v === '1';
}

function parseDate(value, def) {
  if (!value) return def ?? null;
  const d = new Date(value);
  return isNaN(d) ? def ?? null : d.toISOString().slice(0, 19).replace('T', ' ');
}

// Mask IP lightly (still privacy-respecting for audits)
function maskIp(ip) {
  if (!ip) return null;
  if (ip.includes(':')) {
    // IPv6 → keep first 4 hextets, /64
    return ip.split(':').slice(0, 4).join(':') + '::/64';
  }
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

// User-Agent prefix only
function maskUA(ua) {
  if (!ua) return null;
  const first = ua.split(' ')[0];
  return first.length > 40 ? first.slice(0, 40) : first;
}

// Find all descendants (including self) for org scope filtering
function descendantsOrSelf(id) {
  if (id == null) return [null]; // special case (global/tenant-wide)
  const out = new Set([Number(id)]);
  const q = db.prepare('SELECT id FROM org_units WHERE parent_id = ? AND deleted_at IS NULL');
  const stack = [Number(id)];
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

/* --------------------------------- route --------------------------------- */

router.get('/', rateLimit, (req, res) => {
  const user = req.actor;
  if (!user) return res.status(401).json({ error: 'Missing or invalid X-User-Id' });

  const mode = (req.query.mode || 'aggregate').toString();  // 'aggregate' | 'detail'
  const wantPII = parseBool(req.query.pii);
  const reason = (req.query.reason || '').toString().slice(0, 200);

  // Optional filters (safe defaults)
  const action   = req.query.action ? String(req.query.action) : null;       // create|update|delete
  const resource = req.query.resource ? String(req.query.resource) : null;   // 'org_units'|'assignments'|...
  const limit    = Math.min(Number(req.query.limit ?? 50) || 50, 500);
  const offset   = Math.max(Number(req.query.offset ?? 0) || 0, 0);

  // Time window filters
  const now = new Date();
  const defFrom = new Date(now.getTime() - 7*24*60*60*1000); // last 7 days by default
  const from = parseDate(req.query.from, defFrom);
  const to   = parseDate(req.query.to,   now);

  // Scope: admin can read global or a specific subtree; region_manager gets aggregate on their subtree
  const scopeParam = req.query.org_unit_id != null ? Number(req.query.org_unit_id) : null;

  const isAdmin         = can(user, 'read', 'audit_full');
  const canAggregateAny = can(user, 'read', 'audit') || can(user, 'read', 'audit_agg');

  if (mode === 'detail') {
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

    // Admin detail: optional org subtree filter
    const scopeIds = scopeParam != null ? descendantsOrSelf(scopeParam) : null;

    const where = [];
    const params = [];

    where.push('created_at BETWEEN ? AND ?'); params.push(from, to);
    if (action)   { where.push('action = ?'); params.push(action); }
    if (resource) { where.push('resource = ?'); params.push(resource); }
    if (scopeIds) {
      where.push(`(org_unit_id IN (${scopeIds.map(()=>'?').join(',')}))`);
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

    // PII policy: default masked summary; pii=true exposes actor_id & details but still masks IP/UA
    const items = rows.map(r => {
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

    // If admin requested PII, log that access itself
    if (wantPII) {
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

  // AGGREGATE MODE
  if (!canAggregateAny) return res.status(403).json({ error: 'Forbidden' });

  // If admin and org_unit_id provided → filter subtree; otherwise:
  // If not admin (e.g., region_manager) → require they only see their assigned subtree.
  let scopeIds = null;
  if (isAdmin) {
    scopeIds = scopeParam != null ? descendantsOrSelf(scopeParam) : null; // admin can omit for global
  } else {
    // find one of the user's org assignments to scope under (simple: pick most recent non-null org_unit)
    const scopeRow = db.prepare(`
      SELECT a.org_unit_id
      FROM assignments a
      WHERE a.user_id = ? AND a.org_unit_id IS NOT NULL
      ORDER BY a.id DESC LIMIT 1
    `).get(user.id);
    scopeIds = scopeRow?.org_unit_id ? descendantsOrSelf(scopeRow.org_unit_id) : [];
    if (!scopeIds.length) return res.json({ scope_org_unit_id: null, window: 'last_7_days', totals: [] });
  }

  const where = [];
  const params = [];
  where.push('created_at BETWEEN ? AND ?'); params.push(from, to);
  if (action)   { where.push('action = ?'); params.push(action); }
  if (resource) { where.push('resource = ?'); params.push(resource); }
  if (scopeIds) {
    where.push(`(org_unit_id IN (${scopeIds.map(()=>'?').join(',')}))`);
    params.push(...scopeIds);
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
});

module.exports = router;
