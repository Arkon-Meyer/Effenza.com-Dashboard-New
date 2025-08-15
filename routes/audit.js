// routes/audit.js
const express = require('express');
const router = express.Router();
const db = require('../database');
const { can } = require('../utils/authz');

// helpers
function asInt(v, def, { min = 1, max = 1000 } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

router.get('/', (req, res) => {
  res.type('application/json');

  const mode = String(req.query.mode || 'aggregate');
  const orgUnitId = req.query.org_unit_id ? Number(req.query.org_unit_id) : null;

  // ----- Aggregate (counts only, no PII) -----
  if (mode === 'aggregate') {
    if (!can(req.actor, 'read', 'audit_agg', { orgUnitId })) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    try {
      // Basic example: last 7 days counts by action within scope (or all)
      const rows = db.prepare(`
        SELECT action, COUNT(*) as count
          FROM audit_log
         WHERE (? IS NULL OR org_unit_id = ?)
           AND created_at >= DATETIME('now', '-7 days')
         GROUP BY action
         ORDER BY count DESC
      `).all(orgUnitId, orgUnitId);

      return res.json({
        scope_org_unit_id: orgUnitId,
        window: 'last_7_days',
        totals: rows,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server error', detail: err.message });
    }
  }

  // ----- Detail (admin-only; optional PII) -----
  if (mode === 'detail') {
    const limit = asInt(req.query.limit, 50, { min: 1, max: 500 });
    const offset = asInt(req.query.offset, 0, { min: 0, max: 10_000 });
    const pii = String(req.query.pii || '').toLowerCase() === 'true';

    // Require full audit permission for details; admin should have read:audit_full
    if (!can(req.actor, 'read', 'audit_full', { orgUnitId })) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // If pii=true, still enforce the same permission (kept separate in case you later split perms)
    const selectCols = pii
      ? `id, actor_id, action, resource, resource_id, org_unit_id, details, ip, user_agent, created_at`
      : `id, action, resource, resource_id, org_unit_id, created_at`;

    try {
      const rows = db.prepare(
        `
        SELECT ${selectCols}
          FROM audit_log
         WHERE (? IS NULL OR org_unit_id = ?)
         ORDER BY id DESC
         LIMIT ? OFFSET ?
        `
      ).all(orgUnitId, orgUnitId, limit, offset);

      return res.json({
        scope_org_unit_id: orgUnitId,
        limit,
        offset,
        pii,
        items: rows,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server error', detail: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid mode', hint: "Use mode=aggregate or mode=detail" });
});

module.exports = router;
