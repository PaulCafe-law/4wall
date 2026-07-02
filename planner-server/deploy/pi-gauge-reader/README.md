# Pi Gauge Reader

Pi-local reader for the two rectangular analog amp meters on the Liancheng
injection machine panel camera (`192.168.1.10`).

This module is intentionally separate from the web app build. It runs on the Pi,
reads frames from the local camera, and posts numeric readings to the Fourth Wall
camera-ingest API. The full camera image still returns to the management platform
through the existing camera agent.

## What It Reads

- `PRESS AM METER`, left rectangular meter
- `FLOW AM METER`, right rectangular meter
- Scale: `0, 2, 4, 6, 8, 10`
- Unit: `A` for Phase A

The meter is rectangular, so the reader uses position mapping, not circular dial
angle mapping.

## Install On Raspberry Pi OS Lite 64-bit

```sh
cd /opt/fourwall/pi-gauge-reader
sh install.sh
cp config.example.yaml config.yaml
cp gauges.example.json gauges.json
```

Edit `config.yaml` and set the real RTSP URL plus the real camera device token.
Do not commit this file.

## Calibration UI

Run the calibration app on the Pi:

```sh
. .venv/bin/activate
python -m calibrate.app --config config.yaml --host 127.0.0.1 --port 8090
```

Open it through SSH tunnel or Tailscale:

```sh
ssh -N -L 8090:127.0.0.1:8090 pi@fourwall-factory-pi5
```

Then open:

```text
http://127.0.0.1:8090
```

Calibration steps:

1. Capture a frame.
2. Select each meter ROI.
3. Click four meter corners in this order: top-left, top-right, bottom-right, bottom-left.
4. Click scale points `0, 2, 4, 6, 8, 10` on the warped meter image.
5. Draw the needle search band around the red vertical needle travel area.
6. Save `gauges.json`.
7. Run one-shot reader test.

## Offline Test

Use synthetic samples:

```sh
. .venv/bin/activate
python tools/make_synthetic_samples.py --out runtime/synthetic
python -m reader.main --config config.example.yaml --calibration gauges.example.json --input runtime/synthetic --once
```

Use a real frame saved on the Pi:

```sh
python tools/save_samples.py --config config.yaml --out samples --count 5
python -m reader.main --config config.yaml --input samples --once
```

## Live Reader

```sh
. .venv/bin/activate
python -m reader.main --config config.yaml
```

Health check:

```sh
curl http://127.0.0.1:8091/status
```

Platform API sink:

```yaml
platform:
  enabled: true
  api_base_url: "https://four-wall-api.onrender.com"
  device_token: "REPLACE_WITH_CAMERA_DEVICE_TOKEN"
```

The reader posts to:

```text
POST /v1/camera-ingest/gauge-readings
```

The management platform then exposes the latest values through `/v1/cameras` as
`latestGaugeReadings`, beside the latest camera frame uploaded by the camera agent.

MQTT topic:

```text
4wall/liancheng/injection/m01/gauge/press_am_meter
4wall/liancheng/injection/m01/gauge/flow_am_meter
```

Payload:

```json
{
  "value": 0.0,
  "unit": "A",
  "confidence": 0.93,
  "raw_position": 0.02,
  "ts": "2026-07-02T23:30:00+08:00",
  "source": "live",
  "status": "ok"
}
```

## systemd

Install to `/opt/fourwall/pi-gauge-reader`, copy config to
`/etc/fourwall/gauge-reader/config.yaml`, then:

```sh
sudo cp systemd/fourwall-gauge-reader.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fourwall-gauge-reader
journalctl -u fourwall-gauge-reader -n 100 --no-pager
```

## Resolution Gate

If a warped meter crop is narrower than `camera.min_meter_crop_width_px`, the reader
keeps running but marks readings degraded and caps confidence. Use RTSP main stream,
refocus the camera, or adjust camera angle before expecting <= 2% full-scale error.

## Privacy Boundary

The management platform receives full-frame camera snapshots from the existing
camera agent. The gauge reader itself sends small JSON readings and keeps its debug
crops under `debug.runtime_dir`. When `config.yaml` is stored under `/etc`, set
`debug.runtime_dir` to a writable directory such as `/var/lib/fourwall-gauge-reader`.
