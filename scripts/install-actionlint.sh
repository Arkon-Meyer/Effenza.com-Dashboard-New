#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-v1.7.1}"
DEST=".bin"
mkdir -p "$DEST"

echo "[install-actionlint] Downloading actionlint ${VERSION} …"
curl -sSfL \
  https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash \
  | bash -s -- -b "$DEST" "$VERSION"

echo "[install-actionlint] Installed to $DEST/actionlint"
"$DEST/actionlint" -version
