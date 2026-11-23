#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export CARGO_TARGET_DIR="$REPO_ROOT/.build-target"
export TMPDIR="$REPO_ROOT/.build-tmp"
mkdir -p -- "$CARGO_TARGET_DIR" "$TMPDIR"

for dependency in pnpm cargo-tauri; do
    if ! command -v "$dependency" >/dev/null 2>&1; then
        printf 'Error: %s is required but was not found in PATH.\n' "$dependency" >&2
        exit 1
    fi
done

cd -- "$REPO_ROOT/ui"
pnpm build

cd -- "$REPO_ROOT"
cargo tauri build --bundles deb

printf 'Debian packages:\n'
find "$CARGO_TARGET_DIR" -type f -name '*.deb' -path '*/bundle/deb/*' -print
