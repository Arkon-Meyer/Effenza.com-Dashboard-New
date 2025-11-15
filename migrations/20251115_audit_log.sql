CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  event_ts    timestamptz NOT NULL,
  user_id     integer REFERENCES users(id) ON DELETE SET NULL,
  session_id  uuid,
  event_type  text NOT NULL,
  ip          inet,
  user_agent  text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash   bytea,
  hash        bytea
);

CREATE INDEX IF NOT EXISTS idx_audit_user_ts   ON audit_log (user_id, event_ts);
CREATE INDEX IF NOT EXISTS idx_audit_event_ts  ON audit_log (event_type, event_ts);
