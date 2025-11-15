CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash         bytea   NOT NULL,
  issued_at          timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  rotated_from       uuid NULL REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  revoked_at         timestamptz,
  revoke_reason      text,
  user_agent         text,
  ip                 inet,
  CONSTRAINT rt_expires_after_issue CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS idx_rt_user     ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_rt_expires  ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_rt_hash     ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_rt_active   ON refresh_tokens((revoked_at IS NULL));

CREATE OR REPLACE VIEW active_refresh_tokens AS
SELECT * FROM refresh_tokens
 WHERE revoked_at IS NULL
   AND now() < expires_at;

CREATE OR REPLACE FUNCTION revoke_all_refresh_tokens(p_user_id integer, p_reason text DEFAULT 'logout_all')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE refresh_tokens
     SET revoked_at = now(),
         revoke_reason = COALESCE(p_reason, 'logout_all')
   WHERE user_id = p_user_id
     AND revoked_at IS NULL;
END $$;
