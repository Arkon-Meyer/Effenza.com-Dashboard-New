// middleware/actor.js
const db = require('../database');

module.exports = function actor() {
  return (req, _res, next) => {
    const raw = req.header('X-User-Id');

    if (!raw) {
      console.warn('[actor] Missing X-User-Id header');
      return next();
    }

    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      console.warn(`[actor] Invalid X-User-Id value: "${raw}"`);
      return next();
    }

    try {
      const user = db
        .prepare('SELECT id, name, email FROM users WHERE id = ?')
        .get(id);

      if (user) {
        req.actor = user;                 // attach current user
      } else {
        console.warn(`[actor] No user found for id=${id}`);
      }
    } catch (err) {
      console.error(`[actor] DB lookup failed for id=${id}: ${err.message}`);
    }

    next();
  };
}
