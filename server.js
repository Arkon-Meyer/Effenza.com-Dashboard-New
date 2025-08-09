const express = require('express');
const path = require('path');
const app = express();
const db = require('./database');
const groupRoutes = require('./routes/groups');
const usersRouter = require('./routes/users');
const membershipsRouter = require('./routes/memberships');

// Middleware
app.use(express.json());

// Serve static files from "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/groups', groupRoutes);
app.use('/users', usersRouter);
app.use('/memberships', membershipsRouter);

// Admin dashboard route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Root route
app.get('/', (req, res) => {
  res.send('Effenza Dashboard is up and running!');
});

// Start server
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
