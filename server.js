// server.js
require('dotenv').config({ override: true });
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const logger = require('./utils/logger');

const app = express();

// Health
app.get('/healthz', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.get('/readyz',  (_req, res) => res.json({ status: 'ready', timestamp: new Date().toISOString() }));

// --- Version endpoint ---
const build = require('./utils/version');
app.get('/version', (_req, res) => res.json(build));

// Init DB pool (used by routes)
require('./database');

// Routers
const groupRoutes       = require('./routes/groups');
const usersRouter       = require('./routes/users');
const membershipsRouter = require('./routes/memberships');
const orgUnitsRouter    = require('./routes/org-units');
const assignmentsRouter = require('./routes/assignments');
const auditRouter       = require('./routes/audit');

// Optional legacy actor middleware (X-User-Id). JWT auth lives in routes/* where applied.
let actorMw = (_req, _res, next) => next();
try {
  const actorMod = require('./middleware/actor');
  if (typeof actorMod === 'function') {
    const maybeMw = actorMod.length >= 3 ? actorMod : actorMod();
    actorMw = (typeof maybeMw === 'function') ? maybeMw : actorMw;
  } else if (actorMod && typeof actorMod.middleware === 'function') {
    actorMw = actorMod.middleware;
  }
} catch (_e) { /* ignore */ }

// Security & logging
app.use(helmet());
app.use(cors({ origin: '*' })); // tighten in prod
app.use(morgan('dev'));
app.use(morgan('combined', { stream: logger.httpStream })); // to logs/http/

// Body + actor
app.use(express.json());
app.use(actorMw);

// Static
app.use(express.static(path.join(__dirname, 'public')));

// API
app.use('/groups',       groupRoutes);
app.use('/users',        usersRouter);
app.use('/memberships',  membershipsRouter);
app.use('/org-units',    orgUnitsRouter);
app.use('/assignments',  assignmentsRouter);
app.use('/audit',        auditRouter);
app.use(require('./routes/login'));

// Simple root
app.get('/', (_req, res) => res.send('Effenza Dashboard is up and running!'));

// 404 / 500
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));
app.use((err, req, res, _next) => {
  logger.app('express_error', { message: err.message, stack: err.stack });
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Fatal handlers
process.on('uncaughtException', (err) => {
  logger.app('uncaughtException', { message: err.message, stack: err.stack });
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  logger.app('unhandledRejection', { reason: (reason && reason.message) || String(reason) });
  console.error('[unhandledRejection]', reason);
});

// Start
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

