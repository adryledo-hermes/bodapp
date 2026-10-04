# Hetzner firewall rules for Bodapp + Caddy

Only **TCP 80** (HTTP→HTTPS redirect + Let's Encrypt HTTP-01 challenge) and
**TCP 443** (HTTPS) belong open to the world. The app itself is published on
`127.0.0.1:3001` on the host, so it is unreachable from the internet even
before any firewall — the rules below are defence in depth.

## Cloud Console (recommended)

1. Hetzner Cloud → your project → **Firewalls → Create firewall**.
2. Add these **inbound rules**:

| Direction | Protocol | Port | Source         | Purpose                        |
|-----------|----------|------|----------------|--------------------------------|
| Inbound   | TCP      | 80   | `0.0.0.0/0`    | HTTP → HTTPS redirect, ACME    |
| Inbound   | TCP      | 443  | `0.0.0.0/0`    | HTTPS (Caddy)                  |
| Inbound   | TCP      | 22   | `<YOUR_IP>/32` | SSH — lock to your IP/VPN      |

   IPv6 site? Add `::/0` as an extra source on 80/443 (and your IP in v6 form
   on 22).

3. **Outbound rules**: keep the default **allow all** (Docker image pulls,
   `apt`, Let's Encrypt, Twilio, backups to the Storage Box).
4. **Attach** the firewall to the server (Firewalls → *Attach to server* →
   select the box).

Hetzner cloud firewalls are **deny-by-default: anything that does not match a
rule is dropped**. After attaching:

- 80/443 stay reachable → only Caddy answers there.
- 22 stays reachable only from your IP.
- The old app port (3000/8080, if it was ever opened), **3001** and Postgres
  **5432** are closed to the world.

## Alternative: ufw on the host

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow from <YOUR_IP> to any port 22 proto tcp   # your IP, not the world
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable        # ⚠️ only AFTER 22/80/443 are allowed — or you get locked out
ufw status
```

> Notes: Docker publishes the app on loopback only, so ufw-vs-Docker iptables
> quirks don't expose anything here. But remember in general that Docker
> published ports bypass ufw's INPUT chain (they are forwarded via the DOCKER
> chain) — the Hetzner Cloud firewall is the reliable outer gate. Run both if
> you like; they compose fine.

## Verify

```bash
# From your laptop:
curl -I http://app.yourdomain.com      # expect redirect (308) to https://
curl -I https://app.yourdomain.com/healthz   # expect 200 + security headers
curl -m 3 http://<SERVER_IP>:3001/healthz    # MUST fail (connection refused/
                                             # timeout) — port not public
```
