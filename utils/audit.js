// utils/audit.js
const db = require('../database');

// Create table & indexes idempotently on load
db.exec(`
  BEGIN;
  CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id    INTEGER,
    action      TEXT    NOT NULL,
    resource    TEXT    NOT NULL,
    resource_id INTEGER,
    org_unit_id INTEGER,
    details     TEXT,            -- JSON string
    ip          TEXT,
    user_agent  TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_audit_log_actor   ON audit_log(actor_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource, resource_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_org      ON audit_log(org_unit_id);
  COMMIT;
`);

function audit(req, { action, resource, resource_id = null, org_unit_id = null, details = null }) {
  try {
    const payload = {
      actor_id:   req?.actor?.id ?? null,
      action:     String(action),
      resource:   String(resource),
      resource_id,
      org_unit_id,
      details:    details ? JSON.stringify(details) : null,
      ip:         req?.ip ?? null,
      user_agent: req?.get?.('user-agent') ?? null
    };
    db.prepare(`
      INSERT INTO audit_log (actor_id, action, resource, resource_id, org_unit_id, details, ip, user_agent)
      VALUES (@actor_id, @action, @resource, @resource_id, @org_unit_id, @details, @ip, @user_agent)
    `).run(payload);
  } catch (e) {
    console.error('[audit] failed:', e.message);
  }
}

module.exports = { audit };
