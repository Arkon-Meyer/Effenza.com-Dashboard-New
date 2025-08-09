const express = require('express');
const path = require('path');
const db = require('./database');
const groupRoutes = require('./routes/groups');
const usersRouter = require('./routes/users');
const membershipsRouter = require('./routes/memberships');

const app = express();

// Middleware
app.use(express.json());
app.use(express.static('public')); // serve HTML/CSS/JS from public/

// API Routes
app.use('/groups', groupRoutes);
app.use('/users', usersRouter);
app.use('/memberships', membershipsRouter);

// Serve dashboard
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/', (_req, res) => {
  res.send('Effenza Dashboard is up and running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server is listening on port ${PORT}`);
});
