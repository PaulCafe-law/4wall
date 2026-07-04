#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"

cd "$ROOT_DIR"
"$PYTHON_BIN" -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

if [ ! -f config.yaml ]; then
  cp config.example.yaml config.yaml
  echo "Created config.yaml from config.example.yaml. Set TWIN_AGENT_ENABLED=true, TWIN_AGENT_API_BASE_URL, and TWIN_AGENT_WORKER_TOKEN before live polling."
fi
