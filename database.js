// database.js
'use strict';

require('dotenv').config({ override: true, quiet: true });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB || 'effenza',
  user: process.env.POSTGRES_USER || 'effenza',
  password: process.env.POSTGRES_PASSWORD || 'effenza',
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS || 5000),
  ssl:
    process.env.POSTGRES_SSL === 'true'
      ? {
          rejectUnauthorized:
            process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false'
        }
      : false
});

pool.on('error', (err) => {
  console.error('[pg] unexpected error on idle client', err);
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = {
  pool,
  query
};
