// database.js - Postgres Pool (supports DATABASE_URL)
const { Pool } = require('pg');
require('dotenv').config(); // no-op in CI

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/app';

const pool = new Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000
});

// simple helpers
const query = (text, params) => pool.query(text, params);
const tx = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await fn(client);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
};

module.exports = { pool, query, tx };
