#!/usr/bin/env node
// Purge old audit_log rows (default: 180 days). Optional VACUUM.
// Usage: AUDIT_RETENTION_DAYS=90 AUDIT_VACUUM=true node scripts/cron-clean-audit.js

'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'effenza.db');
const RETENTION_DAYS_RAW = process.env.AUDIT_RETENTION_DAYS || '180';
const RETENTION_DAYS = Number.parseInt(RETENTION_DAYS_RAW, 10);
const DO_VACUUM = /^1|true$/i.test(process.env.AUDIT_VACUUM || '');

function toSqlDateTime(d) {
  const dt = d instanceof Date ? d : new Date(d);
  // SQLite-compatible UTC "YYYY-MM-DD HH:MM:SS"
  return dt.toISOString().slice(0, 19).replace('T', ' ');
}

function nowMinusDays(days) {
  return new Date(Date.now() - days * 86_400_000);
}

function main() {
  if (!Number.isFinite(RETENTION_DAYS) || RETENTION_DAYS <= 0) {
    console.error(`[audit:cleanup] invalid AUDIT_RETENTION_DAYS="${RETENTION_DAYS_RAW}"`);
    process.exit(2);
  }

  const cutoff = nowMinusDays(RETENTION_DAYS);
  const cutoffStr = toSqlDateTime(cutoff);

  let db;
  try {
    db = new Database(DB_PATH);
    const stmt = db.prepare('DELETE FROM audit_log WHERE created_at < ?');
    const info = stmt.run(cutoffStr);

    console.log(`[audit:cleanup] retention=${RETENTION_DAYS}d cutoff=${cutoffStr} deleted=${info.changes}`);

    if (DO_VACUUM && info.changes > 0) {
      db.exec('VACUUM');
      console.log('[audit:cleanup] VACUUM done');
    }
  } catch (err) {
    console.error('[audit:cleanup] ERROR:', err?.message || err);
    process.exit(1);
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

main();
