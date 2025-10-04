// middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    req.actor = user;
    next();
  } catch (err) {
    console.error('[auth middleware] Invalid token', err);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
