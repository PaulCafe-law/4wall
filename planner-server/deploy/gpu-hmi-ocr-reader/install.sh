#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if command -v apt-get >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y python3-venv python3-pip
elif ! python3 -m venv --help >/dev/null 2>&1; then
  echo "python3-venv is not installed and sudo is not available. Install python3-venv first." >&2
  exit 1
fi

python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

if [[ -n "${PADDLE_PIP_SPEC:-}" ]]; then
  python -m pip install --upgrade ${PADDLE_PIP_SPEC}
fi

python - <<'PY'
import importlib.util

print("FOURWALL_HMI_OCR_READER_READY")
if importlib.util.find_spec("paddle") is None:
    print("PADDLE_STATUS missing: install paddlepaddle or paddlepaddle-gpu for this host")
else:
    import paddle

    print(f"PADDLE_VERSION {paddle.__version__}")
    print(f"PADDLE_CUDA {paddle.device.is_compiled_with_cuda()}")
    try:
        print(f"PADDLE_DEVICE {paddle.device.get_device()}")
    except Exception as exc:
        print(f"PADDLE_DEVICE unknown: {exc}")
PY
