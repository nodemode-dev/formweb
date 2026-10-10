#!/usr/bin/env bash
FORMWEB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORMWEB_PYTHON="$FORMWEB_ROOT/backend/venv/bin/python"
if [ ! -x "$FORMWEB_PYTHON" ]; then
  FORMWEB_PYTHON="${FORMWEB_PYTHON_BIN:-python3}"
fi
FORMWEB_CARGO="$(command -v cargo || true)"
if [ -z "$FORMWEB_CARGO" ] && [ -x "$HOME/.cargo/bin/cargo" ]; then
  FORMWEB_CARGO="$HOME/.cargo/bin/cargo"
fi
export FORMWEB_ROOT FORMWEB_PYTHON FORMWEB_CARGO
fw_say() { printf '[formweb] %s\n' "$*"; }
fw_require() { command -v "$1" >/dev/null 2>&1 || { fw_say "missing $1" >&2; exit 1; }; }
