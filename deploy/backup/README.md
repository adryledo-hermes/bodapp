# Database backups → Cloudflare R2 (infrastructure)

Daily, encrypted, off-site backups of `bodapp-postgres`, with an easy
restore, an automated weekly test-restore, and staleness alerting that
survives losing the VPS.

```
daily 03:30 (systemd)
  pg_dump -Fc  →  age encrypt (public key)  →  rclone / R2 S3 API
       →  prune (>30d old, or >10 GB total)  →  manifest.json
weekly Sun 05:00 (systemd, needs the age private key on the VPS)
  newest backup → disposable Postgres (bodapp-pg-restore, 127.0.0.1:5433)
       →  smoke checks  →  teardown  →  test-restore.json → R2
independent prober (NOT on the VPS — Hermes cron / any other machine)
  reads R2 with a READ-ONLY token → alerts if backups are missing, stale,
  failing, or the weekly test-restore hasn't succeeded recently
```

Separation of pipelines: this feature is installed **only** by
`infra.yml` (input `setup_backup`), lives in `/opt/bodapp-backup`,
`/etc/systemd/system/bodapp-backup*` and root's rclone config. The app
tree, Caddy, monitoring, `deploy.yml` and the app container are never
touched. The only shared component is the database itself — and only
*read* via `pg_dump`.

## Prerequisites (one time, on your side)

1. **R2 bucket**: Cloudflare dashboard → R2 → Buckets → Create → e.g.
   `bodapp-backups` (no public access).
2. **R2 API token, scoped to that bucket only**:
   R2 → Manage R2 API Tokens → Create API token → *Custom permissions*:
   **Object Read & Write** → *Resource: Specific bucket →
   `bodapp-backups`*. Copy the access key id + secret once.
3. **Account id** (R2 overview page, right sidebar) → endpoint
   `https://<accountid>.r2.cloudflarestorage.com`.
4. **GitHub secrets** — Settings → Environments → prod (same place as
   `CADDY_*` / `GRAFANA_*`). The workflow persists them to the server,
   so you never SSH for this:
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
     `R2_BUCKET=bodapp-backups` (values from step 2/3)
   - `AGE_PUBKEY` =
     `age1uf0qe6n0ced229axefz4dj5c8cw2el8g9j7qc629qwue2vyr353q2z580g`
     (public — encrypts backups; the *private* key goes in your password
     manager, file copy attached to this README)
   - `AGE_KEY` *(optional, recommended)* = the age **private key** (the
     single `AGE-SECRET-KEY-1…` line) → enables the automated weekly
     test-restore with **zero SSH**. Trade-off: GitHub then also holds
     the decryption key (still independent of the VPS *and* the bucket —
     which is the requirement). Omit it → daily backups unaffected, only
     the test-restore timer stays disabled.
   - `ALERT_WEBHOOK_URL` *(optional)* = Discord/Slack webhook for
     instant failure alerts
5. *(Recommended)* a second R2 token with **Object Read & List only**,
   same bucket → for the independent freshness prober (a separate
   machine must not hold write credentials).

## Setup (no SSH needed)

**Infrastructure workflow → Run workflow → ☑ setup_backup.**

The step ships `deploy/backup/*` to the server, persists the GitHub
secrets above into `/opt/bodapp-backup/backup.env` (root, 600 — the only
runtime location; the optional `AGE_KEY` lands in
`/root/.config/bodapp-backup/backup.key`), installs age/rclone + the
systemd timers, and ends by running **one real backup end-to-end** as
its health gate — green means a verified backup already exists.

Idempotent: re-run any time (it also auto-runs on pushes touching
`deploy/backup/**`). A missing secret fails the step with the exact
TODO checklist — nothing is ever half-installed silently. Manual
alternative: edit `backup.env` on the server and run `setup-backup.sh`
yourself.

## Restoring (the easy ways)

```bash
# newest backup into a disposable database (default; loopback :5433):
sudo /opt/bodapp-backup/restore.sh

# pick a specific one, or just see what's there:
sudo /opt/bodapp-backup/restore.sh list
sudo /opt/bodapp-backup/restore.sh bodapp-20261115T033012Z.dump.enc

# inspect / remove the disposable database:
docker exec -it bodapp-pg-restore psql -U bodapp -d bodapp
sudo /opt/bodapp-backup/restore.sh down
```

Full recovery into the **live** database (destructive; this script never
touches the app container — you stop/start it yourself):

```bash
docker stop bodapp-app
sudo /opt/bodapp-backup/restore.sh latest --into-prod --yes
docker start bodapp-app
```

If the VPS itself is gone: new server → install Docker → copy
`deploy/backup/` over → fill `backup.env` (same bucket) → install the age
private key → `setup-backup.sh` → `restore.sh latest --into-prod --yes`.

## Keys — independent of the VPS and the bucket

- Backups in R2 are **ciphertext only** (age, recipient encryption).
- The **private key never goes into the bucket** and its authoritative
  copy lives in **your password manager** (plus a copy on this machine
  that delivered it — independent of the VPS). Losing the VPS loses
  nothing that can't be restored: bucket + password-manager key are
  enough.
- The VPS may hold a *convenience* copy at
  `/root/.config/bodapp-backup/backup.key` (root, 600) **only** so the
  automated weekly test-restore can decrypt. The no-SSH way to install
  it: set the `AGE_KEY` GitHub secret (persisted at setup time).
  Without it, daily backups work unchanged and only the test-restore
  timer stays disabled. Maximum-security mode: never install it
  anywhere on the VPS; restore manually with `--key-file /path/to/key`.
- Rotation: `age-keygen -o new.key` → put the new public key in
  `backup.env` → re-run setup → old backups still decrypt with the old
  key (keep that old key in the password manager!).

## Retention & free-tier sizing (R2 free: 10 GB storage, 1M Class A +
10M Class B ops / month)

- **Two rules, enforced by every run** (both only ever delete
  `*.dump.enc`; the manifest files are never pruned):
  1. *age* — dumps older than `RETENTION_DAYS` (default **30**) are
     deleted;
  2. *total size* — if several dumps exist and their sum reaches
     `MAX_TOTAL_BYTES` (default **10 GB**, decimal — exactly the free
     tier), the oldest are deleted until the rest sum to *under* the
     cap. **The newest dump is never deleted**, and a lone dump is
     never touched.
- Belt-and-braces: add a *lifecycle rule* in the bucket settings
  (delete objects older than `RETENTION_DAYS+5` days) as a backstop in
  case the script itself can't run.
- Ops usage: a handful per day (~150/month) — irrelevant against 1M/10M.
- Storage: capped automatically (rule 2), so you can't outgrow the free
  tier even if dumps grow — though that would also shorten the *useful*
  history below 30 days. Check the real size any time:

  ```bash
  rclone size bodapp-r2:bodapp-backups
  ```

  Encrypted size ≈ 30–60 % of the raw DB (`-Fc` compresses). Keep an
  eye on `retention: total over …` lines in
  `journalctl -u bodapp-backup.service`; if they appear regularly,
  lower `RETENTION_DAYS` yourself (the size cap silently wins over the
  30-day target) — knobs live in `backup.env`, re-run setup.

## Alerting

Three independent layers:

1. **Immediate**: every failure path in `backup.sh` / the test-restore
   logs `ALERT: …` to stderr (`journalctl -u bodapp-backup.service`) and,
   if `ALERT_WEBHOOK_URL` is set, POSTs it (Discord `{"content":…}` /
   Slack `{"text":…}` compatible).
2. **Staleness (survives VPS loss)**: `check-freshness.sh` runs from a
   machine that is **not** the VPS with a read-only R2 token:

   ```bash
   RCLONE_CONFIG=/path/to/read-only.conf R2_BUCKET=bodapp-backups \
     ./check-freshness.sh
   # exit 0 + silence = healthy; exit 1 + FAIL lines = alert
   ```

   It fails when: no dumps exist, the newest dump or the manifest's
   `last_success_utc` is older than `MAX_AGE_HOURS` (48), the last
   test-restore failed, or it is older than `TEST_MAX_DAYS` (14).
   Wired to a daily Hermes cron that messages this WhatsApp chat.
3. **GitHub**: a red run of the Infrastructure workflow when setup or a
   push-triggered re-provision fails.

## Files & commands

| what | where |
|---|---|
| scripts | `/opt/bodapp-backup/` (backup.sh, restore.sh, check-freshness.sh) |
| config | `/opt/bodapp-backup/backup.env` (root, 600) |
| rclone | `/root/.config/rclone/rclone.conf` (remote `bodapp-r2`, 600) |
| age key (optional) | `/root/.config/bodapp-backup/backup.key` (600) |
| local copies | `/opt/bodapp-backup/local/` (last `KEEP_LOCAL` dumps) |
| timers | `bodapp-backup.timer` (daily 03:30), `bodapp-backup-test.timer` (Sun 05:00) |
| bucket objects | `bodapp-<UTC>.dump.enc`, `manifest.json`, `test-restore.json` |

```bash
sudo systemctl list-timers 'bodapp-backup*'     # next fires
sudo journalctl -u bodapp-backup.service -n 50  # last run
sudo systemctl start bodapp-backup.service      # run one now
```
