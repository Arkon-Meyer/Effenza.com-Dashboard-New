#!/usr/bin/env bash
# Install actionlint into ./.bin (repo-local).
# Usage: scripts/install-actionlint.sh [version]
# Example: scripts/install-actionlint.sh v1.7.1

set -euo pipefail

VERSION="${1:-v1.7.1}"
DEST=".bin"
BIN="${DEST}/actionlint"

mkdir -p "${DEST}"

if [ -x "${BIN}" ]; then
  echo "[install-actionlint] ${BIN} already exists -> $(${BIN} -version)"
  echo "[install-actionlint] To force re-install, delete ${BIN} and re-run."
  exit 0
fi

echo "[install-actionlint] Downloading actionlint ${VERSION} …"
curl -sSfL \
  https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash \
  | bash -s -- -b "${DEST}" "${VERSION}"

echo "[install-actionlint] Installed to ${BIN}"
"${BIN}" -version || true

# Helpful hint if .bin is not on PATH
case ":${PATH}:" in
  *":${PWD}/${DEST}:"*) ;;
  *) echo "[install-actionlint] TIP: add this to your PATH for convenience:"
     echo "  export PATH=\"\${PATH}:${PWD}/${DEST}\""
     ;;
esac
