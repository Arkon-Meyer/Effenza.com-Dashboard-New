#!/usr/bin/env node
require('dotenv').config({ override: true });

const { Client } = require('pg');

// Default to localhost; CI will also talk to the Postgres service via 127.0.0.1:5432
const HOST = process.env.POSTGRES_HOST || '127.0.0.1';
const PORT = Number(process.env.POSTGRES_PORT || 5432);
const DB   = process.env.POSTGRES_DB   || 'effenza';
const USER = process.env.POSTGRES_USER || 'effenza';
const PASS = process.env.POSTGRES_PASSWORD || 'effenza';

const MAX_ATTEMPTS = Number(process.env.DB_WAIT_MAX_ATTEMPTS || 30);
const DELAY_MS     = Number(process.env.DB_WAIT_DELAY_MS || 1000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryConnect() {
  const client = new Client({
    host: HOST,
    port: PORT,
    database: DB,
    user: USER,
    password: PASS,
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    return true;
  } catch (err) {
    console.error('[db-wait] attempt failed', {
      code: err.code,
      message: err.message,
    });
    try { await client.end(); } catch (_) {}
    return false;
  }
}

(async () => {
  console.log('[db-wait] starting');
  console.log('[db-wait] config:', { host: HOST, port: PORT, database: DB, user: USER });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ok = await tryConnect();
    if (ok) {
      console.log('[db-wait] DB ready');
      process.exit(0);
    }
    console.log(
      `[db-wait] attempt ${attempt}/${MAX_ATTEMPTS} failed – retrying in ${DELAY_MS}ms`
    );
    await sleep(DELAY_MS);
  }

  console.error('[db-wait] giving up, DB not ready');
  process.exit(1);
})();
