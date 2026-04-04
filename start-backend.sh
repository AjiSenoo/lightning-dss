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

echo "Running migrations..."
python manage.py migrate

echo "Seeding demo data..."
python manage.py seed_demo

echo ""
echo "Starting Django development server at http://localhost:8000"
echo "Admin panel: http://localhost:8000/admin"
echo ""
python manage.py runserver
