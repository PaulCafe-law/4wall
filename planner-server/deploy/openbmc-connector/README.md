# 4WALL OpenBMC Connector

This service joins the existing `openbmc_final` Raspberry Pi 5 demonstration to
the 4WALL planner server without exposing the LAN collector to the browser or
cloud. It is outbound-only:

```text
Pi5 agent
  -> QEMU OpenBMC sidecar
  -> nckusoc collector (GET /api/state)
  -> this connector
  -> outbound HTTPS to the 4WALL API
```

The current lab topology depends on an SSH reverse tunnel that makes the Pi5
agent available to the QEMU/OpenBMC relay on `nckusoc` (currently via local port
`18081`). The connector does not create, inspect, or repair that tunnel. It
reads only the collector at port `8080`; if the relay tunnel is down, the
collector eventually reports stale data and 4WALL fails closed.

## Security boundary

- The cloud never supplies a collector URL, HTTP method, path, query key, shell
  command, environment variable name, or header.
- The only local write mappings are:
  - `fan_boost` -> `POST /api/fan/boost?seconds=1..60`
  - `reset_dry_run` -> `POST /api/reset?dry_run=true`
- There is no mapping for real reset, simulated critical state, arbitrary
  Redfish, shell, subprocess, SQL, or file access.
- The cloud API must use certificate-verified HTTPS. Redirects are rejected.
- The collector defaults to loopback. A private IP or hostname must be
  explicitly allowlisted in the local config; it can never be changed by a
  cloud command.
- The connector token is read from an environment variable and is never stored
  in connector state or printed.
- State is bounded, atomically replaced, and mode `0600` where supported.

## Collector truth and command results

The legacy collector marks a command `delivered` as soon as the QEMU sidecar
takes it. Delivery is not execution success.

The connector reports `accepted_by_collector` and, when visible,
`delivered_to_agent`. It only reports terminal success when a new,
command-specific QEMU event has the exact returned numeric local command ID and
the fixed success phrase. It reports a fixed failure for a matching failure
event. If the event cannot be reconciled before the lease expires, it reports
`execution_unverified`; it never upgrades delivery alone to success.

Both historical event spellings `command id=42` and `command id 42` are
recognized with an exact numeric boundary. An old event from before the local
dispatch time is ignored.

## Install

Run this service on `nckusoc` beside the collector when possible.

```bash
sudo useradd --system --home /nonexistent --shell /usr/sbin/nologin fourwall-openbmc
sudo install -d -o root -g root -m 0755 /opt/fourwall/openbmc-connector
sudo install -d -o root -g fourwall-openbmc -m 0750 /etc/fourwall-openbmc-connector
sudo install -d -o fourwall-openbmc -g fourwall-openbmc -m 0700 /var/lib/fourwall-openbmc-connector
sudo cp -R fourwall_openbmc_connector /opt/fourwall/openbmc-connector/
sudo cp config.example.json /etc/fourwall-openbmc-connector/config.json
sudo cp fourwall-openbmc-connector.env.example /etc/fourwall-openbmc-connector/connector.env
sudo chmod 0600 /etc/fourwall-openbmc-connector/connector.env
```

Put the provisioned `fwobmc_...` token in `connector.env`. With the connector
on `nckusoc`, keep:

```text
FOURWALL_OPENBMC_COLLECTOR_URL=http://127.0.0.1:8080
```

If the connector must run on another trusted LAN host, set the URL to the
private literal IP and set `collector.allow_private_lan=true`, or add the exact
lowercase hostname (for example `nckusoc`) to
`collector.allowed_hostnames`. Do not enable a public host.

Smoke-test with the hardened service itself so the token never appears in a
command line:

```bash
sudo cp systemd/fourwall-openbmc-connector.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start fourwall-openbmc-connector.service
sudo journalctl -u fourwall-openbmc-connector.service -n 30 --no-pager
```

When the smoke check is clean, enable it at boot:

```bash
sudo systemctl enable fourwall-openbmc-connector.service
```

## Operations runbook

Check the local source first:

```bash
curl --fail --silent --show-error http://127.0.0.1:8080/api/state
```

Then check the connector:

```bash
systemctl status fourwall-openbmc-connector.service --no-pager
journalctl -u fourwall-openbmc-connector.service -n 100 --no-pager
```

Logs contain fixed error codes, device-safe lifecycle messages, and counts.
They intentionally omit the token, request/response bodies, collector URL,
local event messages, and command arguments.

Common fail-closed outcomes:

- `collector_network_error`: collector or relay path is unavailable. No fresh
  cloud state and no command dispatch.
- `configured_device_not_available`: token/device binding changed. No ingest or
  control.
- `capability_not_allowed`: cloud returned a command outside the device config.
  It is rejected and never sent locally.
- `local_delivery_unknown_after_restart`: the process stopped in the narrow
  window after persisting dispatch intent. The connector does not replay the
  side effect.
- `execution_unverified`: the collector showed no command-specific execution
  event before lease expiry.

Token rotation:

1. Provision a new connector token in 4WALL.
2. Replace only `FOURWALL_OPENBMC_CONNECTOR_TOKEN` in the mode-`0600` env file.
3. Restart the service and confirm a fresh heartbeat.
4. Revoke the old token.

Rollback:

```bash
sudo systemctl disable --now fourwall-openbmc-connector.service
```

Revoke the connector token in 4WALL. Leave the local collector/dashboard
unchanged. Cloud data becomes stale; no browser, LINE, LLM, or cloud service
falls back to the unauthenticated collector.

## Tests

The connector uses only the Python standard library. Tests use fake HTTP/cloud
transports and do not contact the collector or 4WALL:

```bash
python -m pytest tests -q
```
