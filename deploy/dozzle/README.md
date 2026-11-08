# Dozzle — live logs for the app container (infrastructure only)

A small, read-only log viewer running on the VPS, wired into the
**Infrastructure** pipeline (`.github/workflows/infra.yml`) — the same
strict separation as Caddy: this never builds, restarts or touches the app
container, and the business-logic pipeline (`deploy.yml`) never runs it.

## What it shows

Only **`bodapp-app`**. The container is started with
`DOZZLE_FILTER=name=bodapp-app`, which is passed straight to Docker — the same
semantics as `docker ps --filter name=…`. `bodapp-postgres` and anything else
on the host are invisible to it.

## How you reach it

```text
https://<your-host>.<tailnet>.ts.net:8443/
```

- **Tailnet only.** It is published with `tailscale serve` — *not* funnel — so
  nothing is reachable from the public internet; you need a device on your
  tailnet and (per your ACLs) HTTPS allowed.
- **Loopback bound.** Dozzle itself is published on `127.0.0.1:8080` only; the
  only way in is the Tailscale proxy. Caddy keeps `:80/:443`, which is why
  serve uses `8443` (`DOZZLE_SERVE_PORT` to change it).
- Port and image are inputs of `setup-dozzle.sh` (see its header).

## MCP server (AI assistants reading logs)

Enabled by default (`DOZZLE_ENABLE_MCP=true`) at:

```text
https://<your-host>.<tailnet>.ts.net:8443/api/mcp
```

Tools are **read-only**: `list_containers`, `get_container_logs`,
`search_container_logs`, `list_hosts`, `get_container_stats`. Example client
config (VS Code / Copilot, `.vscode/mcp.json`):

```json
{
  "mcpServers": {
    "dozzle": {
      "type": "http",
      "url": "https://<your-host>.<tailnet>.ts.net:8443/api/mcp"
    }
  }
}
```

## Security posture

| Control | Setting |
|---|---|
| Network exposure | tailnet only (`tailscale serve`, no funnel) |
| Dozzle bind | `127.0.0.1:8080` — never on the LAN/WAN |
| Docker socket | mounted `:ro` (see caveat below) |
| Dozzle actions/shell | **disabled** — no start/stop/exec from the UI |
| Visibility | one container: `bodapp-app` |
| MCP tools | read-only |

**Caveat, stated honestly:** Docker's `:ro` mount flag only marks the socket
file read-only — it does *not* restrict the API, so a compromised Dozzle could
still drive the daemon. The mitigations here are: tailnet-only access,
actions/shell off, and a single visible container. If you want the API itself
restricted, the next step is putting a socket proxy such as
`tecnativa/docker-socket-proxy` in front of the daemon (a follow-up worth its
own change).

**Optional login:** Dozzle can require its own users (`--auth-provider simple`
+ `/data/users.yml`, see `dozzle.dev/guide/authentication`). Not enabled here —
the tailnet is the authentication boundary — enable it if you later add more
people/devices to the tailnet.

## Run it by hand

```bash
APP_CONTAINER=bodapp-app DOZZLE_SERVE_PORT=8443 sudo -E ./setup-dozzle.sh
```

Idempotent: safe to re-run; it recreates its own container and re-applies the
serve config. Requires the host to already be on the tailnet.

## Logs troubleshooting (the app, not the viewer)

```bash
docker logs -f --tail 0 bodapp-app                     # live, stdout + stderr
docker logs --since 30m bodapp-app 2>&1 | grep -E '\[email\]|\[password/forgot\]'
```