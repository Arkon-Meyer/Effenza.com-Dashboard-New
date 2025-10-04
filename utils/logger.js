'use strict';
const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function ymd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function fileFor(dir, prefix) {
  ensureDir(dir);
  return path.join(dir, `${prefix}-${ymd()}.log`);
}

function appendLine(dir, prefix, line) {
  fs.appendFile(fileFor(dir, prefix), line, () => {});
}

// --- HTTP access logs (morgan stream) ---
const httpStream = {
  write: (str) => appendLine('logs/http', 'access', str)
};

// --- Application errors, exceptions ---
function app(message, meta = {}) {
  const rec = { ts: new Date().toISOString(), level: 'error', message, ...meta };
  appendLine('logs/app', 'app', JSON.stringify(rec) + '\n');
}

// --- GDPR/audit-compliant event logs ---
function audit(event) {
  const rec = { ts: new Date().toISOString(), ...event };
  appendLine('logs/audit', 'audit', JSON.stringify(rec) + '\n');
}

module.exports = { httpStream, app, audit };
