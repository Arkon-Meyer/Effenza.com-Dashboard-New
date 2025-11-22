// routes/groups.js
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../database');
const { can } = require('../utils/acl');

router.get('/', async (req, res) => {
  try {
    const userId = req.actor?.id || null;
    const allowed = await can(userId, 'read', 'users');
    if (!allowed) return res.status(403).json({ error: 'forbidden' });

    const { rows } = await db.query(`SELECT id, name, org_id FROM groups ORDER BY id ASC`);
    return res.json(rows);
  } catch (err) {
    console.error('[groups] GET / error', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
