from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path

import cv2
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reader.capture import CaptureError, capture_frame  # noqa: E402
from reader.config import load_config  # noqa: E402


class SaveCalibrationPayload(BaseModel):
    calibration: dict


def create_app(config_path: Path) -> FastAPI:
    config = load_config(config_path)
    app = FastAPI(title="Gauge Calibration")

    @app.get("/", response_class=HTMLResponse)
    def index() -> str:
        gauges = [
            {
                "id": gauge.id,
                "label": gauge.label,
                "unit": gauge.unit,
                "minVal": gauge.min_val,
                "maxVal": gauge.max_val,
            }
            for gauge in config.gauges
        ]
        return HTML.replace("__GAUGES_JSON__", json.dumps(gauges, ensure_ascii=True))

    @app.get("/api/frame")
    def get_frame() -> dict[str, str]:
        try:
            frame = capture_frame(config.camera)
        except CaptureError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        ok, encoded = cv2.imencode(".jpg", frame)
        if not ok:
            raise HTTPException(status_code=500, detail="frame_encode_failed")
        return {
            "image": "data:image/jpeg;base64," + base64.b64encode(encoded.tobytes()).decode("ascii"),
            "note": "Click ROI, corners, scale marks, and needle band, then save gauges.json.",
        }

    @app.post("/api/save")
    def save_calibration(payload: SaveCalibrationPayload) -> dict[str, str]:
        output_path = config.root_dir / "gauges.json"
        output_path.write_text(json.dumps(payload.calibration, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"status": "saved", "path": str(output_path)}

    return app


HTML = r"""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Gauge Calibration</title>
  <style>
    body { color: #172026; font-family: system-ui, sans-serif; margin: 24px; }
    button, select { margin: 4px 6px 4px 0; padding: 8px 12px; }
    button.active { background: #0f766e; border-color: #0f766e; color: #fff; }
    canvas { border: 1px solid #999; cursor: crosshair; display: block; margin-top: 16px; max-width: 100%; }
    textarea { font-family: ui-monospace, monospace; margin-top: 16px; min-height: 280px; width: 100%; }
    .hint { color: #45525f; line-height: 1.6; max-width: 960px; }
    .panel { border-top: 1px solid #d8dee6; max-width: 1120px; padding: 12px 0; }
    .row { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; }
    .status { background: #f7f9fb; border: 1px solid #d8dee6; padding: 12px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>Gauge Calibration</h1>
  <p class="hint">
    Capture one frame, select a gauge, then click ROI, meter corners, scale marks,
    and the needle search band. The page converts raw-frame clicks into the
    warped-meter coordinates used by the reader.
  </p>
  <div class="panel">
    <div class="row">
      <button id="capture">Capture Frame</button>
      <label>Gauge <select id="gauge"></select></label>
      <button data-mode="roi">ROI 2 clicks</button>
      <button data-mode="rect">Meter corners 4 clicks</button>
      <button data-mode="scale">Scale 0/2/4/6/8/10</button>
      <button data-mode="band">Needle band 2 clicks</button>
      <button id="undo">Clear gauge</button>
      <button id="generate">Generate JSON</button>
      <button id="save">Save JSON</button>
    </div>
  </div>
  <pre id="status" class="status">Capture a frame to start.</pre>
  <canvas id="canvas"></canvas>
  <textarea id="json">{
  "version": 1,
  "camera_id": "192.168.1.10",
  "gauges": {}
}</textarea>
  <script>
    const gauges = __GAUGES_JSON__;
    const scaleValues = [0, 2, 4, 6, 8, 10];
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const statusEl = document.getElementById('status');
    const gaugeSelect = document.getElementById('gauge');
    let mode = 'roi';
    let image = null;
    const state = {};

    for (const gauge of gauges) {
      state[gauge.id] = { roiClicks: [], rectClicks: [], scaleClicks: {}, bandClicks: [] };
      const option = document.createElement('option');
      option.value = gauge.id;
      option.textContent = `${gauge.label} (${gauge.id})`;
      gaugeSelect.appendChild(option);
    }

    function activeGaugeId() {
      return gaugeSelect.value || (gauges[0] && gauges[0].id);
    }

    function setMode(nextMode) {
      mode = nextMode;
      document.querySelectorAll('[data-mode]').forEach((button) => {
        button.classList.toggle('active', button.dataset.mode === mode);
      });
      status(`mode=${mode} gauge=${activeGaugeId()}`);
    }

    document.querySelectorAll('[data-mode]').forEach((button) => {
      button.onclick = () => setMode(button.dataset.mode);
    });
    setMode(mode);

    function status(text) {
      statusEl.textContent = text;
    }

    document.getElementById('capture').onclick = async () => {
      status('capturing...');
      const response = await fetch('/api/frame');
      const payload = await response.json();
      if (!response.ok) {
        status(JSON.stringify(payload, null, 2));
        return;
      }
      image = new Image();
      image.onload = () => {
        canvas.width = image.width;
        canvas.height = image.height;
        draw();
        status(`${image.width}x${image.height}`);
      };
      image.src = payload.image;
    };

    canvas.onclick = (event) => {
      if (!image) {
        status('Capture a frame first.');
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const x = Math.round((event.clientX - rect.left) * canvas.width / rect.width);
      const y = Math.round((event.clientY - rect.top) * canvas.height / rect.height);
      const gauge = state[activeGaugeId()];

      if (mode === 'roi') {
        if (gauge.roiClicks.length >= 2) gauge.roiClicks = [];
        gauge.roiClicks.push([x, y]);
      } else if (mode === 'rect') {
        if (gauge.rectClicks.length >= 4) gauge.rectClicks = [];
        gauge.rectClicks.push([x, y]);
      } else if (mode === 'scale') {
        const nextScale = scaleValues.find((value) => !(String(value) in gauge.scaleClicks));
        if (nextScale === undefined) {
          gauge.scaleClicks = {};
          gauge.scaleClicks[String(scaleValues[0])] = [x, y];
        } else {
          gauge.scaleClicks[String(nextScale)] = [x, y];
        }
      } else if (mode === 'band') {
        if (gauge.bandClicks.length >= 2) gauge.bandClicks = [];
        gauge.bandClicks.push([x, y]);
      }

      draw();
      status(summary(activeGaugeId()));
    };

    document.getElementById('undo').onclick = () => {
      state[activeGaugeId()] = { roiClicks: [], rectClicks: [], scaleClicks: {}, bandClicks: [] };
      draw();
      status(`cleared ${activeGaugeId()}`);
    };

    document.getElementById('generate').onclick = () => {
      try {
        document.getElementById('json').value = JSON.stringify(generateCalibration(), null, 2);
        status('JSON generated. Review it, then save.');
      } catch (error) {
        status(String(error));
      }
    };

    document.getElementById('save').onclick = async () => {
      const calibration = JSON.parse(document.getElementById('json').value);
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calibration })
      });
      status(JSON.stringify(await response.json(), null, 2));
    };

    gaugeSelect.onchange = () => {
      draw();
      status(summary(activeGaugeId()));
    };

    function draw() {
      if (!image) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
      for (const gauge of gauges) drawGauge(gauge.id, gauge.id === activeGaugeId());
    }

    function drawGauge(gaugeId, active) {
      const gauge = state[gaugeId];
      const color = active ? '#00a982' : '#ffb020';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = active ? 3 : 2;
      drawClicks(gauge.roiClicks, 'ROI');
      drawClicks(gauge.rectClicks, 'R');
      for (const [value, point] of Object.entries(gauge.scaleClicks)) labelPoint(point, value, '#ff3355');
      drawClicks(gauge.bandClicks, 'B');
      if (gauge.roiClicks.length === 2) drawRect(gauge.roiClicks[0], gauge.roiClicks[1]);
      if (gauge.rectClicks.length > 1) drawPolyline(gauge.rectClicks, gauge.rectClicks.length === 4);
      if (gauge.bandClicks.length === 2) drawRect(gauge.bandClicks[0], gauge.bandClicks[1]);
    }

    function drawClicks(points, prefix) {
      points.forEach((point, index) => labelPoint(point, `${prefix}${index + 1}`, ctx.fillStyle));
    }

    function labelPoint(point, text, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(point[0], point[1], 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(text, point[0] + 8, point[1] - 8);
    }

    function drawRect(a, b) {
      const x = Math.min(a[0], b[0]);
      const y = Math.min(a[1], b[1]);
      const w = Math.abs(a[0] - b[0]);
      const h = Math.abs(a[1] - b[1]);
      ctx.strokeRect(x, y, w, h);
    }

    function drawPolyline(points, closed) {
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (const point of points.slice(1)) ctx.lineTo(point[0], point[1]);
      if (closed) ctx.closePath();
      ctx.stroke();
    }

    function summary(gaugeId) {
      const gauge = state[gaugeId];
      return [
        `gauge=${gaugeId}`,
        `roi=${gauge.roiClicks.length}/2`,
        `corners=${gauge.rectClicks.length}/4`,
        `scale=${Object.keys(gauge.scaleClicks).length}/6`,
        `band=${gauge.bandClicks.length}/2`,
      ].join(' ');
    }

    function generateCalibration() {
      const output = { version: 1, camera_id: '192.168.1.10', gauges: {} };
      for (const gaugeConfig of gauges) {
        const gauge = state[gaugeConfig.id];
        if (gauge.roiClicks.length !== 2) throw new Error(`${gaugeConfig.id}: ROI needs 2 clicks`);
        if (gauge.rectClicks.length !== 4) throw new Error(`${gaugeConfig.id}: corners need 4 clicks`);
        for (const value of scaleValues) {
          if (!(String(value) in gauge.scaleClicks)) throw new Error(`${gaugeConfig.id}: missing scale ${value}`);
        }

        const roi = normalizeRect(gauge.roiClicks[0], gauge.roiClicks[1]);
        const rectRel = gauge.rectClicks.map((point) => [point[0] - roi[0], point[1] - roi[1]]);
        const size = warpedSize(rectRel);
        const dst = [[0, 0], [size.width - 1, 0], [size.width - 1, size.height - 1], [0, size.height - 1]];
        const H = homography(rectRel, dst);
        const scalePoints = {};
        for (const value of scaleValues) {
          const raw = gauge.scaleClicks[String(value)];
          const warped = transformPoint(H, [raw[0] - roi[0], raw[1] - roi[1]]);
          scalePoints[String(value)] = roundPoint(warped);
        }

        let band = [0, 0, size.width, size.height];
        if (gauge.bandClicks.length === 2) {
          const a = transformPoint(H, [gauge.bandClicks[0][0] - roi[0], gauge.bandClicks[0][1] - roi[1]]);
          const b = transformPoint(H, [gauge.bandClicks[1][0] - roi[0], gauge.bandClicks[1][1] - roi[1]]);
          band = normalizeRect(roundPoint(a), roundPoint(b));
        }

        output.gauges[gaugeConfig.id] = {
          roi,
          rect_corners: rectRel.map(roundPoint),
          scale_points: scalePoints,
          needle_search_band: band,
          needle_color_hint: 'red',
        };
      }
      return output;
    }

    function normalizeRect(a, b) {
      const x = Math.min(a[0], b[0]);
      const y = Math.min(a[1], b[1]);
      return [x, y, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])];
    }

    function roundPoint(point) {
      return [Math.round(point[0]), Math.round(point[1])];
    }

    function warpedSize(points) {
      const [tl, tr, br, bl] = points;
      return {
        width: Math.max(2, Math.round(Math.max(distance(tl, tr), distance(bl, br)))),
        height: Math.max(2, Math.round(Math.max(distance(tl, bl), distance(tr, br)))),
      };
    }

    function distance(a, b) {
      return Math.hypot(a[0] - b[0], a[1] - b[1]);
    }

    function transformPoint(H, point) {
      const [x, y] = point;
      const denom = H[6] * x + H[7] * y + 1;
      return [
        (H[0] * x + H[1] * y + H[2]) / denom,
        (H[3] * x + H[4] * y + H[5]) / denom,
      ];
    }

    function homography(src, dst) {
      const A = [];
      const b = [];
      for (let i = 0; i < 4; i++) {
        const [x, y] = src[i];
        const [u, v] = dst[i];
        A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
        b.push(u);
        A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
        b.push(v);
      }
      return solveLinear(A, b);
    }

    function solveLinear(A, b) {
      const n = b.length;
      const M = A.map((row, i) => row.concat([b[i]]));
      for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let row = col + 1; row < n; row++) {
          if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
        }
        [M[col], M[pivot]] = [M[pivot], M[col]];
        const div = M[col][col];
        if (Math.abs(div) < 1e-9) throw new Error('Invalid meter corners; homography is singular.');
        for (let k = col; k <= n; k++) M[col][k] /= div;
        for (let row = 0; row < n; row++) {
          if (row === col) continue;
          const factor = M[row][col];
          for (let k = col; k <= n; k++) M[row][k] -= factor * M[col][k];
        }
      }
      return M.map((row) => row[n]);
    }
  </script>
</body>
</html>
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8090)
    args = parser.parse_args(argv)
    uvicorn.run(create_app(Path(args.config)), host=args.host, port=args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
