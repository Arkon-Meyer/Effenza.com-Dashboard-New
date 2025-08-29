#!/usr/bin/env bash
set -euo pipefail

# --- dependencies (fail fast) ---
for b in gh jq; do command -v "$b" >/dev/null || { echo "[apply] missing $b"; exit 1; }; done

# ---- Auth helper (shared) ---------------------------------------------------
ensure_auth() {
  # Precedence: explicit token envs > stored gh login
  local TOK="${GH_TOKEN:-${GH_PROJECT_TOKEN:-${GH_PAT:-}}}"

  # Block obvious placeholders
  if [[ -n "$TOK" ]]; then
    case "$TOK" in *YOUR_PAT*|*xxxxx*|'***'|'ghp_…'|'gho_…')
      echo "[auth] Placeholder-looking token in env; set a real PAT." >&2
      exit 1;;
    esac
  fi

  # Ensure gh is authenticated for this shell
  if [[ -n "$TOK" ]]; then
    if ! printf '%s\n' "$TOK" | gh auth login --with-token >/dev/null 2>&1; then
      echo "[auth] Login failed (bad token or network)." >&2
      exit 1
    fi
  else
    if ! gh auth status -h github.com >/dev/null 2>&1; then
      cat <<'EOT' >&2
[auth] No token and not logged in.
  Use ONE of:
    export GH_TOKEN='<classic PAT with project,repo,read:org>'
    export GH_PROJECT_TOKEN='<same PAT>'
    export GH_PAT='<same PAT>'
  Or: gh auth login --with-token   (paste the PAT once)
EOT
      exit 1
    fi
  fi

  # ---- Live API probe instead of parsing scopes ----
  # 1) Basic auth sanity
  if ! gh api graphql -f query='query{ viewer{ login } }' >/dev/null 2>&1; then
    echo "[auth] Auth probe failed; run 'gh auth login' again." >&2
    exit 1
  fi

  # 2) Project access probe (uses PROJECT_OWNER/NUMBER if set)
  if [[ -n "${PROJECT_OWNER:-}" && -n "${PROJECT_NUMBER:-}" ]]; then
    # Try user then org; capture error text for helpful messages
    local probe
    set +e
    probe="$(gh api graphql -f query='
      query($o:String!,$n:Int!){
        user(login:$o){ projectV2(number:$n){ id } }
        organization(login:$o){ projectV2(number:$n){ id } }
      }' -F o="$PROJECT_OWNER" -F n="$PROJECT_NUMBER" 2>&1)"
    local rc=$?
    set -e
    if [[ $rc -ne 0 ]]; then
      echo "[auth] Project probe failed for ${PROJECT_OWNER}/#${PROJECT_NUMBER}:" >&2
      echo "$probe" >&2
      echo "[auth] If you see “Resource not accessible by integration”, use a *classic PAT* with scopes: project, repo, read:org." >&2
      exit 1
    fi
    # Additionally, confirm we actually got an id (not null)
    local pid
    pid="$(printf %s "$probe" | jq -r '.data.user.projectV2.id // .data.organization.projectV2.id // empty' 2>/dev/null || true)"
    if [[ -z "$pid" ]]; then
      echo "[auth] Project probe succeeded but returned no id. Check owner/number and that you can access this ProjectV2." >&2
      exit 1
    fi
  fi
}
  # ---- Read scopes robustly (prefer gh auth status) ----
  local scopes
  scopes="$(gh auth status -h github.com 2>/dev/null | sed -n "s/.*Token scopes: '\(.*\)'.*/\1/p")"

  if [[ -z "$scopes" ]]; then
    # Soft fallback to header sniffing; do not trip -euo pipefail on this probe
    set +e
    local hdr rc
    hdr="$(gh api --silent --timeout 10s -i / 2>/dev/null)"
    rc=$?
    set -e
    if [[ $rc -eq 0 ]]; then
      # header key is x-oauth-scopes (case-insensitive); strip CR
      scopes="$(printf %s "$hdr" | awk 'BEGIN{IGNORECASE=1}/^x-oauth-scopes:/{sub(/\r$/,"");$1="";sub(/^:[[:space:]]*/,"");print}')"
    fi
  fi

  # If still empty, warn and continue; downstream API calls will fail loudly if scopes are wrong
  if [[ -z "$scopes" ]]; then
    echo "[auth] Warning: could not read token scopes; continuing. If calls fail, ensure the token is a *classic PAT* with: project, repo, read:org." >&2
    return 0
  fi

  # Validate required scopes (advisory; do not over-constrain org/user)
  case ",$scopes," in
    *,project,* ) : ;;
    *) echo "[auth] Missing 'project' scope. Use a *classic PAT* with: project, repo, read:org." >&2; exit 1;;
  esac

  case ",$scopes," in
    *,repo,* ) : ;;
    *) echo "[auth] Missing 'repo' scope. Edit PAT to include: repo." >&2; exit 1;;
  esac

  if [[ -n "${PROJECT_OWNER:-}" && "${PROJECT_OWNER}" != "@me" ]]; then
    case ",$scopes," in
      *,read:org,* ) : ;;
      *) echo "[auth] Warning: token lacks 'read:org' (org-owned projects may error)." >&2;;
    esac
  fi
}

  # Read scopes from API header (case-insensitive)
  local scopes
  scopes="$(gh api --silent --timeout 20s -i /user 2>/dev/null \
            | awk 'BEGIN{IGNORECASE=1}/^x-oauth-scopes:/{sub(/\r$/,"");$1="";sub(/^:[[:space:]]*/,"");print}')"
  if [[ -z "$scopes" ]]; then
    # fallback to parsing `gh auth status` (less reliable)
    scopes="$(gh auth status -h github.com 2>/dev/null | sed -n "s/.*Token scopes: '\(.*\)'.*/\1/p")"
  fi
  scopes=",$scopes,"

  # IMPORTANT: 'project' is a classic PAT scope (cannot be added to device tokens)
  [[ "$scopes" == *",project,"* ]] || { echo "[auth] Missing 'project' scope. Use a classic PAT (project, repo, read:org)."; exit 1; }
  [[ "$scopes" == *",repo,"*    ]] || { echo "[auth] Missing 'repo' scope."; exit 1; }
  if [[ -n "${PROJECT_OWNER:-}" && "${PROJECT_OWNER}" != "@me" && "$scopes" != *",read:org,"* ]]; then
    echo "[auth] Warning: token lacks 'read:org' (org projects may fail)."
  fi
}

# ---------------- main ----------------
cfg="${1:-.project-sync.json}"

ensure_auth

[[ -f "$cfg" ]] || { echo "[apply] config file not found: $cfg"; exit 1; }

# Read project coordinates (env can override file)
PROJECT_OWNER="${PROJECT_OWNER:-$(jq -r '.projectOwner // empty' "$cfg")}"
PROJECT_NUMBER="${PROJECT_NUMBER:-$(jq -r '.projectNumber // empty' "$cfg")}"
PROJECT_REPO="${PROJECT_REPO:-$(jq -r '.projectRepo // empty' "$cfg")}"   # only used to build issue URLs
[[ -n "$PROJECT_OWNER" && -n "$PROJECT_NUMBER" ]] || { echo "[apply] projectOwner/projectNumber missing"; exit 1; }

# Auth again now that PROJECT_OWNER is known (for read:org warning)
ensure_auth

echo "[apply] Target project: ${PROJECT_OWNER}/#${PROJECT_NUMBER}${PROJECT_REPO:+ (issue repo=$PROJECT_REPO)} ${DRY_RUN:+[DRY_RUN]}"

# Early project id check (GraphQL: user/org ProjectV2)
PROJECT_ID="$(
  gh api --silent --timeout 20s graphql -f query='
    query($owner:String!,$num:Int!){
      user(login:$owner){ projectV2(number:$num){ id } }
      organization(login:$owner){ projectV2(number:$num){ id } }
    }' -F owner="$PROJECT_OWNER" -F num="$PROJECT_NUMBER" \
  | jq -r '.data.user.projectV2.id // .data.organization.projectV2.id // empty'
)"
[[ -n "$PROJECT_ID" ]] || { echo "[apply] cannot resolve ProjectV2 id — check owner/number and token scopes."; exit 1; }

dry() { [[ -n "${DRY_RUN:-}" ]] && printf '[dryrun] %s\n' "$*" || eval "$@"; }

# 1) Explicit moves
if jq -e '.explicit | length>0' >/dev/null 2>&1 <"$cfg"; then
  echo "[apply] Explicit moves:"
  [[ -x scripts/project-set-status.sh ]] || { echo "[apply] scripts/project-set-status.sh not executable"; exit 1; }
  jq -c '.explicit[]' "$cfg" | while IFS= read -r row; do
    num="$(jq -r '.issue'  <<<"$row")"
    st="$(jq  -r '.status' <<<"$row")"
    [[ -n "$num" && -n "$st" ]] || { echo "  - skip row (missing issue/status): $row"; continue; }
    echo "  #${num} → ${st}"
    if [[ -n "${DRY_RUN:-}" ]]; then
      echo "[dryrun] ISSUE_NUMBER=$num TARGET_STATUS='$st' PROJECT_OWNER=$PROJECT_OWNER PROJECT_NUMBER=$PROJECT_NUMBER PROJECT_REPO=$PROJECT_REPO ./scripts/project-set-status.sh"
    else
      ISSUE_NUMBER="$num" TARGET_STATUS="$st" PROJECT_OWNER="$PROJECT_OWNER" PROJECT_NUMBER="$PROJECT_NUMBER" PROJECT_REPO="$PROJECT_REPO" ./scripts/project-set-status.sh
    fi
  done
else
  echo "[apply] No explicit moves."
fi

# 2) Reconcile board via rules
if jq -e '.rules? // empty' >/dev/null 2>&1 <"$cfg"; then
  echo "[apply] Reconcile via project-auto-status.sh"
  [[ -x scripts/project-auto-status.sh ]] || { echo "[apply] scripts/project-auto-status.sh not executable"; exit 1; }
  if [[ -n "${DRY_RUN:-}" ]] ; then
    echo "[dryrun] PROJECT_OWNER=$PROJECT_OWNER PROJECT_NUMBER=$PROJECT_NUMBER PROJECT_REPO=$PROJECT_REPO ./scripts/project-auto-status.sh"
  else
    PROJECT_OWNER="$PROJECT_OWNER" PROJECT_NUMBER="$PROJECT_NUMBER" PROJECT_REPO="$PROJECT_REPO" ./scripts/project-auto-status.sh
  fi
else
  echo "[apply] No rules section — skipping reconcile."
fi

echo "[apply] Done."
