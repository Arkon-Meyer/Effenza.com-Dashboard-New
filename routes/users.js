// routes/users.js
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../database');
const { can } = require('../utils/acl');

router.get('/', async (req, res) => {
  try {
    const actorId = req.actor?.id || null;
    const allowed = await can(actorId, 'manage', 'users');
    if (!allowed) return res.status(403).json({ error: 'forbidden' });

    const { rows } = await db.query(`SELECT id, name, email, org_id FROM users ORDER BY id ASC`);
    return res.json(rows);
  } catch (err) {
    console.error('[users] error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
