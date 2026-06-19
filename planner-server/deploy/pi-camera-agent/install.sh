#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "run_as_root_required" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_SOURCE="$SCRIPT_DIR/fourwall-camera-agent.service"
ENV_SOURCE="$SCRIPT_DIR/fourwall-camera-agent.env.example"

id -u fourwall-camera >/dev/null 2>&1 || useradd --system --home /var/lib/fourwall-camera-agent --shell /usr/sbin/nologin fourwall-camera
install -d -o fourwall-camera -g fourwall-camera -m 0750 /var/lib/fourwall-camera-agent
install -m 0644 "$SERVICE_SOURCE" /etc/systemd/system/fourwall-camera-agent.service

if [ ! -f /etc/fourwall-camera-agent.env ]; then
  install -o root -g fourwall-camera -m 0640 "$ENV_SOURCE" /etc/fourwall-camera-agent.env
  echo "created /etc/fourwall-camera-agent.env; edit it before starting the service"
fi

systemctl daemon-reload
systemctl enable fourwall-camera-agent.service
echo "installed fourwall-camera-agent.service"
