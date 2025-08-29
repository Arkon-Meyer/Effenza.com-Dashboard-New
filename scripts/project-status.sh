#!/usr/bin/env bash
set -euo pipefail

: "${PROJECT_OWNER:?PROJECT_OWNER is required}"
: "${PROJECT_NUMBER:?PROJECT_NUMBER is required}"
: "${ISSUE_NUMBER:?ISSUE_NUMBER is required}"

PROJECT_ID="$(
  gh api graphql -f query='query($o:String!,$n:Int!){
    user(login:$o){ projectV2(number:$n){ id } }
    organization(login:$o){ projectV2(number:$n){ id } }
  }' -F o="$PROJECT_OWNER" -F n="$PROJECT_NUMBER" \
  | jq -r '.data | .. | .id? // empty'
)"

CUR=""
FOUND=""
while :; do
  PAGE="$(gh api graphql -f query='
    query($pid:ID!,$after:String){
      node(id:$pid){ ... on ProjectV2{
        items(first:100, after:$after){
          nodes{
            id
            content{ __typename ... on Issue{ number title } }
            fieldValues(first:50){
              nodes{
                __typename
                ... on ProjectV2ItemFieldSingleSelectValue{
                  name
                  field{ __typename ... on ProjectV2SingleSelectField{ name } }
                }
              }
            }
          }
          pageInfo{ hasNextPage endCursor }
        }
      }}
    }' -F pid="$PROJECT_ID" ${CUR:+-F after="$CUR"})"

  out="$(echo "$PAGE" | jq -r --argjson n "$ISSUE_NUMBER" '
    .data.node.items.nodes[]
    | select(.content.__typename=="Issue" and .content.number==$n)
    | "Issue #\(.content.number) – \(.content.title)\nStatus: " +
      ((.fieldValues.nodes[]?
        | select(.__typename=="ProjectV2ItemFieldSingleSelectValue" and .field.name=="Status")
        | .name) // "<unset>")
  ')"
  if [ -n "$out" ]; then
    echo "$out"
    FOUND=1
    break
  fi
  if [ "$(echo "$PAGE" | jq -r '.data.node.items.pageInfo.hasNextPage')" = "true" ]; then
    CUR="$(echo "$PAGE" | jq -r '.data.node.items.pageInfo.endCursor')"
  else
    break
  fi
done

[ -n "$FOUND" ] || echo "Issue #$ISSUE_NUMBER is not on project ${PROJECT_OWNER}/#${PROJECT_NUMBER}"
