// scripts/prune-logs.js
'use strict';
const fs = require('fs');
const path = require('path');

const LOG_DIRS = ['logs/http', 'logs/app', 'logs/audit'];
const MAX_DAYS = 30;

for (const dir of LOG_DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
    if (ageDays > MAX_DAYS) {
      fs.unlinkSync(full);
      console.log(`🧹 Removed old log: ${full}`);
    }
  }
}
