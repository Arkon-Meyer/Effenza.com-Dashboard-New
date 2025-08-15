# Only in interactive shells
case $- in *i*) ;; *) return ;; esac

HELPERS="${PWD}/scripts/dev-helpers.sh"
if [ -f "$HELPERS" ]; then
  # shellcheck source=/dev/null
  . "$HELPERS" || true
  echo "[init] dev helpers loaded → gsync, app-restart, free-port, health"
fi
