#!/usr/bin/env bash
set -euo pipefail

echo "== Admin aggregate (7d) =="
curl -s -H "X-User-Id: 1" "http://localhost:3000/audit?mode=aggregate" | jq .

echo
echo "== Admin detail (masked, last 3) =="
curl -s -H "X-User-Id: 1" "http://localhost:3000/audit?mode=detail&limit=3" | jq .

echo
echo "== Admin detail WITH PII (last 3) =="
curl -s -H "X-User-Id: 1" "http://localhost:3000/audit?mode=detail&limit=3&pii=true&reason=smoke%20test" | jq .

echo
echo "== Region manager aggregate (auto-scoped) =="
curl -s -H "X-User-Id: 5" "http://localhost:3000/audit?mode=aggregate" | jq .
