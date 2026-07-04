# Four Wall GPU HMI OCR Reader

This worker runs on the Fourth Wall 3090 machine (`nckusoc`). It reads the HC600 HMI from the fixed camera view, keeps full raw OCR, sends structured observations back to the platform, and optionally asks a locally authenticated GPT command bridge to summarize work-order text.

```text
Latest camera frame
  -> fixed HMI ROI crop
  -> screen-lit detector
  -> PaddleOCR / PP-OCRv5 Traditional Chinese model on 3090
  -> mode classifier: temperature_monitor | machine_monitor | unknown
  -> optional Codex OAuth GPT summary for work-order OCR
  -> POST /v1/camera-ingest/ocr-observations
  -> /cameras and /factory-twin show latest HMI data
```

The worker may also continue posting fixed numeric ROI readings to `/v1/camera-ingest/gauge-readings`.

## Install on nckusoc Linux

```bash
cd /opt/fourwall/gpu-hmi-ocr-reader
bash install.sh
```

`requirements.txt` intentionally installs PaddleOCR but does not install torch or a VLM. If the host needs a specific CUDA Paddle build, pass it explicitly:

```bash
PADDLE_PIP_SPEC='paddlepaddle-gpu==<version>' bash install.sh
```

Use the Paddle package/version that matches nckusoc's CUDA driver. The script prints whether Paddle sees CUDA.

## Install on Windows Dev Box

```powershell
cd planner-server\deploy\gpu-hmi-ocr-reader
.\install.ps1
```

## Configure

```powershell
Copy-Item config.example.yaml config.yaml
```

Set these values in `config.yaml` or environment variables:

- `platform.api_base_url`: `https://four-wall-api.onrender.com`
- `platform.device_token`: the `fwcam_...` token for `PoE Camera 192.168.1.10`
- `frame_source`: production default is `url` mode against `/v1/camera-ingest/latest-frame/image`
- `hmi.roi`: full-frame ROI around the HC600 HMI screen. Current 2560x1440 baseline is `[925, 550, 450, 325]`
- `hmi.fields`: optional fixed numeric ROI fields
- `work_order.roi`: full-frame ROI around the paper work order. Current 2560x1440 baseline is `[900, 120, 550, 335]`
- `ocr.lang`: keep this as `chinese_cht` for Traditional Chinese OCR. Using `ch` loads the Simplified Chinese model and can return Simplified Chinese text.

Never commit `config.yaml`, device tokens, GPT auth cache, or screenshots containing sensitive customer data.

For systemd, store secrets in `/etc/fourwall/hmi-ocr-reader/env`:

```bash
sudo install -d -m 0750 -o fourwall -g fourwall /etc/fourwall/hmi-ocr-reader
sudo tee /etc/fourwall/hmi-ocr-reader/env >/dev/null <<'EOF'
HMI_OCR_ENABLED=true
HMI_OCR_API_BASE_URL=https://four-wall-api.onrender.com
HMI_OCR_DEVICE_TOKEN=fwcam_REPLACE_ME
GPT_SUMMARIZER_ENABLED=true
GPT_AUTH_MODE=account_oauth_dev
GPT_SUMMARY_MODEL=latest
EOF
sudo chmod 0640 /etc/fourwall/hmi-ocr-reader/env
```

Then copy `config.example.yaml` to `/etc/fourwall/hmi-ocr-reader/config.yaml` and keep the token reference as `${HMI_OCR_DEVICE_TOKEN}`.

## GPT Personal Dev Auth

This is a personal development mode, not production auth.

Set:

```yaml
gpt:
  enabled: true
  auth_mode: "account_oauth_dev"
  summary_model: "latest"
  auth_cache_dir: "C:/Users/<you>/.your-gpt-cli-auth"
  command:
    - "your-gpt-cli.exe"
    - "summarize-json"
    - "--model"
    - "{model}"
  timeout_sec: 60
```

The configured command receives JSON on stdin and must print JSON on stdout. It should use a locally logged-in GPT/OpenAI account. The worker does not read browser cookies and does not store OpenAI tokens in the repo.

On nckusoc, the default bridge is `scripts/codex_summary_bridge.py`. It uses the locally logged-in Codex OAuth cache in `~/.codex/auth.json`. If the system Node.js is too old, install a local Node 22 and local Codex CLI:

```bash
mkdir -p ~/.local/opt ~/.local/codex-cli
cd ~/.local/opt
curl -fsSL https://nodejs.org/dist/v22.23.1/node-v22.23.1-linux-x64.tar.xz -o node-v22.tar.xz
rm -rf node-v22 && mkdir node-v22
tar -xJf node-v22.tar.xz -C node-v22 --strip-components=1
PATH="$HOME/.local/opt/node-v22/bin:$PATH" npm install --prefix ~/.local/codex-cli @openai/codex@latest
```

If the command is missing, auth cache is missing, or the account is logged out, the worker sends the OCR observation with:

```json
{ "summaryStatus": "auth_required" }
```

OCR still runs and raw OCR is still saved.

## Offline Test

```bash
. .venv/bin/activate
python -m ocr_worker.main --config config.yaml --input samples/hc600.jpg --once --dry-run
```

The output includes:

- `readings`: fixed ROI numeric readings for the legacy gauge API
- `ocrObservation`: raw OCR lines, detected mode, structured fields, work-order OCR text, and GPT summary status

## Live Run

```bash
. .venv/bin/activate
python -m ocr_worker.main --config /etc/fourwall/hmi-ocr-reader/config.yaml --once --dry-run
python -m ocr_worker.main --config /etc/fourwall/hmi-ocr-reader/config.yaml --once --publish
```

The worker follows `frame_source.interval_sec`, retries frame-source failures with exponential backoff, and logs platform submission failures without stopping OCR.

When the HC600 screen is off, the worker marks `structuredFields.screenVisibility.status = "dark"` and skips HMI OCR for that frame. When the screen turns on, it marks `"lit"`, runs HMI OCR, and writes local samples under `runtime/lit-samples/` for later calibration.

## systemd

```bash
sudo install -D -m 0644 systemd/fourwall-hmi-ocr-reader.service /etc/systemd/system/fourwall-hmi-ocr-reader.service
sudo systemctl daemon-reload
sudo systemctl enable --now fourwall-hmi-ocr-reader
sudo journalctl -u fourwall-hmi-ocr-reader -n 100 --no-pager
```

## Debug

With `debug.save_crops: true`, crops are written to `runtime/crops/` with a rolling retention limit. These files are local debug artifacts and must not be committed.
