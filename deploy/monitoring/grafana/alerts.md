# Bodapp — Grafana Cloud alert rules

Plan limits (verified 12 Nov 2026, grafana.com/docs/grafana-cloud): the **Free
Forever plan allows up to 500 Grafana-managed alert rules with 1000 instances
each** — the 11 rules below are comfortably inside that.

## How to create them (Grafana Cloud portal)

1. **Alerting → Alert rules → New alert rule** (folder: create `Bodapp`).
2. Rule type: *Grafana managed rule*. Data source: your stack's Prometheus.
3. Set the query exactly as given, condition: classic condition `A` > threshold
   (each rule below states its own condition), **Folder** `Bodapp`, no
   evaluation group needed beyond the default (`Bodapp / 1m`).
4. Set **for** exactly as given — this is what keeps rules quiet through
   momentary spikes.
5. **Notifications**: Alerting → Contact points → add your email (works on the
   Free plan) → Policies: route folder `Bodapp` to that contact point.
6. Test safely: use the rule editor's **Test rule** button and a temporarily
   lowered threshold (e.g. CPU > 1%) — it evaluates against live data without
   changing production. Do **not** stop services or exhaust resources to fire
   an alert.

Every query below uses metrics verified against the deployed versions
(cAdvisor restarts use `changes(container_start_time_seconds…)` because
cAdvisor ships **no** restart counter; Caddy's status `code` label lives on
`caddy_http_request_duration_seconds*`, not on `caddy_http_requests_total`).

## The rules

### 1. Public endpoint unavailable — CRITICAL, external
```
(probe_http_status_code < 200 or probe_http_status_code >= 300)
```
`for: 5m`, severity: critical, summary: "External HTTP check on
https://<domain>/healthz failing — site unreachable from outside the VPS."
Requires the Synthetic Monitoring HTTP check (README §5). A transport-level
failure is reported as a non-2xx value (including 0). *If* a hard network
failure turns out to drop the series entirely instead of reporting 0, append
`or absent(probe_http_status_code)` **after** the check exists (before that,
`absent()` would fire on empty data).

### 2. Scrape target down (internal) — WARNING
```
up == 0
```
`for: 5m`, severity: warning, summary: "Prometheus job {{job}} target
{{instance}} down — exporter or Caddy metrics endpoint not answering."
Covers "missing metrics / failed scrapes" at the collection layer.

### 3. Stale data in Grafana Cloud — WARNING
```
max by (job) (time() - timestamp(up)) > 600
```
`for: 5m`, severity: warning, summary: "No fresh samples for {{job}} for
10+ minutes — vmagent scrape stalled or remote_write degraded." (Detects
partial delivery failures; a total outage is invisible from inside Grafana —
the deploy gate re-checks it every run.)

### 4. Sustained high CPU — WARNING
```
100 * (1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))) > 85
```
`for: 15m`, severity: warning. 15 minutes of sustained load, not a spike.

### 5. Memory pressure — WARNING
```
(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) > 0.90
```
`for: 15m`, severity: warning. Uses *available* (reclaimable cache counts as
free), which avoids false positives on Linux page cache.

### 6. Low disk space — WARNING
```
100 * node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"}
    / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"} < 15
```
`for: 10m`, severity: warning. 15% ≈ headroom for the app pipeline's build
(which already hard-fails below 6 GiB free — see deploy.sh DEPLOY_MIN_FREE_KB).
Tighten to 10 if you prefer one alert, not two.

### 7. PostgreSQL connection saturation — WARNING
```
100 * sum(pg_stat_activity_count) / pg_settings_max_connections > 80
```
`for: 5m`, severity: warning. Pool sized off `max_connections` (default 100 in
the container image).

### 8. PostgreSQL unavailable — CRITICAL
```
pg_up == 0 OR absent(pg_up)
```
`for: 2m`, severity: critical. `absent()` also fires when the exporter itself
crashes — covers both the DB and the monitoring path to it.

### 9. Elevated HTTP 5xx rate — WARNING
```
100 * sum(rate(caddy_http_request_duration_seconds_count{code=~"5.."}[5m]))
  / sum(rate(caddy_http_request_duration_seconds_count[5m])) > 5
  and sum(rate(caddy_http_request_duration_seconds_count[5m])) > 0.016
```
`for: 10m`, severity: warning. The `> 0.016` guard (~1 req/min) stops the
percentage from screaming on a near-empty denominator — the wedding site has
long quiet periods.

### 10. Elevated p95 latency — WARNING
```
histogram_quantile(0.95, sum by (le) (rate(caddy_http_request_duration_seconds_bucket[5m]))) > 2
```
`for: 10m`, severity: warning. 2s is deliberately generous for cold Next.js
starts; tune down once you've seen a week of real p95.

### 11. Container restart loop — WARNING
```
changes(container_start_time_seconds{name!=""}[15m]) >= 3
```
`for: 0m`, severity: warning, summary: "{{name}} restarted ≥3× in 15m."
Restarts are *derivable* (start-time changes), never invented.

## Verify the rules fire (safe methods only)

- **Rules 4–7, 9, 10**: Test-rule button with a temporarily absurd threshold
  (CPU > 1%, disk < 99%, p95 > 0.01s) — evaluates real data, changes nothing.
- **Rule 2**: stop nothing — instead check the expression shows the expected
  instant value in Explore (`up` should be 1 for every job; a missing job
  means the target never registered, which rule 3 will catch).
- **Rule 1**: create the synthetic check pointed at a deliberately dead URL
  (e.g. `https://example.invalid/healthz`) as a second check — the alert
  fires against that check without touching production.
- **Rule 8 / 11**: thresholds against real data via Test rule only; never
  restart production services to force a firing.
