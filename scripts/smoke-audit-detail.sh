#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_ID="${ADMIN_ID:-1}"

echo "[smoke] detail (no PII)"
curl -s -H "X-User-Id: ${ADMIN_ID}" \
  "${BASE_URL}/audit?mode=detail&limit=5&pii=false" | jq .

echo
echo "[smoke] detail (with PII + reason)"
curl -s -H "X-User-Id: ${ADMIN_ID}" \
  "${BASE_URL}/audit?mode=detail&limit=5&pii=true&reason=ops-debug" | jq .

echo
echo "[smoke] verify PII access was logged"
curl -s -H "X-User-Id: ${ADMIN_ID}" \
  "${BASE_URL}/audit?mode=detail&pii=false&action=read&resource=audit_full&limit=3" | jq .

echo
echo "[smoke] aggregate sanity"
curl -s -H "X-User-Id: ${ADMIN_ID}" \
  "${BASE_URL}/audit?mode=aggregate" | jq .
