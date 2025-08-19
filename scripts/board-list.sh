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

# Build TSV (TITLE<TAB>STATUS). STATUS may be empty.
TSV_OUTPUT="$(
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
  ' <<<"$RAW"
)"

# Filtering & printing with a friendly placeholder if empty
FILTER_RAW="${1:-}"
case "$FILTER_RAW" in
  todo)     FILTER="To Do" ;;
  backlog)  FILTER="Backlog" ;;
  done)     FILTER="Done" ;;
  *)        FILTER="" ;;
esac

if [[ -n "$FILTER" ]]; then
  FILTERED="$(printf '%s\n' "$TSV_OUTPUT" | awk -F'\t' -v want="$FILTER" '$2==want { print }')"
  if [[ -z "$FILTERED" ]]; then
    echo "(no items in ${FILTER_RAW})"
  else
    printf '%s\n' "$FILTERED"
  fi
else
  # no filter → print all
  printf '%s\n' "$TSV_OUTPUT"
fi
