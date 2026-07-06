# VPS Deployment Plan (dev branch, plain-HTTP demo)

This is the concrete, VPS-specific execution plan for this deploy. For the
general/reusable runbook, see [DEPLOY.md](./DEPLOY.md) — this file only records the
decisions and numbers specific to *this* box and *this* deploy, so anyone (including
Claude Code running on the VPS) can pick up mid-way without re-deriving context.

## Decisions made
- Deploy branch: **dev** (not `main` — `main` is stale; all current work is on `dev`).
- VPS: Ubuntu 24.04, Docker not yet installed as of planning time.
- Access mode: **plain HTTP on the VPS IP** (`http://<vps-ip>:8080`), no domain/TLS yet.

## Measured VPS specs
```
1.9 GiB RAM total, 2 vCPU (AMD EPYC 7K62)
602 MiB already resident, ~1.3 GiB available
4.9 GiB swap (94 MiB used)
40 GB disk, 27 GB free
Ubuntu 24.04.4 LTS
```
The stack's configured memory limits total ~1.15 GB (web 768M + db 256M + nginx
128M) on top of that 602 MiB baseline — right at the edge of 1.9 GiB. Each
gunicorn worker adds ~250 MB (numpy/scipy), so **use `GUNICORN_WORKERS=1`** here
instead of the generic docs' default-of-2. Swap (nearly empty) is the backstop if a
spike overflows — slower, not a crash. Disk is not a concern. Only raise
`GUNICORN_WORKERS` later if `free -h` post-deploy shows comfortable headroom.

## Phase B — Install Docker on the VPS
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # then log out / back in
docker compose version             # must be v2.x
free -h                            # confirm headroom
```

## Phase C — Get the code (dev branch) and configure
```bash
git clone -b dev https://github.com/AjiSenoo/lightning-dss.git
cd lightning-dss
cp .env.example .env
```
### `.env` can be filled in by Claude Code running on this VPS — no manual editing needed
- `SECRET_KEY` / `POSTGRES_PASSWORD` — generate directly: `python3 -c "import secrets; print(secrets.token_urlsafe(64))"` (and `token_urlsafe(24)` for the DB password).
- `ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS` — since you're running on the box itself,
  learn its own public IP with `curl -4 ifconfig.me` and fill in
  `ALLOWED_HOSTS=<ip>` and `CSRF_TRUSTED_ORIGINS=http://<ip>:8080`. Flag the detected
  IP back to the user once before relying on it (wrong if the box sits behind
  NAT/a load balancer).
- `HTTP_PORT` — check for conflicts first (`ss -tlnp`); default to 8080 if free,
  otherwise pick another free port and say which one was chosen.
- Fixed values, no lookup needed: `GUNICORN_WORKERS=1`, `TZ=Asia/Jakarta`,
  `POSTGRES_DB`/`POSTGRES_USER` defaults, and `SECURE_SSL_REDIRECT=False` /
  `SESSION_COOKIE_SECURE=False` / `CSRF_COOKIE_SECURE=False` (plain-HTTP mode).

## Phase D — First boot, seed, admin, firewall
```bash
# First boot only: seed demo data so there's a login to test with
SEED_DEMO=1 docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f web   # watch it come up
```
After it's healthy:
1. Set `SEED_DEMO=0` in `.env` (so restarts don't reseed).
2. Create a real admin: `docker compose -f docker-compose.prod.yml exec web python manage.py createsuperuser`
3. Open the firewall: `sudo ufw allow 8080/tcp`

## Verification (end-to-end)
- `docker compose -f docker-compose.prod.yml ps` — db/web/nginx all `Up`/healthy.
- Browser: `http://<vps-ip>:8080` loads the SPA; log in (demo or new admin).
- `http://<vps-ip>:8080/admin` — Django admin login works (proves CSRF/cookie config).
- Exercise one real flow: open an asset, view its AHI/dashboard, submit an inspection
  — confirms Django API, Postgres, and static/media volumes are all wired.
- `docker compose -f docker-compose.prod.yml logs web` — no tracebacks on those actions.

## Optional / later
- **Scheduled jobs** (see DEPLOY.md "Scheduled maintenance jobs"): host crontab
  entries for `check_component_lifespan`, `check_stale_inspections`,
  `purge_deleted_inspections`.
- **DB backup**: `docker compose -f docker-compose.prod.yml exec db pg_dump -U lightning lightning_dss > backup_$(date +%F).sql`
- **HTTPS upgrade** (see DEPLOY.md "Upgrading to HTTPS later"): point a domain or
  `<ip>.nip.io` at the box, add certbot/Caddy, then flip the `SECURE_*`/`*_COOKIE_SECURE`
  vars to `True`.

## Notes / caveats
- Plain-HTTP-on-IP transmits the admin session cookie + JWTs in clear text — fine
  for a demo, add TLS before any real/graded external use.
- Postgres is not published to the host (internal compose network only).
- Redeploy after future pushes: `git pull && docker compose -f docker-compose.prod.yml up -d --build`.
- Known doc nit: DEPLOY.md §2's `git clone` command targets the default branch
  (`main`); this deploy uses `-b dev` instead since that's where the current work is.
