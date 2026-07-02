#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

sudo apt-get update
sudo apt-get install -y python3-venv ffmpeg

python3 -m venv "$SCRIPT_DIR/.venv"
. "$SCRIPT_DIR/.venv/bin/activate"
python -m pip install --upgrade pip
python -m pip install -r "$SCRIPT_DIR/requirements.txt"

mkdir -p "$SCRIPT_DIR/runtime/debug" "$SCRIPT_DIR/runtime/queue" "$SCRIPT_DIR/samples"

echo "Installed pi-gauge-reader in $SCRIPT_DIR"
echo "Copy config.example.yaml to config.yaml and gauges.example.json to gauges.json before starting."
