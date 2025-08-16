#!/usr/bin/env bash
set -euo pipefail

QUIET=0
if [[ "${1:-}" == "--quiet" ]]; then QUIET=1; fi

# --- Helpers ---
have_port() {
  # prefer healthz (explicit 200 JSON)
  curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:3000/healthz" | grep -q '^200$'
}

start_server_if_needed() {
  if have_port; then
    SERVER_PID=""
    return
  fi
  node server.js >/dev/null 2>&1 &
  SERVER_PID=$!
  # wait up to ~15s (30 * 0.5s)
  for i in {1..30}; do
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

ok()   { printf "[smoke:audit] %s: OK\n" "$1"; }
fail() { printf "[smoke:audit] %s: FAIL\n" "$1"; exit 1; }

# Returns nonzero if HTTP != 200
http_ok() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$@")
  [[ "$code" == "200" ]]
}

run_verbose() {
  # If jq missing, fall back to quiet checks (keeps script usable in slim images)
  if ! command -v jq >/dev/null 2>&1; then
    echo "[smoke:audit] 'jq' not found; falling back to quiet mode."
    run_quiet
    return
  fi

  echo "== Admin aggregate (7d) =="
  curl --fail --show-error -s -H "X-User-Id: 1" \
    "http://localhost:3000/audit?mode=aggregate" | jq .

  echo
  echo "== Admin detail (masked, last 3) =="
  curl --fail --show-error -s -H "X-User-Id: 1" \
    "http://localhost:3000/audit?mode=detail&limit=3" | jq .

  echo
  echo "== Admin detail WITH PII (last 3) =="
  curl --fail --show-error -s -H "X-User-Id: 1" \
    "http://localhost:3000/audit?mode=detail&limit=3&pii=true&reason=smoke%20test" | jq .

  echo
  echo "== Region manager aggregate (auto-scoped) =="
  curl --fail --show-error -s -H "X-User-Id: 5" \
    "http://localhost:3000/audit?mode=aggregate" | jq .
}

# Quiet checks (lightweight)
run_quiet() {
  http_ok -H "X-User-Id: 1" "http://localhost:3000/audit?mode=aggregate" \
    && ok "Admin aggregate" || fail "Admin aggregate"

  http_ok -H "X-User-Id: 1" "http://localhost:3000/audit?mode=detail&limit=3" \
    && ok "Admin detail" || fail "Admin detail"

  http_ok -H "X-User-Id: 1" "http://localhost:3000/audit?mode=detail&limit=3&pii=true&reason=smoke%20test" \
    && ok "Admin detail PII" || fail "Admin detail PII"

  http_ok -H "X-User-Id: 5" "http://localhost:3000/audit?mode=aggregate" \
    && ok "Region manager aggregate" || fail "Region manager aggregate"
}

main() {
  start_server_if_needed
  trap stop_server_if_started EXIT

  if [[ $QUIET -eq 1 ]]; then
    run_quiet
  else
    run_verbose
  fi
}

main
