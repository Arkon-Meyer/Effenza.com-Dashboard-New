'use strict';
const { execSync } = require('child_process');
const pkg = require('../package.json');

function safe(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

module.exports = {
  name: pkg.name || 'effenza-dashboard',
  version: pkg.version || '0.0.0',
  commit: safe('git rev-parse --short HEAD'),
  branch: safe('git rev-parse --abbrev-ref HEAD'),
  buildTime: new Date().toISOString(),
};
