#!/usr/bin/env node
// Purge old audit_log rows (default: 180 days). Optional VACUUM.
// Usage: AUDIT_RETENTION_DAYS=90 npm run audit:cleanup
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'effenza.db');
const RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS || '180', 10);
const DO_VACUUM = /^1|true$/i.test(process.env.AUDIT_VACUUM || '');

function toSqlDateTime(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  return dt.toISOString().slice(0, 19).replace('T', ' ');
}

function main() {
  const db = new Database(DB_PATH);
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const cutoffStr = toSqlDateTime(cutoff);

  const info = db.prepare(`DELETE FROM audit_log WHERE created_at < ?`).run(cutoffStr);
  console.log(`[audit:cleanup] retention=${RETENTION_DAYS}d cutoff=${cutoffStr} deleted=${info.changes}`);

  if (DO_VACUUM && info.changes > 0) {
    db.exec('VACUUM');
    console.log('[audit:cleanup] VACUUM done');
  }
}
main();
