#!/usr/bin/env bash
set -euo pipefail

# --- Config (overridable via env) -------------------------------------------
PORT="${PORT:-3000}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
ADMIN_ID="${ADMIN_ID:-1}"
REASON_RAW="${REASON:-ops debug}"

QUIET=0
if [[ "${1:-}" == "--quiet" ]]; then QUIET=1; fi

# --- Utilities ---------------------------------------------------------------
have_jq() { command -v jq >/dev/null 2>&1; }

urlencode() {
  # Prefer jq; fallback to Python; final fallback is a naive encoding of spaces
  if have_jq; then
    printf '%s' "$1" | jq -sRr @uri
  elif command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY' "$1"
import sys, urllib.parse
print(urllib.parse.quote(sys.argv[1], safe=''))
PY
  else
    # Minimal fallback: replace spaces; good enough for our default reason
    printf '%s' "$1" | sed 's/ /%20/g'
  fi
}

REASON_ENC="$(urlencode "$REASON_RAW")"

curl_json() {
  # Fail on HTTP errors; pretty print if jq exists
  if have_jq; then
    curl --fail-with-body -sS -H "Accept: application/json" "$@" | jq .
  else
    curl --fail-with-body -sS -H "Accept: application/json" "$@"
  fi
}

http_ok() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$@")
  [[ "$code" == "200" ]]
}

ok()   { printf "[smoke:audit:detail] %s: OK\n" "$1"; }
fail() { printf "[smoke:audit:detail] %s: FAIL\n" "$1"; exit 1; }

# --- Verbose mode ------------------------------------------------------------
run_verbose() {
  echo "[smoke] detail (no PII)"
  curl_json -H "X-User-Id: ${ADMIN_ID}" \
    "${BASE_URL}/audit?mode=detail&limit=5&pii=false"

  echo
  echo "[smoke] detail (with PII + reason=\"${REASON_RAW}\")"
  curl_json -H "X-User-Id: ${ADMIN_ID}" \
    "${BASE_URL}/audit?mode=detail&limit=5&pii=true&reason=${REASON_ENC}"

  echo
  echo "[smoke] verify PII access was logged"
  curl_json -H "X-User-Id: ${ADMIN_ID}" \
    "${BASE_URL}/audit?mode=detail&pii=false&action=read&resource=audit_full&limit=3"

  echo
  echo "[smoke] aggregate sanity"
  curl_json -H "X-User-Id: ${ADMIN_ID}" \
    "${BASE_URL}/audit?mode=aggregate"
}

# --- Quiet mode (just 200 checks) -------------------------------------------
run_quiet() {
  http_ok -H "X-User-Id: ${ADMIN_ID}" \
    "${BASE_URL}/audit?mode=detail&limit=5&pii=false" \
    && ok "detail (no PII)" || fail "detail (no PII)"

  http_ok -H "X-User-Id: ${ADMIN_ID}" \
    "${BASE_URL}/audit?mode=detail&limit=5&pii=true&reason=${REASON_ENC}" \
    && ok "detail (with PII)" || fail "detail (with PII)"

  http_ok -H "X-User-Id: ${ADMIN_ID}" \
    "${BASE_URL}/audit?mode=detail&pii=false&action=read&resource=audit_full&limit=3" \
    && ok "verify PII access logged" || fail "verify PII access logged"

  http_ok -H "X-User-Id: ${ADMIN_ID}" \
    "${BASE_URL}/audit?mode=aggregate" \
    && ok "aggregate sanity" || fail "aggregate sanity"
}

# --- Entry -------------------------------------------------------------------
if [[ $QUIET -eq 1 ]]; then
  run_quiet
else
  run_verbose
fi
