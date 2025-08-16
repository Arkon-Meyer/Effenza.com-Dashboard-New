# bash init file for this workspace (repo-first)
# Runs for every Integrated Terminal using the "Bash (init)" profile

# Be forgiving—never kill the shell in init
set +e

HELPERS="${PWD}/scripts/dev-helpers.sh"

if [ -f "$HELPERS" ]; then
  # shellcheck disable=SC1090
  source "$HELPERS" || true
else
  echo "[init] helpers NOT found at: $HELPERS"
fi

# keep interactive conveniences
set +o nounset
