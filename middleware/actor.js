// middleware/actor.js
const db = require('../database');

module.exports = function actor() {
  return (req, _res, next) => {
    const id = req.header('X-User-Id');

    if (!id) {
      console.warn('[actor] Missing X-User-Id header');
      return next();
    }

    try {
      const user = db
        .prepare('SELECT id, name, email FROM users WHERE id = ?')
        .get(Number(id));

      if (user) {
        req.actor = user;
      } else {
        console.warn(`[actor] Invalid X-User-Id: ${id}`);
      }
    } catch (err) {
      console.error(`[actor] Error looking up user with id=${id}:`, err.message);
    }

    next();
  };
};
