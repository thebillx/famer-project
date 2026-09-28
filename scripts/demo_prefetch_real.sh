#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  printf 'real demo prefetch error: %s\n' "$1" >&2
  exit 1
}

APP_ENV="${APP_ENV:-development}"
[[ "$APP_ENV" != "production" ]] || fail "refuses APP_ENV=production"

PYTHON_BIN="${AGRISCOPE_PYTHON:-$ROOT_DIR/.venv/bin/python}"
[[ -x "$PYTHON_BIN" ]] || fail "Python environment missing. Set AGRISCOPE_PYTHON to the project Python 3.12 executable."

PYTHON_VERSION="$("$PYTHON_BIN" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
[[ "$PYTHON_VERSION" == "3.12" ]] || fail "Python 3.12 is required; received $PYTHON_VERSION"

command -v docker >/dev/null 2>&1 || fail "Docker is required for the local PostGIS demo database"
[[ -n "${CDSE_CLIENT_ID:-}" ]] || fail "CDSE_CLIENT_ID is required"
[[ -n "${CDSE_CLIENT_SECRET:-}" ]] || fail "CDSE_CLIENT_SECRET is required"
[[ "${CDSE_CLIENT_ID}" != "ใส่-client-id-ของคุณ" ]] || fail "replace the CDSE_CLIENT_ID placeholder with a real credential"
[[ "${CDSE_CLIENT_SECRET}" != "ใส่-client-secret-ของคุณ" ]] || fail "replace the CDSE_CLIENT_SECRET placeholder with a real credential"

"$PYTHON_BIN" -c 'import alembic, fastapi, httpx, numpy, psycopg, rasterio, shapely, sqlalchemy' \
  || fail "Python satellite/demo dependencies are incomplete"

export APP_ENV
export DATABASE_URL="${DATABASE_URL:-postgresql+psycopg://agriscope:agriscope_dev_password@localhost:5432/agriscope}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}"
export SESSION_SECRET="${SESSION_SECRET:-change-me-development-session-secret-32}"
export ENCRYPTION_KEY="${ENCRYPTION_KEY:-change-me-development-encryption-key-32}"
export COOKIE_SECURE="${COOKIE_SECURE:-false}"

printf 'Starting local PostGIS for real demo prefetch...\n'
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

printf 'Prefetching real Sentinel-2 demo evidence...\n'
exec "$PYTHON_BIN" scripts/demo_prefetch_real.py "$@"
