const express = require('express');
const path = require('path');                 // NEW
const app = express();
const db = require('./database');

// Routes
const groupRoutes = require('./routes/groups');
const usersRouter = require('./routes/users');
const membershipsRouter = require('./routes/memberships');

app.use(express.json());

// Static assets
app.use(express.static('public'));            // NEW

// Debug log for requests
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use('/groups', groupRoutes);
app.use('/users', usersRouter);
app.use('/memberships', membershipsRouter);

// Serve the dashboard at /admin
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/', (_req, res) => {
  res.send('Effenza Dashboard is up and running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server is listening on port ${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    throw err;
  }
});
