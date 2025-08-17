#!/usr/bin/env bash
set -euo pipefail

# Config (can be overridden in env)
BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_ID="${ADMIN_ID:-1}"
REASON_RAW="${REASON:-ops debug}"

# ---------- helpers to ensure a server is running ----------
have_port() {
  curl -s -o /dev/null -w "%{http_code}" "${BASE_URL%/}/healthz" | grep -q '^200$'
}

start_server_if_needed() {
  if have_port; then
    SERVER_PID=""
    return
  fi
  node server.js >/dev/null 2>&1 &
  SERVER_PID=$!
  # wait up to ~15s (30 * 0.5s)
  for _ in {1..30}; do
    if have_port; then break; fi
    sleep 0.5
  done
}

stop_server_if_started() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
# -----------------------------------------------------------

# URL-encode reason (needs jq; if missing, fall back to raw)
urlencode() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$1" | jq -sRr @uri
  else
    # best-effort minimal encoding (spaces -> %20)
    printf '%s' "$1" | sed 's/ /%20/g'
  fi
}
REASON="$(urlencode "$REASON_RAW")"

curlj() {
  # Fail on HTTP errors but still show body
  if command -v jq >/dev/null 2>&1; then
    curl --fail-with-body -sS -H "Accept: application/json" "$@" | jq .
  else
    curl --fail -sS -H "Accept: application/json" "$@"
  fi
}

main() {
  start_server_if_needed
  trap stop_server_if_started EXIT

  echo "[smoke] detail (no PII)"
  curlj -H "X-User-Id: $ADMIN_ID" \
    "${BASE_URL}/audit?mode=detail&limit=5&pii=false"

  echo
  echo "[smoke] detail (with PII + reason=\"$REASON_RAW\")"
  curlj -H "X-User-Id: $ADMIN_ID" \
    "${BASE_URL}/audit?mode=detail&limit=5&pii=true&reason=${REASON}"

  echo
  echo "[smoke] verify PII access was logged"
  curlj -H "X-User-Id: $ADMIN_ID" \
    "${BASE_URL}/audit?mode=detail&pii=false&action=read&resource=audit_full&limit=3"

  echo
  echo "[smoke] aggregate sanity"
  curlj -H "X-User-Id: $ADMIN_ID" \
    "${BASE_URL}/audit?mode=aggregate"
}

main
