// database.js — PG compat shim for legacy SQLite-style API
'use strict';

const { Pool } = require('pg');
require('dotenv').config({ override: true, quiet: true });

const {
  POSTGRES_HOST = '127.0.0.1',
  POSTGRES_PORT = '5432',
  POSTGRES_DB = 'effenza',
  POSTGRES_USER = 'effenza',
  POSTGRES_PASSWORD = 'effenza',
  DATABASE_URL,
} = process.env;

const pool = new Pool(
  DATABASE_URL ? { connectionString: DATABASE_URL } : {
    host: POSTGRES_HOST,
    port: Number(POSTGRES_PORT),
    database: POSTGRES_DB,
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
  }
);
// --- helper: convert "?" placeholders to $1,$2,... for PG
function toPg(sql) {
  let i = 0;
  return String(sql).replace(/\?/g, () => `$${++i}`);
}
function isInsert(sql) { return /^\s*insert\b/i.test(sql); }
function hasReturning(sql) { return /\breturning\b/i.test(sql); }

// --- compat prepare API
function prepare(sql) {
  return {
    async all(...params) {
      const q = toPg(sql);
      const res = await pool.query(q, params);
      return res.rows;
    },
    async get(...params) {
      const rows = await this.all(...params);
      return rows[0] ?? undefined;
    },
    async run(...params) {
      let q = toPg(sql);
      let wantsId = false;
      if (isInsert(sql) && !hasReturning(sql)) {
        q = `${q} RETURNING id`;
        wantsId = true;
      }
      const res = await pool.query(q, params);
      const out = { changes: res.rowCount || 0 };
      if (wantsId && res.rows?.[0]?.id != null) out.lastInsertRowid = res.rows[0].id;
      return out;
    },
  };
}

// --- exec(sql) for simple multi-statement compatibility
async function exec(sql) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const parts = String(sql).split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of parts) await client.query(stmt);
    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}
// bare query
async function query(text, params) { return pool.query(text, params); }

// simple transaction helper
async function tx(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const runner = {
      query: (t, p) => client.query(t, p),
      prepare: (sql) => ({
        all: (...ps) => client.query(toPg(sql), ps).then(r => r.rows),
        get: (...ps) => client.query(toPg(sql), ps).then(r => r.rows[0]),
        run: async (...ps) => {
          let q = toPg(sql); let wantsId = false;
          if (isInsert(sql) && !hasReturning(sql)) { q = `${q} RETURNING id`; wantsId = true; }
          const r = await client.query(q, ps);
          const out = { changes: r.rowCount || 0 };
          if (wantsId && r.rows?.[0]?.id != null) out.lastInsertRowid = r.rows[0].id;
          return out;
        },
      }),
      exec: (s) => client.query(s),
    };
    const result = await callback(runner);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, prepare, exec, query, tx };
