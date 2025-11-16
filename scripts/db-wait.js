#!/usr/bin/env node
require('dotenv').config({ override: true }); // ok if .env is missing in CI

const { Pool } = require('pg');

const config = {
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB || 'effenza',
  user: process.env.POSTGRES_USER || 'effenza',
  password: process.env.POSTGRES_PASSWORD || 'effenza',
};

const MAX_RETRIES = Number(process.env.DB_WAIT_RETRIES || 30);
const DELAY_MS    = Number(process.env.DB_WAIT_DELAY_MS || 2000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('[db-wait] starting');
  console.log('[db-wait] config:', {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
  });

  const pool = new Pool(config);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await pool.query('SELECT 1');
      console.log('[db-wait] DB ready');
      await pool.end();
      process.exit(0);
    } catch (err) {
      console.error(`[db-wait] attempt ${attempt}/${MAX_RETRIES} failed`, {
        code: err.code,
        message: err.message,
      });

      if (attempt === MAX_RETRIES) {
        console.error('[db-wait] giving up, DB not ready');
        await pool.end().catch(() => {});
        process.exit(1);
      }

      await sleep(DELAY_MS);
    }
  }
}

main().catch((err) => {
  console.error('[db-wait] fatal error', err);
  process.exit(1);
});
