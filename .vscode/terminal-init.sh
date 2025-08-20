# overwrite the file with the full script
cat > scripts/project-set-status.sh <<'BASH'
#!/usr/bin/env bash
set -euo pipefail

# --- Auth: force gh to use your personal token, not the integration token ---
unset GITHUB_TOKEN GH_TOKEN || true
export GH_TOKEN="${GH_TOKEN:-$(gh auth token 2>/dev/null || true)}"

: "${PROJECT_OWNER:=Arkon-Meyer}"
: "${PROJECT_NUMBER:=2}"

debug() { [[ "${DEBUG:-}" == "1" ]] && echo "$*" 1>&2 || true; }
say()   { echo "$*"; }

# --- Resolve Project ID ---
PROJECT_ID="$(gh project view "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json | jq -r '.id')"
say "[status] Target project: ${PROJECT_OWNER}/#${PROJECT_NUMBER} (${PROJECT_ID})"

# --- Load 'Status' field & option IDs ---
FIELDS_JSON="$(gh api graphql -f query='
  query($pid: ID!) {
    node(id: $pid) {
      ... on ProjectV2 {
        fields(first: 50) {
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
  }' -f pid="$PROJECT_ID")"

STATUS_FIELD_ID="$(jq -r '
  .data.node.fields.nodes[]
  | select(.__typename=="ProjectV2SingleSelectField" and .name=="Status")
  | .id' <<<"$FIELDS_JSON")"

opt_id() {
  # $1 = option name
  jq -r --arg name "$1" '
    .data.node.fields.nodes[]
    | select(.__typename=="ProjectV2SingleSelectField" and .name=="Status")
    | .options[] | select(.name==$name) | .id
  ' <<<"$FIELDS_JSON"
}

OPT_TODO="$(opt_id "To Do" || true)"
OPT_BACKLOG="$(opt_id "Backlog" || true)"
OPT_DONE="$(opt_id "Done" || true)"

if [[ -z "${STATUS_FIELD_ID:-}" || -z "${OPT_TODO:-}" || -z "${OPT_BACKLOG:-}" || -z "${OPT_DONE:-}" ]]; then
  echo "[error] Missing Status field or one of its options (To Do / Backlog / Done). Check your project fields." >&2
  exit 1
fi
debug "[debug] Status field: $STATUS_FIELD_ID"
debug "[debug] Options -> To Do=$OPT_TODO | Backlog=$OPT_BACKLOG | Done=$OPT_DONE"

# --- Fetch up to 100 items (adjust if your board grows) ---
ITEMS_JSON="$(gh api graphql -f query='
  query($pid: ID!) {
    node(id: $pid) {
      ... on ProjectV2 {
        items(first: 100) {
          nodes {
            id
            content {
              __typename
              ... on Issue {
                number
                state
                title
                labels(first: 50) { nodes { name } }
              }
              ... on DraftIssue {
                title
              }
            }
            fieldValues(first: 20) {
              nodes {
                __typename
                ... on ProjectV2ItemFieldSingleSelectValue {
                  field { __typename ... on ProjectV2SingleSelectField { name } }
                  name
                  optionId
                }
              }
            }
          }
        }
      }
    }
  }' -f pid="$PROJECT_ID")"

# Build a compact list for processing
MAP_JSON="$(jq -c '
  .data.node.items.nodes[]
  | {
      itemId: .id,
      number: (.content.__typename=="Issue")? // false | .content.number,
      title:  .content.title,
      state:  (if .content.__typename=="Issue" then .content.state else "OPEN" end),
      labels: (if .content.__typename=="Issue" then (.content.labels.nodes[]?.name) else [] end),
      statusOptionId: (
        [
          .fieldValues.nodes[]?
          | select(.__typename=="ProjectV2ItemFieldSingleSelectValue")
          | select(.field.__typename=="ProjectV2SingleSelectField")
          | select(.field.name=="Status")
          | .optionId
        ] | first // ""
      )
    }
' <<<"$ITEMS_JSON")"

COUNT="$(jq -s 'length' <<<"$MAP_JSON")"
say "[status] Found ${COUNT} items"

UPDATED=0

# Decide target option for each item
while IFS= read -r row; do
  itemId="$(jq -r '.itemId' <<<"$row")"
  title="$(jq -r '.title' <<<"$row")"
  number="$(jq -r '.number // empty' <<<"$row")"
  state="$(jq -r '.state'  <<<"$row")"
  curOpt="$(jq -r '.statusOptionId' <<<"$row")"
  labels="$(jq -r '.labels' <<<"$row")"

  # Compute target status name
  targetName=""
  targetOpt=""

  if [[ "$state" == "CLOSED" ]]; then
    targetName="Done";    targetOpt="$OPT_DONE"
  else
    # Label hints:
    #   Phase0 OR phase:0  -> To Do
    #   Phase1/2 or phase:1/2 -> Backlog
    if jq -e 'index("Phase0") or index("phase:0")' <<<"$labels" >/dev/null 2>&1; then
      targetName="To Do"; targetOpt="$OPT_TODO"
    elif jq -e 'index("Phase1") or index("phase:1") or index("Phase2") or index("phase:2")' <<<"$labels" >/dev/null 2>&1; then
      targetName="Backlog"; targetOpt="$OPT_BACKLOG"
    else
      targetName="Backlog"; targetOpt="$OPT_BACKLOG"
    fi
  fi

  # Pretty ref (Issue # or Draft)
  ref="#${number:-draft}"

  debug "[debug] ${ref} state='${state}' labels='$(jq -r 'join(",")' <<<"$labels" 2>/dev/null || true)'"
  if [[ -z "$targetOpt" ]]; then
    say "[status]   -> ${title} ${ref} (${state}) → <skip: no target option>"
    continue
  fi

  if [[ "$curOpt" == "$targetOpt" ]]; then
    say "[status]   -> ${title} ${ref} (${state}) → <no change>"
    continue
  fi

  say "[status]   -> ${title} ${ref} (${state}) → ${targetName}"

  if [[ "${DRY_RUN:-}" == "1" ]]; then
    continue
  fi

  # Apply mutation
  gh api graphql -f query='
    mutation($project: ID!, $item: ID!, $field: ID!, $opt: String!) {
      updateProjectV2ItemFieldValue(input:{
        projectId: $project,
        itemId: $item,
        fieldId: $field,
        value: { singleSelectOptionId: $opt }
      }) { clientMutationId }
    }' \
    -f project="$PROJECT_ID" \
    -f item="$itemId" \
    -f field="$STATUS_FIELD_ID" \
    -f opt="$targetOpt" >/dev/null

  UPDATED=$((UPDATED+1))
done <<<"$MAP_JSON"

say "[status] Updated ${UPDATED} / ${COUNT} project items."
BASH

chmod +x scripts/project-set-status.sh
