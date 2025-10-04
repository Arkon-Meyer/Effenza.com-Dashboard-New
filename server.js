// server.js
require('dotenv').config({ override: true });
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const app = express();

// --- Health endpoints (kept early so helpers can ping even if other code fails) ---
app.get('/healthz', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.get('/readyz',  (_req, res) => res.json({ status: 'ready', timestamp: new Date().toISOString() }));

// --- DB (kept so routes can import it confidently) ---
const db = require('./database');

// --- Routers ---
const groupRoutes       = require('./routes/groups');
const usersRouter       = require('./routes/users');
const membershipsRouter = require('./routes/memberships');
const orgUnitsRouter    = require('./routes/org-units');
const assignmentsRouter = require('./routes/assignments');
const auditRouter       = require('./routes/audit');

// --- Middleware ---
const actor = require('./middleware/actor'); // attaches req.actor if X-User-Id header is valid

// --- Security / logging ---
app.use(helmet());
app.use(cors({ origin: '*' })); // TODO: restrict in prod
app.use(morgan('dev'));

// --- Body parsing & auth context ---
app.use(express.json());

// actor middleware: accept function OR factory
let actorMw = (_req, _res, next) => next();
try {
  const actorMod = require('./middleware/actor');
  if (typeof actorMod === 'function') {
    // either directly a middleware or a factory returning one
    const maybeMw = actorMod.length >= 3 ? actorMod : actorMod(); // crude heuristic
    actorMw = (typeof maybeMw === 'function') ? maybeMw : actorMw;
  } else if (actorMod && typeof actorMod.middleware === 'function') {
    actorMw = actorMod.middleware;
  }
} catch (_e) { /* optional: log a warning */ }

app.use(actorMw);

// --- Static files ---
app.use(express.static(path.join(__dirname, 'public')));

// --- API routes ---
app.use('/groups',       groupRoutes);
app.use('/users',        usersRouter);
app.use('/memberships',  membershipsRouter);
app.use('/org-units',    orgUnitsRouter);
app.use('/assignments',  assignmentsRouter);
app.use('/audit',        auditRouter);
app.use(require('./routes/login'));

// --- Admin dashboard ---
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Root (simple welcome) ---
app.get('/', (_req, res) => {
  res.send('Effenza Dashboard is up and running!');
});

// --- JSON 404 + 500 handlers ---
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use((err, req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// --- Start server ---
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
