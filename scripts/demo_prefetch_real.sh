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

[[ -n "${CDSE_CLIENT_ID:-}" ]] || fail "CDSE_CLIENT_ID is required"
[[ -n "${CDSE_CLIENT_SECRET:-}" ]] || fail "CDSE_CLIENT_SECRET is required"

"$PYTHON_BIN" -c 'import alembic, fastapi, httpx, numpy, psycopg, rasterio, shapely, sqlalchemy'   || fail "Python satellite/demo dependencies are incomplete"

exec "$PYTHON_BIN" scripts/demo_prefetch_real.py "$@"
