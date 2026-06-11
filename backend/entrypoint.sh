#!/bin/sh
set -e

echo "==> Applying database migrations"
python manage.py migrate --noinput

echo "==> Collecting static files"
python manage.py collectstatic --noinput

if [ "${SEED_DEMO:-0}" = "1" ]; then
  echo "==> Seeding demo data (SEED_DEMO=1)"
  SEED_DEMO=1 python manage.py seed_demo || echo "seed_demo failed (non-fatal), continuing"
fi

WORKERS="${GUNICORN_WORKERS:-2}"
echo "==> Starting gunicorn ($WORKERS workers) on :8000"
exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers "$WORKERS" \
  --timeout 60 \
  --access-logfile - \
  --error-logfile -
