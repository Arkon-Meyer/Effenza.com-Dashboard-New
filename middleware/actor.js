// middleware/actor.js
const db = require('../database');

module.exports = function actor() {
  return (req, _res, next) => {
    const id = req.header('X-User-Id');
    if (id) {
      try {
        const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?')
                       .get(Number(id));
        if (user) req.actor = user;
      } catch {
        // ignore lookup errors; continue without actor
      }
    }
    next();
  };
};
