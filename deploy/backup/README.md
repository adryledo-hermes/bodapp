# Database backups → Cloudflare R2 (infrastructure)

Daily, encrypted, off-site backups of `bodapp-postgres`, with an easy
restore, an automated weekly test-restore, and staleness alerting that
survives losing the VPS.

```
daily 03:30 (systemd)
  pg_dump -Fc  →  age encrypt (public key)  →  rclone / R2 S3 API
       →  prune > RETENTION_DAYS  →  manifest.json
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
3. **Account id** (R2 overview page, right sidebar) → for the endpoint
   `https://<accountid>.r2.cloudflarestorage.com`.
4. **age keypair** — the *public* key below already encrypts; store the
   *private* key in your password manager (a file copy is also attached
   to the delivery of this README):

   `AGE_PUBKEY=age1uf0qe6n0ced229axefz4dj5c8cw2el8g9j7qc629qwue2vyr353q2z580g`

5. *(Recommended)* a second R2 token with **Object Read & List only**,
   same bucket → for the independent freshness prober (a separate
   machine must not hold write credentials).

## Setup

On the server, fill the env file once, then run setup:

```bash
sudo nano /opt/bodapp-backup/backup.env   # R2_* + AGE_PUBKEY
sudo bash deploy/backup/setup-backup.sh   # idempotent
```

Or from GitHub: **Infrastructure workflow → Run workflow → ☑ setup_backup**
(the step fails with the same TODO checklist if the env file is still
incomplete — nothing is half-installed silently). The setup ends by
running **one real backup end-to-end** as its health gate.

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
  automated weekly test-restore can decrypt. Without it, daily backups
  work unchanged and only the test-restore timer stays disabled.
  Maximum-security mode: never install it; restore manually with
  `--key-file /path/to/key`.
- Rotation: `age-keygen -o new.key` → put the new public key in
  `backup.env` → re-run setup → old backups still decrypt with the old
  key (keep that old key in the password manager!).

## Retention & free-tier sizing (R2 free: 10 GB storage, 1M Class A +
10M Class B ops / month)

- Default: **30 daily** backups (`RETENTION_DAYS=30` in `backup.env`),
  enforced by the script; add a *lifecycle rule* in the bucket settings
  (delete objects older than `RETENTION_DAYS+5` days) as a belt-and-braces
  backstop in case the script itself can't run.
- Ops usage: a handful per day (~150/month) — irrelevant against 1M/10M.
- Storage: after the first week check the real size:

  ```bash
  rclone size bodapp-r2:bodapp-backups
  ```

  Rule of thumb: `30 × encrypted_dump_size < 8 GB` keeps headroom under
  the 10 GB free tier. Encrypted size ≈ 30–60 % of the raw DB (the
  `-Fc` custom format compresses). If you approach the budget, lower
  `RETENTION_DAYS` (e.g. 14) — the knob is in `backup.env`, re-run setup.

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
