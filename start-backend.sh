#!/bin/bash
# Start Lightning DSS Backend
cd "$(dirname "$0")/backend"

# Create venv if not exists
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt -q

# Load .env if present (provides DATABASE_URL and other overrides)
if [ -f .env ]; then
  set -a; source .env; set +a
fi

echo "Running migrations..."
python manage.py migrate

SEED_DEMO="${SEED_DEMO:-1}"
if [ "$SEED_DEMO" = "1" ]; then
  echo "Seeding demo data..."
  SEED_DEMO=1 python manage.py seed_demo
else
  echo "SEED_DEMO=0 — skipping demo seed."
fi

echo ""
echo "Starting Django development server at http://localhost:8000"
echo "Admin panel: http://localhost:8000/admin"
echo ""
python manage.py runserver
