// middleware/actor.js
'use strict';

const db = require('../database');

module.exports = async function actor(req, _res, next) {
  const raw = req.get('X-User-Id');
  if (!raw) return next();

  const id = Number(raw);
  if (!id) return next();

  try {
    const { rows } = await db.query(
      `SELECT id, name, email, org_id FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (rows.length) req.actor = rows[0];
  } catch (err) {
    console.error('[actor middleware] error:', err.message);
  }

  next();
};
