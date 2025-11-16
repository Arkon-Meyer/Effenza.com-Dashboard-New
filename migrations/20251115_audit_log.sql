BEGIN;

-- Fresh audit_log table with hash chain fields
DROP TABLE IF EXISTS audit_log;

CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  event_ts    TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     BIGINT,
  session_id  UUID,
  event_type  TEXT NOT NULL,
  ip          INET,
  user_agent  TEXT,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash   TEXT,
  curr_hash   TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_event_ts   ON audit_log (event_ts);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id    ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log (event_type);

COMMIT;
