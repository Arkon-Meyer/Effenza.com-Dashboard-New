#!/usr/bin/env bash
set -euo pipefail

# Always prefer a real user token (PAT) with scopes: repo, project, read:org
# For Actions, pass GH_PROJECT_TOKEN via secrets (see workflow below).
: "${GH_TOKEN:=${GH_PROJECT_TOKEN:-}}"

: "${PROJECT_OWNER:=Arkon-Meyer}"     # user or org that owns project
: "${PROJECT_NUMBER:=2}"              # project number (not ID)
: "${ISSUE_NUMBER:?ISSUE_NUMBER is required}"     # e.g. 42
: "${TARGET_STATUS:?TARGET_STATUS is required}"   # e.g. "To Do" | "In Progress" | "Done" | "Backlog"

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "[auto] No token found. Set GH_PROJECT_TOKEN (PAT) or GH_TOKEN."
  exit 1
fi

# Log in gh non-interactively for this shell/session
gh auth status -h github.com >/dev/null 2>&1 || gh auth login --with-token <<<"$GH_TOKEN"

# Resolve project id
project_json="$(gh project view "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json)"
project_id="$(jq -r '.id' <<<"$project_json")"
[[ -n "$project_id" && "$project_id" != "null" ]] || { echo "[auto] Could not resolve project id"; exit 1; }

# Get Status field + options
fields_json="$(gh project field-list --owner "$PROJECT_OWNER" "$PROJECT_NUMBER" --format json)"
status_field_id="$(jq -r '.fields[] | select(.name=="Status") | .id' <<<"$fields_json")"
[[ -n "$status_field_id" && "$status_field_id" != "null" ]] || { echo "[auto] No 'Status' field"; exit 1; }

# Map of Status options
declare -A STATUS_OPT
while IFS='=' read -r name id; do STATUS_OPT["$name"]="$id"; done \
  < <(jq -r '.fields[] | select(.name=="Status") | .options[] | "\(.name)=\(.id)"' <<<"$fields_json")

opt_id="${STATUS_OPT[$TARGET_STATUS]:-}"
[[ -n "${opt_id:-}" ]] || { echo "[auto] Status option '$TARGET_STATUS' not found"; exit 1; }

# Ensure the issue is in the project (add if missing), then set Status
echo "[auto] Updating issue #$ISSUE_NUMBER → '$TARGET_STATUS'"

# Find (or add) the project item for this issue
item_id="$(gh project item-list --owner "$PROJECT_OWNER" "$PROJECT_NUMBER" --format json \
  | jq -r --arg num "$ISSUE_NUMBER" '.items[] | select(.content.number|tostring==$num) | .id' | head -n1)"

if [[ -z "${item_id:-}" ]]; then
  # Add the issue to the project
  item_add_json="$(gh project item-add --owner "$PROJECT_OWNER" "$PROJECT_NUMBER" --url \
    "https://github.com/${PROJECT_OWNER}/$(basename "$(git rev-parse --show-toplevel)")/issues/${ISSUE_NUMBER}" --format json)"
  item_id="$(jq -r '.id' <<<"$item_add_json")"
  echo "[auto] Added issue #$ISSUE_NUMBER to project ($item_id)"
fi

# Edit the Status field
gh project item-edit \
  --id "$item_id" \
  --project-id "$project_id" \
  --field-id "$status_field_id" \
  --single-select-option-id "$opt_id" >/dev/null

echo "[auto] Done."
