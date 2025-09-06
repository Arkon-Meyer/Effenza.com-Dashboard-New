#!/usr/bin/env node
'use strict';

const { Client } = require('pg');
require('dotenv').config({ override: true, quiet: true });

const HOST = process.env.POSTGRES_HOST || '127.0.0.1';
const PORT = Number(process.env.POSTGRES_PORT || '5432');
const DB   = process.env.POSTGRES_DB || 'effenza';
const USER = process.env.POSTGRES_USER || 'effenza';
const PASS = process.env.POSTGRES_PASSWORD || 'effenza';

const MAX = 60;
(async () => {
  for (let i = 1; i <= MAX; i++) {
    const c = new Client({
      host: HOST, port: PORT, database: DB, user: USER, password: PASS,
      connectionTimeoutMillis: 1000,
    });
    try {
      await c.connect();
      await c.query('SELECT 1');
      await c.end();
      console.log('DB ready'); process.exit(0);
    } catch (_e) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  console.error('DB not ready');
  process.exit(1);
})();
