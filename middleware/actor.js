// middleware/actor.js
const db = require('../database');

// Color helpers
const green = (msg) => `\x1b[32m${msg}\x1b[0m`;
const yellow = (msg) => `\x1b[33m${msg}\x1b[0m`;
const red = (msg) => `\x1b[31m${msg}\x1b[0m`;

module.exports = function actor() {
  return (req, _res, next) => {
    const raw = req.header('X-User-Id');

    if (!raw) {
      console.warn(yellow('[actor] Missing X-User-Id header'));
      return next();
    }

    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      console.warn(yellow(`[actor] Invalid X-User-Id value: "${raw}"`));
      return next();
    }

    try {
      const user = db
        .prepare('SELECT id, name, email FROM users WHERE id = ?')
        .get(id);

      if (user) {
        req.actor = user; // attach current user
        console.log(green(`[actor] Attached user: id=${user.id}, name="${user.name}", email="${user.email}"`));
      } else {
        console.warn(yellow(`[actor] No user found for id=${id}`));
      }
    } catch (err) {
      console.error(red(`[actor] DB lookup failed for id=${id}: ${err.message}`));
    }

    next();
  };
};
