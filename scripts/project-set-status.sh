#!/usr/bin/env bash
set -euo pipefail

# ---------- auth helper (drop-in) ----------
ensure_auth() {
  local TOK="${GH_TOKEN:-${GH_PROJECT_TOKEN:-${GH_PAT:-}}}"
  if [[ -n "$TOK" ]]; then
    case "$TOK" in *YOUR_PAT*|*xxxxx*|'***'|'ghp_…'|'gho_…')
      echo "[auth] Placeholder token detected; set a real token." >&2; exit 1;;
    esac
    printf '%s\n' "$TOK" | gh auth login --with-token >/dev/null 2>&1 \
      || { echo "[auth] Login failed (bad token or network)." >&2; exit 1; }
  else
    gh auth status -h github.com >/dev/null 2>&1 || {
      cat <<'EOT' >&2
[auth] No token and not logged in.
  Use ONE of:
    export GH_TOKEN='<classic PAT with project,repo,read:org>'
    export GH_PROJECT_TOKEN='<same PAT>'
    export GH_PAT='<same PAT>'
  Or: gh auth login --with-token   (paste the PAT once)
EOT
      exit 1
    }
  fi

  if [[ -z "${PROJECT_OWNER:-}" || -z "${PROJECT_NUMBER:-}" ]]; then
    return 0
  fi

  local probe rc
  set +e
  probe="$(
    gh api graphql 2>&1 -f query='
      query($o:String!, $n:Int!){
        repositoryOwner(login:$o){
          __typename
          ... on User         { projectV2(number:$n){ id } }
          ... on Organization { projectV2(number:$n){ id } }
        }
      }' -F o="$PROJECT_OWNER" -F n="$PROJECT_NUMBER"
  )"; rc=$?
  set -e

  if [[ $rc -ne 0 ]]; then
    if echo "$probe" | grep -qi "Resource not accessible by integration"; then
      cat <<'EOT' >&2
[auth] Token is an OAuth/device token (gho_) that cannot access ProjectV2.
      Use a **classic PAT (ghp_)** with scopes: project, repo, read:org
EOT
    else
      echo "[auth] Project probe failed for ${PROJECT_OWNER}/#${PROJECT_NUMBER}:" >&2
      echo "$probe" >&2
    fi
    exit 1
  fi
}

: "${PROJECT_OWNER:=Arkon-Meyer}"
: "${PROJECT_NUMBER:=2}"
: "${PROJECT_REPO:=}" # optional
: "${ISSUE_NUMBER:?ISSUE_NUMBER is required}"
: "${TARGET_STATUS:?TARGET_STATUS is required}"

ensure_auth

PROJECT_ID="$(
  gh api graphql -f query='
    query($o:String!,$n:Int!){
      repositoryOwner(login:$o){
        __typename
        ... on User         { projectV2(number:$n){ id } }
        ... on Organization { projectV2(number:$n){ id } }
      }
    }' -F o="$PROJECT_OWNER" -F n="$PROJECT_NUMBER" \
  | jq -r '.data.repositoryOwner.projectV2.id // empty'
)"
[[ -n "$PROJECT_ID" ]] || { echo "[auto] Could not resolve ProjectV2 id"; exit 1; }

fields_json="$(gh project field-list --owner "$PROJECT_OWNER" "$PROJECT_NUMBER" --format json)"
status_field_id="$(jq -r '.fields[] | select(.name=="Status") | .id' <<<"$fields_json")"
[[ -n "$status_field_id" && "$status_field_id" != "null" ]] || { echo "[auto] No 'Status' field"; exit 1; }

declare -A STATUS_OPT
while IFS='=' read -r name id; do STATUS_OPT["$name"]="$id"; done \
  < <(jq -r '.fields[] | select(.name=="Status") | .options[] | "\(.name)=\(.id)"' <<<"$fields_json")
opt_id="${STATUS_OPT[$TARGET_STATUS]:-}"
[[ -n "${opt_id:-}" ]] || { echo "[auto] Status option '$TARGET_STATUS' not found"; exit 1; }

echo "[auto] Updating issue #$ISSUE_NUMBER → '$TARGET_STATUS'"

item_id="$(
  gh project item-list --owner "$PROJECT_OWNER" "$PROJECT_NUMBER" --format json -L 500 \
  | jq -r --arg num "$ISSUE_NUMBER" '.items[] | select(.content.number|tostring==$num) | .id' | head -n1
)"

if [[ -z "${item_id:-}" ]]; then
  repo_for_url="${PROJECT_REPO:-$(basename "$(git rev-parse --show-toplevel 2>/dev/null || echo .)")}"
  issue_url="https://github.com/${PROJECT_OWNER}/${repo_for_url}/issues/${ISSUE_NUMBER}"
  item_add_json="$(gh project item-add --owner "$PROJECT_OWNER" "$PROJECT_NUMBER" --url "$issue_url" --format json)"
  item_id="$(jq -r '.id' <<<"$item_add_json")"
  echo "[auto] Added issue #$ISSUE_NUMBER to project ($item_id)"
fi

gh project item-edit \
  --id "$item_id" \
  --project-id "$PROJECT_ID" \
  --field-id "$status_field_id" \
  --single-select-option-id "$opt_id" >/dev/null

echo "[auto] Done."
