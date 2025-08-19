#!/usr/bin/env bash
set -euo pipefail

# Always use your personal PAT, not the Codespaces integration
unset GITHUB_TOKEN GH_TOKEN

: "${PROJECT_OWNER:=Arkon-Meyer}"
: "${PROJECT_NUMBER:=2}"

# --- Auth guard --------------------------------------------------------------
if ! gh auth status -h github.com >/dev/null 2>&1; then
  echo "[status] Not logged in. Run: gh auth login --hostname github.com --web"
  exit 1
fi
if ! gh auth status -h github.com | grep -q "project"; then
  echo "[status] Token missing 'project' scope. Run:"
  echo "  gh auth refresh -h github.com -s project -s repo -s read:org"
  exit 1
fi

# --- Resolve project id ------------------------------------------------------
project_id="$(gh project view "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json | jq -r '.id')"
echo "[status] Target project: $PROJECT_OWNER/#$PROJECT_NUMBER ($project_id)"

# --- Get Status field + option ids ------------------------------------------
fields_json="$(gh project field-list --owner "$PROJECT_OWNER" "$PROJECT_NUMBER" --format json)"
status_field_id="$(jq -r '.fields[] | select(.name=="Status") | .id' <<<"$fields_json")"
if [[ -z "${status_field_id:-}" || "$status_field_id" == "null" ]]; then
  echo "[status] Could not find a 'Status' field on the project. Create it first."
  exit 1
fi

# Build name->id map of Status options
declare -A STATUS_OPT
while IFS='=' read -r name id; do
  STATUS_OPT["$name"]="$id"
done < <(jq -r '.fields[] | select(.name=="Status") | .options[] | "\(.name)=\(.id)"' <<<"$fields_json")

need_opt() {
  local key="$1"
  if [[ -z "${STATUS_OPT[$key]:-}" ]]; then
    echo "[status] Status option '$key' not found. Available: ${!STATUS_OPT[*]}"
    exit 1
  fi
}
need_opt "Backlog"
need_opt "To Do"
need_opt "In Progress"
need_opt "Done"

# --- Fetch project items -----------------------------------------------------
items_json="$(gh project item-list --owner "$PROJECT_OWNER" "$PROJECT_NUMBER" -L 100 --format json)"
total="$(jq '.items | length' <<<"$items_json")"
echo "[status] Found $total items"

updated=0
while IFS= read -r item; do
  item_id="$(jq -r '.id' <<<"$item")"
  title="$(jq -r '.content.title // .title // "Draft"' <<<"$item")"
  typename="$(jq -r '.content.__typename // "DraftIssue"' <<<"$item")"
  issue_number="$(jq -r 'try .content.number // empty' <<<"$item")"

  # Map titles to columns: Ph0 → To Do, Ph1/Ph2 → Backlog
  if [[ "$title" == Ph0* ]]; then
    target_col="To Do"
  elif [[ "$title" == Ph1* || "$title" == Ph2* ]]; then
    target_col="Backlog"
  else
    target_col="Backlog"
  fi
  opt_id="${STATUS_OPT[$target_col]}"

  echo "[status]   -> $title → $target_col"

  if [[ -z "${DRY_RUN:-}" ]]; then
    gh project item-edit \
      --id "$item_id" \
      --project-id "$project_id" \
      --field-id "$status_field_id" \
      --single-select-option-id "$opt_id" >/dev/null || true
  fi

  # Optional: label real repo issues by phase
  if [[ -z "${DRY_RUN:-}" && "$typename" == "Issue" && -n "${issue_number:-}" ]]; then
    case "$title" in
      Ph0*) gh issue edit "$issue_number" --add-label Phase0 >/dev/null || true ;;
      Ph1*) gh issue edit "$issue_number" --add-label Phase1 >/dev/null || true ;;
      Ph2*) gh issue edit "$issue_number" --add-label Phase2 >/dev/null || true ;;
    esac
  fi

  updated=$((updated+1))
done < <(jq -c '.items[]' <<<"$items_json")

echo "[status] Updated $updated / $total project items."
