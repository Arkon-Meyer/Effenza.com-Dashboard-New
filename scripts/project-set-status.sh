#!/usr/bin/env bash
set -euo pipefail

# --- Config (env-overridable) ---
: "${PROJECT_OWNER:=Arkon-Meyer}"
: "${PROJECT_NUMBER:=2}"

# Behavior flags
: "${DRY_RUN:=}"   # set non-empty to preview (no writes)
: "${DEBUG:=}"     # set non-empty for extra logs + JSON artifacts

# --- Helpers ---
log()   { printf '%s\n' "$*"; }
info()  { printf '[status] %s\n' "$*"; }
debug() { [[ -n "${DEBUG:-}" ]] && printf '[debug] %s\n' "$*"; }

timed() {
  if [[ -n "${DEBUG:-}" ]]; then
    local label="$1"; shift
    local start end
    start=$(date +%s%3N)
    "$@"
    end=$(date +%s%3N)
    debug "$label took $((end - start))ms"
  else
    "$@"
  fi
}

mkdir -p debug

# --- CI guardrails -----------------------------------------------------------
if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  if ! gh auth status -h github.com >/dev/null 2>&1; then
    echo "::warning::gh is not authenticated. Make sure the workflow logs in with:
      gh auth login --with-token <<< \"\${{ secrets.GH_PROJECT_TOKEN }}\""
  fi
fi

# gh graphql with light retry + debug timestamps
ghgql() {
  local tries=0 max=3 out rc
  while (( tries < max )); do
    if [[ -n "${DEBUG:-}" ]]; then
      >&2 echo "* Request at $(date -u +"%F %T.%N")"
      >&2 echo "* Request to https://api.github.com/graphql"
    fi
    set +e
    out=$(gh api graphql "$@" 2>debug/_stderr.tmp)
    rc=$?
    set -e
    if [[ $rc -eq 0 ]]; then printf '%s' "$out"; return 0; fi
    if grep -qiE 'rate limit|secondary rate|timeout|50[234]' debug/_stderr.tmp; then
      tries=$((tries+1)); sleep $((2**tries)); continue
    fi
    cat debug/_stderr.tmp 1>&2; return $rc
  done
  gh api graphql "$@"
}

# --- Resolve project ID ---
PROJECT_ID="$(gh project view "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json | jq -r '.id // empty')"
if [[ -z "${PROJECT_ID:-}" ]]; then
  echo "::error::Could not resolve ProjectV2 id for ${PROJECT_OWNER}/#${PROJECT_NUMBER}"
  exit 1
fi
info "Target project: ${PROJECT_OWNER}/#${PROJECT_NUMBER} (${PROJECT_ID})"

# --- Resolve Status field + option IDs (paginated) ---
ensure_status_field() {
  local GQL_FIELDS='
    query($project: ID!, $after: String) {
      node(id: $project) {
        ... on ProjectV2 {
          fields(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              __typename
              ... on ProjectV2SingleSelectField {
                id
                name
                options { id name }
              }
            }
          }
        }
      }
    }'

  : > debug/fields.jsonl
  local after="" hasNext="true"
  while [[ "$hasNext" == "true" ]]; do
    [[ -n "${DEBUG:-}" ]] && {
      >&2 echo "* Request at $(date -u +'%F %T.%N')"
      >&2 echo "* Request to https://api.github.com/graphql (fields first=100 after=${after:+<set>})"
    }
    local args=(-f query="$GQL_FIELDS" -F project="$PROJECT_ID")
    [[ -n "$after" ]] && args+=(-F after="$after")
    local page
    page="$(ghgql "${args[@]}")" || { echo "[error] failed to load project fields" >&2; exit 1; }
    [[ -n "${DEBUG:-}" ]] && printf '%s\n' "$page" > "debug/fields_page_${after:-root}.json"
    jq -c '.data.node.fields.nodes[]' <<<"$page" >> debug/fields.jsonl
    hasNext="$(jq -r '.data.node.fields.pageInfo.hasNextPage' <<<"$page")"
    after="$(jq -r '.data.node.fields.pageInfo.endCursor // empty' <<<"$page")"
    if [[ "$hasNext" == "true" && -z "$after" ]]; then
      >&2 echo "[warn] hasNextPage=true but endCursor is empty; stopping pagination."
      hasNext="false"
    fi
  done

  STATUS_FIELD_ID="$(
    jq -r 'select(.__typename=="ProjectV2SingleSelectField" and .name=="Status") | .id' debug/fields.jsonl | head -n1
  )"
  if [[ -z "${STATUS_FIELD_ID:-}" || "${STATUS_FIELD_ID}" == "null" ]]; then
    echo "[error] could not find a single-select field named 'Status' on the project." >&2
    exit 1
  fi

  STATUS_OPT_TODO="$(
    jq -r 'select(.__typename=="ProjectV2SingleSelectField" and .name=="Status") | .options[] | select(.name=="To Do") | .id' debug/fields.jsonl | head -n1
  )"
  STATUS_OPT_BACKLOG="$(
    jq -r 'select(.__typename=="ProjectV2SingleSelectField" and .name=="Status") | .options[] | select(.name=="Backlog") | .id' debug/fields.jsonl | head -n1
  )"
  STATUS_OPT_DONE="$(
    jq -r 'select(.__typename=="ProjectV2SingleSelectField" and .name=="Status") | .options[] | select(.name=="Done") | .id' debug/fields.jsonl | head -n1
  )"

  for v in STATUS_OPT_TODO STATUS_OPT_BACKLOG STATUS_OPT_DONE; do
    if [[ -z "${!v:-}" || "${!v}" == "null" ]]; then
      echo "[error] missing Status option id for one of: To Do / Backlog / Done" >&2
      exit 1
    fi
  done

  [[ -n "${DEBUG:-}" ]] && {
    echo "[debug] Status field: ${STATUS_FIELD_ID}" >&2
    echo "[debug] Options -> To Do=${STATUS_OPT_TODO} | Backlog=${STATUS_OPT_BACKLOG} | Done=${STATUS_OPT_DONE}" >&2
  }
}

ensure_status_field

# Use values discovered
OPT_TODO="$STATUS_OPT_TODO"
OPT_BACKLOG="$STATUS_OPT_BACKLOG"
OPT_DONE="$STATUS_OPT_DONE"

debug "Status field: ${STATUS_FIELD_ID}"
debug "Options -> To Do=${OPT_TODO} | Backlog=${OPT_BACKLOG} | Done=${OPT_DONE}"

# --- Iterate items with paging, decide status, apply ---
UPDATED=0
TOTAL=0
AFTER=""    # empty means "no cursor"; we won’t pass it until set
PAGE=0

while :; do
  PAGE=$((PAGE+1))

  local_query='
  query($id:ID!, $after:String) {
    node(id:$id) { ... on ProjectV2 {
      items(first:100, after:$after) {
        nodes {
          id
          content {
            __typename
            ... on Issue {
              number title state
              labels(first:50) { nodes { name } }
            }
            ... on DraftIssue { title }
            ... on PullRequest {
              number title state isDraft
              labels(first:50) { nodes { name } }
            }
          }
          fieldValues(first:50) {
            nodes {
              __typename
              ... on ProjectV2ItemFieldSingleSelectValue {
                field { __typename ... on ProjectV2SingleSelectField { id name } }
                optionId name
              }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }}
  }'

  args=(-f query="$local_query" -F id="$PROJECT_ID")
  [[ -n "$AFTER" ]] && args+=(-F after="$AFTER")
  ITEMS_JSON="$(ghgql "${args[@]}")"
  [[ -n "${DEBUG:-}" ]] && printf '%s\n' "$ITEMS_JSON" > "debug/items-page-${PAGE}.json"

  # Flatten for bash loop (also expose isDraft for PRs)
  MAP_JSON="$(jq -c --arg statusField "$STATUS_FIELD_ID" '
    .data.node.items.nodes[]
    | {
        itemId: .id,
        type: .content.__typename,
        number: (if .content.__typename=="Issue" or .content.__typename=="PullRequest" then .content.number else null end),
        title: (.content.title // ""),
        state: (.content.state // ""),
        isDraft: (if .content.__typename=="PullRequest" then (.content.isDraft // false) else false end),
        labels: (if .content.labels.nodes then ([.content.labels.nodes[].name] // []) else [] end),
        currentStatus: (
          [
            .fieldValues.nodes[]?
            | select(.__typename=="ProjectV2ItemFieldSingleSelectValue")
            | select(.field.__typename=="ProjectV2SingleSelectField" and .field.id==$statusField)
            | {name: .name, optionId: .optionId}
          ] | first // {name:"", optionId:null}
        )
      }
  ' <<<"$ITEMS_JSON")"

  PAGE_COUNT=$(jq -s 'length' <<<"$MAP_JSON")
  TOTAL=$((TOTAL + PAGE_COUNT))

  while IFS= read -r row; do
    itemId=$(jq -r '.itemId' <<<"$row")
    type=$(jq -r '.type' <<<"$row")
    number=$(jq -r '.number // empty' <<<"$row")
    title=$(jq -r '.title' <<<"$row")
    state=$(jq -r '.state' <<<"$row")
    isDraft=$(jq -r '.isDraft' <<<"$row")
    cur_name=$(jq -r '.currentStatus.name // ""' <<<"$row")
    labels=$(jq -r '[.labels[]] | join(" ")' <<<"$row")

    desired_name=""; desired_opt=""

    # --- Rules ---

    # A) CLOSED issue → Done
    if [[ "$type" == "Issue" && "$state" == "CLOSED" ]]; then
      desired_name="Done"; desired_opt="$OPT_DONE"

    # B) Pull requests:
    elif [[ "$type" == "PullRequest" ]]; then
      if [[ "$state" == "MERGED" ]]; then
        desired_name="Done"; desired_opt="$OPT_DONE"
      elif [[ "$state" == "OPEN" && "$isDraft" == "true" ]]; then
        desired_name="Backlog"; desired_opt="$OPT_BACKLOG"
      elif [[ "$state" == "OPEN" ]]; then
        desired_name="To Do"; desired_opt="$OPT_TODO"
      fi

    # C) OPEN issue + labels reassert column
    elif [[ "$type" == "Issue" && "$state" == "OPEN" ]]; then
      shopt -s nocasematch
      if   [[ " $labels " =~ (^|[[:space:]])(Phase0|phase:0)([[:space:]]|$) ]]; then
        desired_name="To Do"; desired_opt="$OPT_TODO"
      elif [[ " $labels " =~ (^|[[:space:]])(Phase1|phase:1|Phase2|phase:2)([[:space:]]|$) ]]; then
        desired_name="Backlog"; desired_opt="$OPT_BACKLOG"
      fi
      shopt -u nocasematch
    fi

    # --- Logging & apply ---
    human="#${number}"; [[ -z "$number" ]] && human="<no-num>"

    if [[ -z "$desired_name" ]]; then
      info "  -> ${title} ${human} (${type}/${state:-UNKNOWN}) → <no change>"
      continue
    fi
    if [[ "$desired_name" == "$cur_name" ]]; then
      info "  -> ${title} ${human} (${type}/${state:-UNKNOWN}) → <no change>"
      continue
    fi

    info "  -> ${title} ${human} (${type}/${state:-UNKNOWN}) → ${desired_name}"

    # Apply (unless DRY_RUN)
    if [[ -z "${DRY_RUN:-}" ]]; then
      if [[ -z "${desired_opt:-}" ]]; then
        echo "[warn] no optionId for ${title} #${number}; skipping"
      else
        debug "  ↳ updating ${itemId} to optionId='${desired_opt}' (field=${STATUS_FIELD_ID})"
        timed "updateProjectV2ItemFieldValue" ghgql -f query='
        mutation($project:ID!, $item:ID!, $field:ID!, $opt:String!) {
          updateProjectV2ItemFieldValue(
            input:{
              projectId:$project,
              itemId:$item,
              fieldId:$field,
              value:{ singleSelectOptionId:$opt }
            }
          ) { projectV2Item { id } }
        }' \
          -f project="$PROJECT_ID" \
          -f item="$itemId" \
          -f field="$STATUS_FIELD_ID" \
          -f opt="$desired_opt" >/dev/null
        UPDATED=$((UPDATED+1))
      fi
    fi

  done <<<"$MAP_JSON"

  has_next=$(jq -r '.data.node.items.pageInfo.hasNextPage' <<<"$ITEMS_JSON")
  if [[ "$has_next" == "true" ]]; then
    AFTER="$(jq -r '.data.node.items.pageInfo.endCursor // empty' <<<"$ITEMS_JSON")"
    if [[ -z "$AFTER" ]]; then
      >&2 echo "[warn] hasNextPage=true but endCursor is empty; stopping pagination."
      break
    fi
  else
    break
  fi
done

info "Found $TOTAL items"
info "Updated $UPDATED / $TOTAL project items."
