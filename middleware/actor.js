// middleware/actor.js
const db = require('../database');

module.exports = function actor() {
  return (req, _res, next) => {
    const id = req.header('X-User-Id');
    if (id) {
      const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(Number(id));
      if (user) req.actor = user;
    }
    next();
  };
};
