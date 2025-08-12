// middleware/actor.js
// TEMP auth: read acting user from header X-User-Id and load from DB
const db = require('../database');

module.exports = function actor() {
  return (req, _res, next) => {
    const id = Number(req.header('X-User-Id') || '');
    if (Number.isInteger(id) && id > 0) {
      const user = db.prepare('SELECT id, name, email FROM users WHERE id=?').get(id);
      if (user) req.actor = user;
    }
    next();
  };
};
