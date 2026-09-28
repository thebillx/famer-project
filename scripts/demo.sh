#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  printf 'demo error: %s\n' "$1" >&2
  exit 1
}

APP_ENV="${APP_ENV:-development}"
[[ "$APP_ENV" != "production" ]] || fail "demo launcher refuses APP_ENV=production"

PYTHON_BIN="${AGRISCOPE_PYTHON:-$ROOT_DIR/.venv/bin/python}"
[[ -x "$PYTHON_BIN" ]] || fail "Python environment missing. Set AGRISCOPE_PYTHON to the project Python 3.12 executable."
PYTHON_VERSION="$("$PYTHON_BIN" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
[[ "$PYTHON_VERSION" == "3.12" ]] || fail "Python 3.12 is required; received $PYTHON_VERSION"

command -v docker >/dev/null 2>&1 || fail "Docker is required for the local PostGIS demo database"
command -v npm >/dev/null 2>&1 || fail "npm is required for the web application"
[[ -x "$ROOT_DIR/node_modules/.bin/next" ]] || fail "JavaScript dependencies are not installed. Run the pinned npm install workflow first."

"$PYTHON_BIN" -c 'import alembic, fastapi, numpy, psycopg, rasterio, shapely, sqlalchemy, uvicorn' \
  || fail "Python demo dependencies are incomplete"

export APP_ENV
export APP_URL="${APP_URL:-http://localhost:3000}"
export DATABASE_URL="${DATABASE_URL:-postgresql+psycopg://agriscope:agriscope_dev_password@localhost:5432/agriscope}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}"
export SESSION_SECRET="${SESSION_SECRET:-change-me-development-session-secret-32}"
export ENCRYPTION_KEY="${ENCRYPTION_KEY:-change-me-development-encryption-key-32}"
export COOKIE_SECURE="${COOKIE_SECURE:-false}"
export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://localhost:8000}"

printf 'Starting local PostGIS...\n'
docker compose up -d postgres

ready=0
for _ in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U agriscope -d agriscope >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[[ "$ready" == "1" ]] || fail "PostGIS did not become ready within 30 seconds"

printf 'Applying migrations...\n'
"$PYTHON_BIN" -m alembic -c apps/api/alembic.ini upgrade head

printf 'Seeding deterministic demo data...\n'
"$PYTHON_BIN" scripts/demo_seed.py --quiet

api_pid=""
web_pid=""
cleanup() {
  if [[ -n "$web_pid" ]] && kill -0 "$web_pid" 2>/dev/null; then
    kill "$web_pid" 2>/dev/null || true
  fi
  if [[ -n "$api_pid" ]] && kill -0 "$api_pid" 2>/dev/null; then
    kill "$api_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

printf 'Starting API...\n'
"$PYTHON_BIN" -m uvicorn apps.api.agriscope_api.main:app --host 127.0.0.1 --port 8000 &
api_pid=$!

printf 'Starting web app...\n'
npm -w apps/web run dev -- --hostname 127.0.0.1 --port 3000 &
web_pid=$!

cat <<'EOF'

AgriScope demo is starting:
  URL:      http://localhost:3000/login
  Email:    demo@agriscope.local
  Password: DemoPass12345

Recommended demo: open "พื้นที่สาธิตแม่เหียะ · Sentinel-2 จริง" if real data was prefetched.
Fallback demo: "สวนสาธิตเชียงใหม่ · ข้อมูลจำลอง" remains labelled "ข้อมูลสาธิต".
Press Ctrl-C to stop API and web processes.
EOF

while kill -0 "$api_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
  sleep 1
done

fail "API or web process exited unexpectedly"
