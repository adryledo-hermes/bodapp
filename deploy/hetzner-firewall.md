# Hetzner firewall rules for Bodapp + Caddy

Only **TCP 80** (HTTP→HTTPS redirect + Let's Encrypt HTTP-01 challenge) and
**TCP 443** (HTTPS) belong open to the world. The app itself is published on
`127.0.0.1:3001` on the host, so it is unreachable from the internet even
before any firewall — the rules below are defence in depth.

**SSH is NOT public.** The box is managed over your **tailnet**: the CI
runner joins it with the ephemeral `TAILSCALE_AUTHKEY` secret and you reach
it from your devices the same way (Tailscale SSH server or sshd — see
[`github-actions-deploy.md`](github-actions-deploy.md)). There is **no
port-22 rule** below; do not add one.

## Cloud Console (recommended)

1. Hetzner Cloud → your project → **Firewalls → Create firewall**.
2. Add these **inbound rules**:

| Direction | Protocol | Port | Source         | Purpose                        |
|-----------|----------|------|----------------|--------------------------------|
| Inbound   | TCP      | 80   | `0.0.0.0/0`    | HTTP → HTTPS redirect, ACME    |
| Inbound   | TCP      | 443  | `0.0.0.0/0`    | HTTPS (Caddy)                  |
| Inbound   | UDP      | 41641| `0.0.0.0/0`    | Optional but recommended: Tailscale's direct-connection port (hole punching). Without it the tailnet still works — it relays over Tailscale's DERP servers |

   IPv6 site? Add `::/0` as an extra source on 80/443 (and on UDP 41641).
   **No TCP 22 rule** — SSH is reachable only via Tailscale (WireGuard
   traffic arrives as ordinary tunnel packets, never as public port 22).

3. **Outbound rules**: keep the default **allow all** (Docker image pulls,
   `apt`, Let's Encrypt, Twilio, backups to the Storage Box, WireGuard).
4. **Attach** the firewall to the server (Firewalls → *Attach to server* →
   select the box).

Hetzner cloud firewalls are **deny-by-default: anything that does not match a
rule is dropped**. After attaching:

- 80/443 stay reachable → only Caddy answers there.
- 22 is closed to the world; over the tailnet, SSH never touches the public
  NIC (with optional UDP 41641 it connects directly, otherwise it relays).
- The old app port (3000/8080, if it was ever opened), **3001** and Postgres
  **5432** are closed to the world.

## Alternative: ufw on the host

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow from 100.64.0.0/10 to any port 22 proto tcp   # tailnet ONLY — never 0.0.0.0/0
ufw enable        # ⚠️ only AFTER 80/443/22(tailnet) are allowed — or you get locked out
ufw status
```

> Notes: Docker publishes the app on loopback only, so ufw-vs-Docker iptables
> quirks don't expose anything here. But remember in general that Docker
> published ports bypass ufw's INPUT chain (they are forwarded via the DOCKER
> chain) — the Hetzner Cloud firewall is the reliable outer gate. Run both if
> you like; they compose fine. The `100.64.0.0/10` rule is the tailnet's
> shared CGNAT range: it keeps ordinary `sshd` reachable from tailnet devices.
> With the **Tailscale SSH server** (`sudo tailscale set --ssh`),
> tailscaled terminates SSH itself, before ufw/`sshd` ever see it — that rule
> is then only a safety net for sshd mode.

## Verify

```bash
# From your laptop:
curl -I http://app.yourdomain.com      # expect redirect (308) to https://
curl -I https://app.yourdomain.com/healthz   # expect 200 + security headers
curl -m 3 http://<SERVER_IP>:3001/healthz    # MUST fail (connection refused/
                                             # timeout) — port not public

# Public SSH must be CLOSED, tailnet SSH OPEN:
nc -vz -w 3 <SERVER_IP> 22              # MUST fail (refused/timeout)
ssh root@hetzner.tail1234.ts.net        # MUST work — over Tailscale
```
