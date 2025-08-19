#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   scripts/board-list.sh            # all items
#   scripts/board-list.sh backlog    # only "Backlog"
#   scripts/board-list.sh todo       # only "To Do"
#   scripts/board-list.sh done       # only "Done"

# Ensure we use your user token (not Codespaces integration)
unset GITHUB_TOKEN GH_TOKEN 2>/dev/null || true

: "${PROJECT_OWNER:=Arkon-Meyer}"
: "${PROJECT_NUMBER:=2}"

# Resolve project node ID
PROJECT_ID="$(gh project view "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json | jq -r '.id')"

# Fetch items + field values (Status) via GraphQL
RAW="$(
  gh api graphql -f query='
    query($project: ID!) {
      node(id: $project) {
        ... on ProjectV2 {
          items(first: 100) {
            nodes {
              content {
                ... on Issue { title }
                ... on DraftIssue { title }
              }
              fieldValues(first: 50) {
                nodes {
                  __typename
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    field { __typename ... on ProjectV2SingleSelectField { name } }
                    name
                  }
                }
              }
            }
          }
        }
      }
    }' -f project="$PROJECT_ID"
)"

# Emit strict TSV: TITLE<TAB>STATUS  (STATUS may be empty)
# (Pick the first value of the "Status" single-select, if present)
jq -r '
  .data.node.items.nodes[]
  | {
      title: .content.title,
      status: (
        [
          .fieldValues.nodes[]?
          | select(.__typename=="ProjectV2ItemFieldSingleSelectValue")
          | select(.field.__typename=="ProjectV2SingleSelectField")
          | select(.field.name=="Status")
          | .name
        ] | first // ""
      )
    }
  | [.title, .status] | @tsv
' <<<"$RAW" \
| awk -F'\t' -v want="${1:-}" '
  BEGIN {
    # normalize filter names
    if (want == "todo") want = "To Do";
    else if (want == "backlog") want = "Backlog";
    else if (want == "done") want = "Done";
  }
  {
    title = $1; status = $2;
    if (want == "" || status == want) print title "\t" status;
  }
'
