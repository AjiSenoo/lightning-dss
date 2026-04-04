#!/bin/bash
# Start Lightning DSS Frontend
cd "$(dirname "$0")/frontend"

if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
fi

echo ""
echo "Starting Vite dev server at http://localhost:5173"
echo ""
npm run dev
