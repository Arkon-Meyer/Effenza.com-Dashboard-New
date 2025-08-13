// middleware/actor.js
const db = require('../database');

// ANSI color helpers (works in Codespaces terminal)
const C = {
  green: s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  dim: s => `\x1b[2m${s}\x1b[0m`,
};

module.exports = function actor() {
  return (req, _res, next) => {
    const raw = req.header('X-User-Id');

    if (!raw) {
      console.warn(C.yellow('[actor] Missing X-User-Id header'));
      return next();
    }

    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      console.warn(C.yellow(`[actor] Invalid X-User-Id value: "${raw}"`));
      return next();
    }

    try {
      const user = db
        .prepare('SELECT id, name, email FROM users WHERE id = ?')
        .get(id);

      if (user) {
        req.actor = user;
        console.log(
          C.green(`[actor] ✅ authenticated id=${id}`),
          C.dim(`${user.name} <${user.email}>`)
        );
      } else {
        console.warn(C.yellow(`[actor] No user found for id=${id}`));
      }
    } catch (err) {
      console.error(C.red(`[actor] DB lookup failed for id=${id}: ${err.message}`));
    }

    next();
  };
}
