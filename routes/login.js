const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../database');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

router.post('/login', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const { rows } = await db.query(`SELECT * FROM users WHERE email = $1`, [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '2h',
    });

    res.json({ token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
