// middleware/actor.js
const db = require('../database');

// ANSI color helpers (works in Codespaces terminal)
const C = {
  green: s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  dim: s => `\x1b[2m${s}\x1b[0m`,
};

const SELECT_USER = db.prepare('SELECT id, name, email FROM users WHERE id = ?');

const VERBOSE = process.env.ACTOR_LOG === '1';
const STRICT  = process.env.ACTOR_REQUIRED === '1';

module.exports = function actor() {
  return (req, res, next) => {
    req.actor = null;

    const raw = req.header('X-User-Id'); // header names are case-insensitive
    if (!raw) {
      if (VERBOSE) console.warn(C.yellow('[actor] Missing X-User-Id header'));
      if (STRICT)  return res.status(401).json({ error: 'Missing X-User-Id' });
      return next();
    }

    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      if (VERBOSE) console.warn(C.yellow(`[actor] Invalid X-User-Id: "${raw}"`));
      if (STRICT)  return res.status(401).json({ error: 'Invalid X-User-Id' });
      return next();
    }

    try {
      const user = SELECT_USER.get(id);
      if (user) {
        req.actor = user;
        if (VERBOSE) {
          console.log(
            C.green(`[actor] ✅ authenticated id=${id}`),
            C.dim(`${user.name} <${user.email}>`)
          );
        }
      } else {
        if (VERBOSE) console.warn(C.yellow(`[actor] No user found for id=${id}`));
        if (STRICT)  return res.status(401).json({ error: 'Unknown user' });
      }
    } catch (err) {
      console.error(C.red(`[actor] DB lookup failed for id=${id}: ${err.message}`));
      // In STRICT mode, treat DB failure as auth failure
      if (STRICT) return res.status(500).json({ error: 'Auth lookup failed' });
    }

    next();
  };
};
