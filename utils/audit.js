// utils/audit.js
const db = require('../database');

function audit(req, { action, resource, resource_id = null, org_unit_id = null, details = null }) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (actor_user_id, action, resource, resource_id, org_unit_id, ip, user_agent, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req?.actor?.id || null,
      action,
      resource,
      resource_id,
      org_unit_id,
      (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString(),
      (req.headers['user-agent'] || '').toString(),
      details ? JSON.stringify(details) : null
    );
  } catch (e) {
    console.warn('[audit] failed:', e.message);
  }
}

module.exports = { audit };
