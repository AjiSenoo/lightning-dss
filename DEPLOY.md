# Deploying Lightning DSS on an Ubuntu VPS (Docker)

Single-origin stack: **nginx** serves the React build and reverse-proxies the
Django API + admin to **gunicorn**, with **Postgres** alongside. Everything runs
behind one host port (`HTTP_PORT`, default `8080`) so it won't collide with other
workloads (e.g. an LLM agent) on the same box.

```
browser ──▶ nginx :8080 ──┬─▶  /            React SPA (static)
                          ├─▶  /api, /admin  gunicorn (web:8000)
                          └─▶  /static,/media shared volumes
                                   │
                              Postgres (internal network only)
```

## 1. Prerequisites on the VPS

```bash
# Docker Engine + compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # re-login after this
docker compose version          # must be v2.x (the `deploy.resources` limits need it)
```

Check you have headroom alongside your other workloads:
```bash
free -h          # this stack needs ~1.1 GB at the configured limits
```

## 2. Get the code and configure

```bash
git clone https://github.com/AjiSenoo/lightning-dss.git
cd lightning-dss
cp .env.example .env
nano .env        # set SECRET_KEY, POSTGRES_PASSWORD, ALLOWED_HOSTS=<your-vps-ip>,
                 # CSRF_TRUSTED_ORIGINS=http://<your-vps-ip>:8080, HTTP_PORT
```

Generate secrets:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(24))"   # POSTGRES_PASSWORD
```

## 3. First boot (with demo data)

```bash
# Seed once so you have a login to test with
SEED_DEMO=1 docker compose -f docker-compose.prod.yml up -d --build
```
The entrypoint runs `migrate` + `collectstatic` automatically. After it's healthy,
**set `SEED_DEMO=0` in `.env`** so later restarts don't reseed.

Create your real admin user:
```bash
docker compose -f docker-compose.prod.yml exec web python manage.py createsuperuser
```

## 4. Open the firewall for the chosen port

```bash
sudo ufw allow 8080/tcp     # match HTTP_PORT
```
Visit `http://<your-vps-ip>:8080` — app — and `/admin` for Django admin.

## 5. Everyday operations

```bash
CF="docker compose -f docker-compose.prod.yml"
$CF ps                       # status
$CF logs -f web              # gunicorn / app logs (logger.exception output lands here)
$CF up -d --build            # redeploy after `git pull`
$CF down                     # stop (keeps volumes/data)
$CF exec web python manage.py recompute_health_all   # bulk AHI refresh
```

Backup the database:
```bash
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U lightning lightning_dss > backup_$(date +%F).sql
```

## Resource tuning (shared box)

`docker-compose.prod.yml` caps memory: web 768M, db 256M, nginx 128M (~1.1 GB total).
Each gunicorn worker loads numpy/scipy (~250 MB). If RAM is tight, keep
`GUNICORN_WORKERS=2`; if you have room and traffic, raise it and the web `memory` limit.

## Upgrading to HTTPS later

No domain is required to start, but secure cookies and HSTS need TLS. Easiest path:

1. Point a (sub)domain at the VPS — or use a free wildcard-DNS host like
   `nip.io` (`<ip>.nip.io` resolves to your IP and works with Let's Encrypt).
2. Add a certbot/Caddy TLS terminator in front (or extend the nginx service with
   certbot), then in `.env` set `SECURE_SSL_REDIRECT=True`, `SESSION_COOKIE_SECURE=True`,
   `CSRF_COOKIE_SECURE=True`, and update `ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS`
   to the `https://` domain.

## Security notes

- Postgres is **not** published to the host — only the internal compose network.
- `.env` holds secrets; it is git-ignored. Never commit it.
- Plain-HTTP-on-IP mode (the `.env.example` defaults) is fine for a demo but
  transmits the admin session cookie and JWTs in clear text. Add TLS before real use.
