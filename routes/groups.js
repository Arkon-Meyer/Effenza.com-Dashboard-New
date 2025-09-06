const express = require('express');
const router = express.Router();
const db = require('../database');
const { isDashboardAdmin, canManageGroup } = require('../utils/acl');
const { audit } = require('../utils/audit');

const toInt = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};
const pickLimit = (v, dflt = 50, max = 200) => {
  const n = Number(v);
  if (!Number.isInteger(n)) return dflt;
  return Math.min(Math.max(n, 1), max);
};

// GET /groups
router.get('/', async (req, res) => {
  try {
    const limit = pickLimit(req.query.limit);
    const offset = Math.max(toInt(req.query.offset) || 0, 0);
    const q = (req.query.q || '').toString().trim();

    let rows;
    if (q) {
      rows = await db.many(
        `SELECT id, name
           FROM groups
          WHERE name ILIKE $1
          ORDER BY id
          LIMIT $2 OFFSET $3`,
        [`%${q}%`, limit, offset]
      );
    } else {
      rows = await db.many(
        `SELECT id, name FROM groups ORDER BY id LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
    }
    res.json({ items: rows, limit, offset, q: q || undefined });
  } catch (e) {
    console.error('[groups:list]', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /groups { name }
router.post('/', async (req, res) => {
  if (!req.actor || !isDashboardAdmin(req.actor.id)) {
    return res.status(403).json({ error: 'dashboard-admin required' });
  }
  const name = (req.body?.name || '').toString().trim();
  if (!name) return res.status(400).json({ error: 'name required' });

  try {
    const ins = await db.one(
      `INSERT INTO groups(name) VALUES ($1) RETURNING id, name`,
      [name]
    );
    await audit(req, {
      action: 'create',
      resource: 'groups',
      resource_id: ins.id,
      details: { name: ins.name },
    });
    return res.status(201).set('Location', `/groups/${ins.id}`).json(ins);
  } catch (e) {
    const msg = String(e?.message || '');
    if (/unique/i.test(msg)) {
      return res.status(409).json({ error: 'Group name must be unique' });
    }
    console.error('[groups:create] error:', msg);
    return res.status(500).json({ error: 'Internal error' });
  }
});
module.exports = router;
