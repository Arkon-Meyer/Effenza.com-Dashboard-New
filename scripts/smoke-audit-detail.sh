#!/usr/bin/env bash
set -euo pipefail

# Config (can be overridden in env)
BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_ID="${ADMIN_ID:-1}"
REASON_RAW="${REASON:-ops debug}"

# Helpers
urlencode() { printf '%s' "$1" | jq -sRr @uri; }  # needs jq
REASON="$(urlencode "$REASON_RAW")"

curlj() {
  # Fail on HTTP errors but still show body
  curl --fail-with-body -sS -H "Accept: application/json" "$@" | jq .
}

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
