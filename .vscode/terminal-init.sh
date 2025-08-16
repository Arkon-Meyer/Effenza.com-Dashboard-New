# bash init file for this workspace (repo-first)
# Runs for every Integrated Terminal using the "Bash (init)" profile

# Be forgiving—never kill the shell in init
set +e

# Prefer repo-local binaries (e.g., .bin/actionlint)
case ":$PATH:" in
  *":$PWD/.bin:"*) ;; # already present
  *) export PATH="$PWD/.bin:$PATH" ;;
esac

# Opportunistically use Node 20 if nvm exists (no error if missing)
if command -v nvm >/dev/null 2>&1; then
  nvm use 20 >/dev/null 2>&1 || true
fi

HELPERS="${PWD}/scripts/dev-helpers.sh"
if [ -f "$HELPERS" ]; then
  # shellcheck disable=SC1090
  . "$HELPERS" || true
else
  echo "[init] helpers NOT found at: $HELPERS"
fi

# keep interactive conveniences
set +o nounset
