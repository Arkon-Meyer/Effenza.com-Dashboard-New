# Only in interactive shells
case $- in *i*) ;; *) return ;; esac

HELPERS="${PWD}/scripts/dev-helpers.sh"
if [ -f "$HELPERS" ]; then
  # shellcheck disable=SC1090
  . "$HELPERS" || true
  echo "[init] dev helpers loaded -> gsync, app-restart, free-port, health"
fi
