# Dental Clinic AVTECH Camera Deployment

## Summary

The dental clinic uses an AVTECH DVR/NVR at `192.168.0.10`. The device exposes per-channel JPEG snapshots over HTTP on port `554`:

```text
http://192.168.0.10:554/cgi-bin/guest/Video.cgi?media=JPEG&channel=<n>
```

This is not a normal browser-friendly HTTP port, and Chrome blocks it as an unsafe port. PowerShell `curl.exe` can fetch the snapshots successfully with DVR basic auth. The production deployment therefore uses the existing Fourth Wall camera ingest pipeline with the camera agent running in `http_snapshot` mode.

## Production Shape

```text
AVTECH DVR 192.168.0.10
  |
  | HTTP JPEG snapshot, LAN only
  v
Clinic Windows mini host
  |
  | HTTPS camera ingest API, per-channel device tokens
  v
four-wall-api.onrender.com
  |
  v
Private object storage + camera analysis worker + /cameras UI
```

The first deployment creates one Fourth Wall camera device per active AVTECH channel. Channels that show `VIDEO LOSS` should not be provisioned until a real camera is connected.

## Site

Use a new site named `牙醫診所`.

Initial placeholder location is acceptable:

```json
{
  "name": "牙醫診所",
  "address": "牙醫診所",
  "location": { "lat": 0, "lng": 0 },
  "notes": "AVTECH DVR snapshot ingest placeholder location; replace with surveyed address/coordinates."
}
```

## Agent Mode

The same `planner-server/scripts/camera_agent.py` supports both frame sources:

- `CAMERA_AGENT_FRAME_SOURCE=rtsp`
- `CAMERA_AGENT_FRAME_SOURCE=http_snapshot`

For AVTECH DVR channels, use `http_snapshot` and disable timestamp overlay unless `ffmpeg` is installed on the Windows host:

```text
CAMERA_AGENT_FRAME_SOURCE=http_snapshot
CAMERA_AGENT_TIMESTAMP_OVERLAY_ENABLED=false
```

Each channel runs as its own Windows Scheduled Task. This keeps one failed channel from stopping uploads for the others.

The Windows deployment uses the native PowerShell agent at `planner-server/deploy/windows-camera-agent/fourwall-camera-agent.ps1`. It does not require Python on the clinic host.

## Windows Host Install

Copy a prepared bundle to the clinic Windows host and run PowerShell from the extracted folder:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\install-fourwall-camera-agent.ps1 -Doctor
powershell.exe -ExecutionPolicy Bypass -File .\install-fourwall-camera-agent.ps1 -Once
powershell.exe -ExecutionPolicy Bypass -File .\install-fourwall-camera-agent.ps1
```

Useful operations after install:

```powershell
Get-ScheduledTask -TaskName "FourWallDentalCameraAgent-*"
Get-ScheduledTaskInfo -TaskName "FourWallDentalCameraAgent-Ch1"
Get-Content C:\ProgramData\FourWall\camera-agent\logs\dental-channel1.err.log -Tail 100
Get-Content C:\ProgramData\FourWall\camera-agent\logs\dental-channel1.out.log -Tail 100
powershell.exe -ExecutionPolicy Bypass -File .\uninstall-fourwall-camera-agent.ps1
```

For the PowerShell-native agent, the scheduled task status is the primary health check. `LastTaskResult=267009` means Windows Task Scheduler considers the task currently running.

## Security Notes

- DVR credentials stay only in the Windows host env files.
- Fourth Wall camera device tokens are one-time secrets and must not be committed.
- Do not expose DVR port `554` to the public Internet.
- If remote maintenance is needed, install Tailscale on the Windows host or add a Pi/Tailscale gateway at the clinic.
- The DVR's vendor app can continue to work separately. It is not part of the Fourth Wall ingest path.

## Acceptance Checks

- `curl.exe` on the clinic Windows host downloads valid JPEGs from channels 1 through 6.
- `install-fourwall-camera-agent.ps1 -Doctor` passes for every provisioned channel.
- `install-fourwall-camera-agent.ps1 -Once` uploads one frame per provisioned channel.
- `https://four-wall-web.onrender.com/cameras` shows all dental clinic camera cards with recent frames.
- Turning off one camera channel does not stop the other channels from uploading.
