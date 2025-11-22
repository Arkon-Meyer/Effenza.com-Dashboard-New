require('dotenv').config({ override: true });
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const logger = require('./utils/logger');
const cookieParser = require('cookie-parser');
const build = require('./utils/version');
require('./database'); // init DB pool

const app = express();

// Security hardening
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Health
app.get('/healthz', (_req, res) =>
  res.json({ status: 'ok', uptime: process.uptime() })
);
app.get('/readyz', (_req, res) =>
  res.json({ status: 'ready', timestamp: new Date().toISOString() })
);

// Version
app.get('/version', (_req, res) => res.json(build));

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
} catch (_e) {
  // ignore
}

// Security & logging
app.use(helmet());
app.use(cors({ origin: '*' })); // tighten in prod
app.use(morgan('dev'));
app.use(morgan('combined', { stream: logger.httpStream })); // to logs/http/

// Body + cookies + actor
app.use(express.json());
app.use(cookieParser());
app.use(actorMw);

// Static files (legacy UI; OK to remove later)
app.use(express.static(path.join(__dirname, 'public')));

// ---------------- Routes ----------------
app.use('/auth',        require('./routes/auth'));
app.use('/groups',      require('./routes/groups'));

// GDPR export (uses X-User-Id / req.actor, no JWT yet)
app.use('/users',       require('./routes/user_audit_export'));

// Existing users router (JWT-protected once middleware is added)
app.use('/users',       require('./routes/users'));

app.use('/memberships', require('./routes/memberships'));
app.use('/org-units',   require('./routes/org-units'));
app.use('/assignments', require('./routes/assignments'));
app.use('/audit',       require('./routes/audit'));

// Simple root
app.get('/', (_req, res) =>
  res.send('Effenza Dashboard is up and running!')
);

// 404
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));

// 500
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
  logger.app('unhandledRejection', {
    reason: (reason && reason.message) || String(reason)
  });
  console.error('[unhandledRejection]', reason);
});

// Start
const PORT = process.env.PORT || 3000;
app
  .listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server is listening on port ${PORT}`);
  })
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use`);
      process.exit(1);
    } else {
      throw err;
    }
  });
