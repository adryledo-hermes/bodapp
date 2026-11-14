# Bodapp monitoring — vmagent → Grafana Cloud (free tier)

Production monitoring for the Bodapp Hetzner VPS. **Infrastructure pipeline
only** (`.github/workflows/infra.yml`) — it never builds, starts, stops or
reconfigures the application, Caddy or the database containers (with the one
explicit, approval-gated exception documented in §4).

## 1. Architecture

```
                       remote_write (basic auth, HTTPS)
   vmagent ──────────────────────────────────────────────▶  Grafana Cloud
   (host net, 127.0.0.1:8429)                              Prometheus free tier
     │ scrapes every 20s (scrape_timeout 10s)                 │ dashboards,
     ├─ 127.0.0.1:9187   postgres_exporter (bridge net ─ postgres:5432,
     │                    via shared external network          alerts, external
     │                    `bodapp_default`, read-only role)    HTTP check
     ├─ 127.0.0.1:2019   Caddy admin /metrics (host systemd, loopback default)
     ├─ 127.0.0.1:9100   node_exporter  (host CPU/mem/disk/net)
     ├─ 127.0.0.1:8081   cAdvisor       (containers; 8080 is Dozzle's)
     └─ 127.0.0.1:8429   vmagent itself (self-scrape)
```

Key decisions and why:

- **No local Prometheus/Grafana** — Grafana Cloud stores and serves the data;
  vmagent only buffers (≤100 MB) and ships.
- **vmagent on `network_mode: host`**: every metric endpoint — including
  Caddy's, which is a *host systemd service* on its default loopback admin
  bind `127.0.0.1:2019` — is loopback-only. Host networking lets vmagent
  reach them **without any port being widened** to a bridge or public
  interface, and without touching the Caddy admin bind (rebinding it would
  expose the unauthenticated admin API). vmagent exposes only
  `127.0.0.1:8429` and makes outbound connections only. This is the sole
  deviation from default bridge networking; it is not privileged and mounts
  nothing.
- **Everything else stays on the bridge network with `127.0.0.1:` port
  binds** — the exact pattern the app and Dozzle already use; the public
  internet can reach none of it (Hetzner firewall additionally allows only
  80/443 + tailnet SSH).
- **postgres_exporter joins the app's existing `bodapp_default` network as an
  external network** (read-only client; it can only dial `postgres:5432`) so
  it resolves the DB by its stable Docker DNS name. The app project's compose
  file is untouched.
- **Pinned images** (no `latest`): `victoriametrics/vmagent:v1.156.0`,
  `quay.io/prometheuscommunity/postgres-exporter:v0.20.1`,
  `prom/node-exporter:v1.12.1`, `gcr.io/cadvisor/cadvisor:v0.60.6`.
- **Separate compose project** `bodapp-monitoring` in `/opt/bodapp-monitoring`
  (outside `/opt/bodapp`, so the app pipeline's `git reset --hard` /
  `git clean -fd` can never delete monitoring state). Unavailable monitoring
  never blocks the app: no app service depends on these containers.

## 2. Files

| File | Purpose |
|---|---|
| `docker-compose.yml` | the stack (vmagent + 3 exporters), loopback binds, healthchecks |
| `docker-compose.statements.yml` | variant adding `--collector.stat_statements` (selected automatically once §4 succeeded) |
| `vmagent.yml` | scrape jobs, 20s/10s intervals, `external_labels: environment=production, service=bodapp` |
| `monitoring.env.example` | template of the server-side root-owned `.env` (placeholders only) |
| `setup-monitoring.sh` | idempotent deploy: preflight → .env → validate → up → health gates |
| `setup-postgres-monitoring.sh` | DB-side: extension, bounded stats, read-only role, self-tests (§4) |
| `grafana/bodapp-dashboard.json` | importable dashboard (Host / Containers / PostgreSQL / HTTP / Availability) |
| `grafana/alerts.md` | 11 alert rules with exact queries, thresholds and safe test methods |

## 3. Grafana Cloud setup (values YOU provide — nothing is guessed)

1. Create a free stack at grafana.com (no card required).
2. **Remote write credentials** (used by vmagent):
   Cloud Portal → your stack → **Details → Prometheus** card:
   - `GF_PROM_URL` — the remote-write endpoint (`…/api/prom/push`) shown on
     that page ("Send data / From my local Prometheus server" flow),
   - `GF_PROM_USER` — the numeric instance id ("User" field),
   - `GF_PROM_PASSWORD` — **"Generate now"** in the *send data* section
     (write scope `metrics:write`; shown once; Admin role required).
3. Store them as **GitHub → Settings → Environments → prod** secrets:
   `GRAFANA_PROM_URL`, `GRAFANA_PROM_USER`, `GRAFANA_PROM_PASSWORD`
   (catalog: `deploy/infra.env.example`). The pipeline passes them to
   `setup-monitoring.sh`, which writes `/opt/bodapp-monitoring/.env`
   (root-owned, mode 600) and never echoes them. Re-run without them is fine:
   stored values are reused.
4. **Dashboard**: Grafana → Dashboards → New → Import → upload
   `grafana/bodapp-dashboard.json` → when prompted for the `DS_PROMETHEUS`
   data source pick your stack's default Prometheus. Panels show real data
   after the first 20s scrape.
5. **External availability check** (independent of the VPS): Testing &
   synthetics → Checks → New → type **HTTP/HTTPS**:
   - URL `https://<your-domain>/healthz`, interval 10 min, 2 probes
     (~9k executions/month ≪ the free 100k API executions),
   - metrics appear as `probe_http_status_code` / `probe_duration_seconds`
     (verify your check's label names in Explore once it runs).
6. **Alerts**: create the rules from `grafana/alerts.md` (folder `Bodapp`,
   contact point = your email). Free plan: 500 rules / 1000 instances each.

## 4. PostgreSQL: extension, role, and the ONE restart

Deliberate split — everything below the restart runs automatically on every
infra run; the restart needs your explicit approval.

- **Without approval (default pipeline run):** the script prints the exact
  `ALTER SYSTEM` plan, makes **no database changes**, exits 0 and monitoring
  still deploys — minus `pg_stat_statements`. Status: non-disruptive.
- **With approval:** run the workflow manually (see §6) and tick
  **`enable_pg_stat_statements`** — that checkbox *is* the approval. It then:
  1. `ALTER SYSTEM SET shared_preload_libraries = '…,pg_stat_statements'`
     (appends, preserving existing entries) and
     `ALTER SYSTEM SET pg_stat_statements.max = 100` (bounds cardinality —
     the default 5000 would risk the 10k free-tier series budget);
  2. **`docker restart bodapp-postgres`** — *the disruptive step*: a
     ~5-second DB blip; Prisma reconnects automatically and Caddy's
     `/healthz` gate is DB-free, so the site keeps serving (requests in that
     window error out);
  3. `CREATE EXTENSION IF NOT EXISTS pg_stat_statements` **in the app
     database only** (PostgreSQL ≥13 required — the container runs
     `postgres:16-alpine`, and PG16 is inside the exporter's CI matrix);
  4. creates/updates `bodapp_monitor` (password = generated hex in the
     root-owned `.env`, `CONNECTION LIMIT 5`), grants **`CONNECT` +
     `pg_read_all_stats` first**, then *self-tests as that role* against
     `pg_stat_activity`, `pg_stat_statements`, `pg_database_size()` and
     `pg_settings`; **only** if a test fails does it escalate to **`pg_monitor`**
     and re-test;
  5. prints an audit (role flags must all be `f`, zero table grants — no
     superuser, no writes, no schema ownership) and drops the
     `statements.enabled` marker; the next `setup-monitoring.sh` run starts
     the exporter with `--collector.stat_statements`.

**Never enabled:** `--collector.stat_statements.include_query` — it exports
SQL text as a metric label (query literals = cardinality + a data-leak
vector). Statements are addressed by numeric `queryid` only. The exporter's
built-in query already filters to the slow 90% and orders by total time with
a LIMIT; together with `pg_stat_statements.max=100` worst case ≈ 100 queryids
× 5 metrics ≈ **500 series**.

## 5. Caddy metrics

`deploy/caddy/Caddyfile` gains the one-line global option `{ metrics }` —
served on the admin API's default loopback bind (`http://127.0.0.1:2019/metrics`),
**never public**, admin API untouched otherwise. Deployed by the existing
Caddy flow (`caddy validate` → reload-only-if-changed, triggered by pushes to
`deploy/caddy/**`). Real metric names in use: `caddy_http_requests_total`
(server, handler — *no* `code` label), `caddy_http_request_duration_seconds`
(+ `_count/_sum/_bucket`, carries `method`, `code`), `caddy_http_requests_in_flight`.
Note: Caddy JSON access logs (already on stdout/journald) remain the source
for exact endpoint-level status lines — metrics don't replace them, and both
already avoid credentials/OTPs by design.

## 6. Deploy / upgrade / rollback / removal

Triggers: push to `main` touching `deploy/monitoring/**` or
`deploy/caddy/**`, or **Run workflow**. The workflow order: Caddy+TLS gate →
Dozzle → *PG preparation* → *monitoring* — each step scp'd from the runner
checkout to `/tmp`, app tree never touched.

Manual (on the VPS, as root):

```bash
sudo cp -r deploy/monitoring /tmp/bodapp-monitoring
sudo MON_ALLOW_RESTART=1 bash /tmp/bodapp-monitoring/setup-postgres-monitoring.sh  # 1 = approve restart
sudo GF_PROM_URL=… GF_PROM_USER=… GF_PROM_PASSWORD=… \
     bash /tmp/bodapp-monitoring/setup-monitoring.sh
```

- **Upgrade**: edit the image tag in `docker-compose.yml` → run the workflow
  (or the manual command). Pull → recreate → health gates run again.
- **Rollback**: re-checkout the previous tag (or `git revert`), re-run — the
  scripts are idempotent; the local 100 MB vmagent buffer keeps samples
  during restarts.
- **Remove**:
  ```bash
  cd /opt/bodapp-monitoring && docker compose -f docker-compose.yml -f docker-compose.statements.yml down -v
  sudo rm -rf /opt/bodapp-monitoring
  ```
  plus optional cleanup: delete the Grafana secrets/dashboard, and
  `DROP EXTENSION pg_stat_statements; ALTER SYSTEM RESET shared_preload_libraries;`
  + restart postgres if you want the DB fully back to pre-monitoring state.
  Nothing in the app repo, Caddy config or firewall changes during removal.

## 7. Verification (what the pipeline proves vs. what you verify)

Checked **automatically by `setup-monitoring.sh` on every run** (hard gates):
compose config valid → images up → every exporter answers on loopback →
Caddy metrics present → ≥4/5 vmagent targets up → no remote_write
auth/transport errors in the last 3 minutes → every monitoring port binds
`127.0.0.1` only. **Only after these pass does the step report success.**

Verified **here (this implementation run)**: file/JSON validity, `bash -n`
script syntax, all metric names traced to the pinned versions' source or
official docs, versions resolved from the registries, free-tier limits from
grafana.com/pricing (12 Nov 2026), and PR CI green. `docker compose config`
for the final file set runs in the pipeline (this dev machine has no Docker
daemon).

Verified **by you, after the first production run** (needs your secrets +
the VPS): remote_write actually landing (portal → Explore →
`pg_up`, `up`, `node_load1` all returning data), dashboard panels rendering,
alerts test-firing, external check reporting. **No claim of delivery to
Grafana Cloud is made until those queries return your data.**

## 8. Series estimate (free tier = 10,000 active series)

| Source | Estimate | Assumptions |
|---|---|---|
| node_exporter | 600–900 | default collectors, 1 NIC, ~6 filesystems |
| cAdvisor | 2,000–5,000 | ~9 containers × ~250–550 series (the widest uncertainty; one community sample measured ~1,843 `container_*` series for 2 containers + cgroup parents) |
| postgres_exporter | 500–1,200 | stat_user_tables disabled; activity×states, 2 databases, locks×modes, roles; statements ≤500 when enabled |
| Caddy | 150–400 | single site, histogram ≈16 buckets × few handler/code combos |
| vmagent self | ~100–150 | scrape + remote_write instrumentation |
| **Total** | **≈3,400–7,600** | **within 10k with ≥24% headroom** |

Ingestion at 20s: ~170–380 samples/s (≈15–33 M/day, highly compressed by
remote_write — tens of MB/day of network). **Interval analysis:** the free
tier meters *active series*, which are identical at 20s and 5s — a 5s
interval would *fit* the plan but quadruple scrape/ingest load for zero
benefit at this traffic. 20s (the requested value) ships as configured and is
changeable per target (`scrape_interval` under any job in `vmagent.yml`).

**After the first hour**, confirm actuals in Explore:
`count by (job) ({environment="production", service="bodapp"})` — sum must
stay < 10,000. If cAdvisor runs hot, trim it with `--disable_metrics` entries
(cAdvisor's flag reference) in `docker-compose.yml`.

## 9. Security & known limitations

- No secrets in git, logs or `docker inspect` commands: credentials live only
  in the 0600 root-owned `.env`; validation uses `docker compose config
  --quiet`; SQL is piped to psql on stdin, never argv; the exporter role has
  zero table grants (audit printed at deploy).
- No public listeners: all metric ports are loopback; the Hetzner firewall
  still allows only 80/443 + tailnet SSH; Tailscale rules, Caddy routing and
  app networking are unchanged.
- **Limitation — total remote_write outage**: if vmagent cannot ship at all,
  nothing inside Grafana Cloud can fire (its metrics arrive on the same
  pipe). Mitigations: the deploy gate re-checks every run; rule 3 catches
  partial staleness; optionally add a second, independent checker outside
  Grafana Cloud if this ever matters.
- **Limitation — Caddy metrics vs access logs**: metrics label by
  server/handler/code, not by exact endpoint; per-path status accounting
  stays with the existing JSON access logs (aggregation deliberately out of
  scope: no OTP/token fields are logged, and none are added).
- **Limitation — 14-day retention** on the free plan: this stack answers
  "what is happening / happened this fortnight", not long-term capacity
  history.
- Container restarts are derived (`changes(container_start_time_seconds)`),
  since cAdvisor has no restart counter (verified against upstream).
