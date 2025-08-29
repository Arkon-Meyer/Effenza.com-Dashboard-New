#!/usr/bin/env bash
set -euo pipefail

# ---------- auth helper (drop-in) ----------
ensure_auth() {
  # Prefer explicit env token for this process; else rely on stored gh login
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

  # If we don't yet know owner/number, we can’t probe; return early.
  if [[ -z "${PROJECT_OWNER:-}" || -z "${PROJECT_NUMBER:-}" ]]; then
    return 0
  fi

  # ---- Source of truth: can this token SEE the project? (user or org) ----
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
      Create a **classic PAT (ghp_)** with scopes: project, repo, read:org
      Then either:
        export GH_TOKEN='ghp_...'; or
        printf '%s\n' 'ghp_...' | gh auth login --with-token
EOT
    else
      echo "[auth] Project probe failed for ${PROJECT_OWNER}/#${PROJECT_NUMBER}:" >&2
      echo "$probe" >&2
      echo "[auth] If this looks like a permission issue, use a classic PAT with: project, repo, read:org." >&2
    fi
    exit 1
  fi

  local pid
  pid="$(printf %s "$probe" | jq -r '.data.repositoryOwner.projectV2.id // empty')"
  if [[ -z "$pid" || "$pid" == "null" ]]; then
    echo "[auth] Project probe returned no id. Check owner/number and access." >&2
    exit 1
  fi

  # Soft scope warning (best-effort; not fatal)
  local scopes hdr status
  hdr="$(gh api -i /user 2>/dev/null | tr -d '\r' || true)"
  scopes="$(printf %s "$hdr" | awk 'BEGIN{IGNORECASE=1}/^x-oauth-scopes:/{sub(/^x-oauth-scopes:[[:space:]]*/,"");print}')"
  if [[ -z "$scopes" ]]; then
    status="$(gh auth status -h github.com 2>/dev/null || true)"
    scopes="$(printf %s "$status" | sed -n "s/.*Token scopes: '\(.*\)'.*/\1/p")"
  fi
  scopes=",$scopes,"
  if [[ -n "${PROJECT_OWNER:-}" && "${PROJECT_OWNER}" != "@me" && "$scopes" != *",read:org,"* ]]; then
    echo "[auth] Warning: token lacks 'read:org' (org projects may fail)." >&2
  fi
}

info(){ printf '[auto] %s\n' "$*"; }
debug(){ [[ -n "${DEBUG:-}" ]] && printf '[debug] %s\n' "$*"; }
dry(){ [[ -n "${DRY_RUN:-}" ]] && printf '[dryrun] %s\n' "$*" || eval "$@"; }

: "${PROJECT_OWNER:=Arkon-Meyer}"
: "${PROJECT_NUMBER:=2}"
: "${PROJECT_REPO:=}"   # optional

ensure_auth

# --- Resolve ProjectV2 (user or org) ---
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
[[ -n "$PROJECT_ID" ]] || { echo "[auto] Cannot resolve ProjectV2 id."; exit 1; }

info "Project: ${PROJECT_OWNER}/#${PROJECT_NUMBER}${PROJECT_REPO:+ (repo=$PROJECT_REPO)} ${DRY_RUN:+[DRY_RUN]}"

# --- Load Status field + options ---
FIELDS="$(gh api graphql -f query='
query($id:ID!) {
  node(id:$id){ ... on ProjectV2 {
    fields(first:100){
      nodes{
        __typename
        ... on ProjectV2SingleSelectField { id name options { id name } }
      }
    }
  }}
}' -F id="$PROJECT_ID")"

STATUS_FIELD_ID="$(
  jq -r '.data.node.fields.nodes[]
         | select(.__typename=="ProjectV2SingleSelectField" and .name=="Status") | .id' <<<"$FIELDS"
)"
[[ -n "$STATUS_FIELD_ID" && "$STATUS_FIELD_ID" != "null" ]] || { echo "[auto] Missing Status field on project"; exit 1; }

declare -A STATUS_OPT=()
while IFS='=' read -r n i; do STATUS_OPT["$n"]="$i"; done < <(
  jq -r --arg fid "$STATUS_FIELD_ID" '
    .data.node.fields.nodes[]
    | select(.__typename=="ProjectV2SingleSelectField" and .id==$fid)
    | .options[] | "\(.name)=\(.id)"' <<<"$FIELDS"
)

pick_opt() { # usage: pick_opt "In Progress" "To Do" ...
  local name
  for name in "$@"; do
    if [[ -n "${STATUS_OPT[$name]:-}" ]]; then
      printf '%s\t%s\n' "$name" "${STATUS_OPT[$name]}"; return 0
    fi
  done
  return 1
}

UPDATED=0
AFTER=""

while :; do
  PAGE="$(gh api graphql -f query='
  query($id:ID!,$after:String){
    node(id:$id){ ... on ProjectV2 {
      items(first:100, after:$after){
        nodes{
          id
          content{
            __typename
            ... on Issue { number title state labels(first:50){nodes{name}} }
            ... on PullRequest { number title state isDraft labels(first:50){nodes{name}} }
            ... on DraftIssue { title }
          }
          fieldValues(first:50){
            nodes{
              __typename
              ... on ProjectV2ItemFieldSingleSelectValue {
                field{ __typename ... on ProjectV2SingleSelectField { id name } }
                optionId name
              }
            }
          }
        }
        pageInfo{ hasNextPage endCursor }
      }
    }}
  }' -F id="$PROJECT_ID" ${AFTER:+-F after="$AFTER"})"

  jq -c --arg f "$STATUS_FIELD_ID" '
    .data.node.items.nodes[] |
    {
      itemId: .id,
      type: .content.__typename,
      number: (.content.number // null),
      title: (.content.title // ""),
      state: (.content.state // ""),
      isDraft: (if .content.__typename=="PullRequest" then (.content.isDraft // false) else false end),
      labels: (if .content.labels.nodes then ([.content.labels.nodes[].name] // []) else [] end),
      cur: ([.fieldValues.nodes[]? |
            select(.__typename=="ProjectV2ItemFieldSingleSelectValue") |
            select(.field.__typename=="ProjectV2SingleSelectField" and .field.id==$f)
            ] | first // {name:"",optionId:null})
    }
  ' <<<"$PAGE" | while IFS= read -r row; do
    itemId=$(jq -r '.itemId' <<<"$row")
    type=$(jq -r '.type' <<<"$row")
    num=$(jq -r '.number // empty' <<<"$row")
    title=$(jq -r '.title' <<<"$row")
    state=$(jq -r '.state // ""' <<<"$row")
    isDraft=$(jq -r '.isDraft' <<<"$row")
    curName=$(jq -r '.cur.name // ""' <<<"$row")
    labels_joined=$(jq -r '[.labels[]] | join(" ")' <<<"$row")

    wantName=""; wantOptId=""

    if   [[ "$type" == "Issue" && "$state" == "CLOSED" ]]; then
      read -r wantName wantOptId < <(pick_opt "Done" "Review" "In Progress" "To Do" "Backlog")
    elif [[ "$type" == "PullRequest" && "$state" == "MERGED" ]]; then
      read -r wantName wantOptId < <(pick_opt "Done" "Review" "In Progress" "To Do" "Backlog")
    elif [[ "$type" == "PullRequest" && "$state" == "OPEN" && "$isDraft" == "true" ]]; then
      read -r wantName wantOptId < <(pick_opt "Backlog" "To Do" "In Progress" "Review")
    elif [[ "$type" == "PullRequest" && "$state" == "OPEN" ]]; then
      shopt -s nocasematch
      if [[ " $labels_joined " =~ (review|needs[- ]review|qa) ]]; then
        read -r wantName wantOptId < <(pick_opt "Review" "In Progress" "To Do" "Backlog")
      else
        read -r wantName wantOptId < <(pick_opt "In Progress" "To Do" "Backlog")
      fi
      shopt -u nocasematch
    elif [[ "$type" == "Issue" && "$state" == "OPEN" ]]; then
      shopt -s nocasematch
      if   [[ " $labels_joined " =~ (Phase0|phase:0) ]]; then
        read -r wantName wantOptId < <(pick_opt "To Do" "Backlog")
      elif [[ " $labels_joined " =~ (Phase1|phase:1|Phase2|phase:2) ]]; then
        read -r wantName wantOptId < <(pick_opt "Backlog" "To Do")
      elif [[ " $labels_joined " =~ (Phase3|phase:3|active|doing|wip) ]]; then
        read -r wantName wantOptId < <(pick_opt "In Progress" "To Do" "Backlog")
      elif [[ " $labels_joined " =~ (review) ]]; then
        read -r wantName wantOptId < <(pick_opt "Review" "In Progress" "To Do")
      fi
      shopt -u nocasematch
    fi

    human="#$num"; [[ -z "$num" ]] && human="<no-num>"
    if [[ -z "$wantName" || "$wantName" == "$curName" ]]; then
      info "  -> ${title} ${human} (${type}/${state:-}) → <no change>"
      continue
    fi
    info "  -> ${title} ${human} (${type}/${state:-}) → ${wantName}"

    dry gh api graphql -f query='
      mutation($p:ID!,$i:ID!,$f:ID!,$opt:String!){
        updateProjectV2ItemFieldValue(input:{
          projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$opt}
        }){ projectV2Item { id } }
      }' -F p="$PROJECT_ID" -F i="$itemId" -F f="$STATUS_FIELD_ID" -F opt="$wantOptId"

    [[ -z "${DRY_RUN:-}" ]] && UPDATED=$((UPDATED+1))
  done

  if [[ "$(jq -r '.data.node.items.pageInfo.hasNextPage' <<<"$PAGE")" == "true" ]]; then
    AFTER="$(jq -r '.data.node.items.pageInfo.endCursor' <<<"$PAGE")"
  else
    break
  fi
done

info "Updated $UPDATED items."
