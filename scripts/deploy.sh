#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PYTHON_BIN="${PYTHON_BIN:-python3}"
NODE_BIN="${NODE_BIN:-npm}"
SKIP_FRONTEND_BUILD="${SKIP_FRONTEND_BUILD:-false}"

if [[ ! -d .venv ]]; then
  "$PYTHON_BIN" -m venv .venv
fi

.venv/bin/python -m pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

if [[ "$SKIP_FRONTEND_BUILD" != "true" ]]; then
  cd frontend-vite
  "$NODE_BIN" ci
  "$NODE_BIN" run build
  cd "$ROOT_DIR"
fi

.venv/bin/python manage.py migrate --noinput
.venv/bin/python manage.py collectstatic --noinput