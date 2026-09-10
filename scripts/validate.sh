#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PYTHON_BIN="${AGRISCOPE_PYTHON:-$ROOT_DIR/.venv/bin/python}"
MODE="${1:-all}"

fail() {
  printf 'validation error: %s\n' "$1" >&2
  exit 1
}

[[ -x "$PYTHON_BIN" ]] || fail "AGRISCOPE_PYTHON must point to an executable Python 3.12 environment"

PYTHON_VERSION="$($PYTHON_BIN -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
[[ "$PYTHON_VERSION" == "3.12" ]] || fail "Python 3.12 is required; received $PYTHON_VERSION"

case "$MODE" in
  static|integration|browser|all) ;;
  *) fail "usage: bash scripts/validate.sh {static|integration|browser|all}" ;;
esac

require_python_dependencies() {
  "$PYTHON_BIN" -c 'import alembic, fastapi, numpy, psycopg, pytest, rasterio, ruff, shapely, sqlalchemy'
}

require_javascript_dependencies() {
  [[ -x "$ROOT_DIR/node_modules/.bin/next" ]] || fail "pinned JavaScript dependencies are not installed"
  [[ -x "$ROOT_DIR/node_modules/.bin/tsc" ]] || fail "pinned JavaScript dependencies are not installed"
}

require_browser_dependencies() {
  require_javascript_dependencies
  [[ -x "$ROOT_DIR/node_modules/.bin/playwright" ]] || fail "pinned browser dependencies are not installed"
}

validate_test_database() {
  [[ -n "${AGRISCOPE_TEST_DATABASE_URL:-}" ]] || fail "AGRISCOPE_TEST_DATABASE_URL is required for database-backed validation"
  "$PYTHON_BIN" - <<'PY'
import os
from urllib.parse import unquote, urlsplit

raw_url = os.environ.get("AGRISCOPE_TEST_DATABASE_URL", "")
parsed = urlsplit(raw_url)
database = unquote(parsed.path.removeprefix("/"))
username = unquote(parsed.username or "")
if (
    parsed.scheme != "postgresql+psycopg"
    or parsed.hostname != "127.0.0.1"
    or parsed.port is None
    or parsed.query
    or parsed.fragment
    or not username.startswith("agriscope_test_")
    or not database.startswith("agriscope_test_")
    or not parsed.password
):
    raise SystemExit(
        "AGRISCOPE_TEST_DATABASE_URL must identify a loopback-only agriscope_test database and user"
    )
PY
}

run_static() {
  require_python_dependencies
  require_javascript_dependencies
  "$PYTHON_BIN" -m ruff check apps/api packages tests
  "$PYTHON_BIN" -m pytest -q tests/unit tests/contract
  npm -w apps/web run typecheck
  npm -w apps/web run build
  git diff --check
}

run_integration() {
  require_python_dependencies
  validate_test_database
  DATABASE_URL="$AGRISCOPE_TEST_DATABASE_URL" "$PYTHON_BIN" -m alembic -c apps/api/alembic.ini upgrade head
  DATABASE_URL="$AGRISCOPE_TEST_DATABASE_URL" "$PYTHON_BIN" -m pytest -q tests/integration/test_foundation_api.py
}

run_browser() {
  require_python_dependencies
  require_browser_dependencies
  validate_test_database
  DATABASE_URL="$AGRISCOPE_TEST_DATABASE_URL" "$PYTHON_BIN" -m alembic -c apps/api/alembic.ini upgrade head
  evidence_dir="${MAP_VISUAL_ARTIFACT_DIR:-$ROOT_DIR/test-results/agriscope-pr10-native}"
  [[ "$evidence_dir" = /* ]] || evidence_dir="$ROOT_DIR/$evidence_dir"
  mkdir -p "$evidence_dir"
  DATABASE_URL="$AGRISCOPE_TEST_DATABASE_URL" \
    AGRISCOPE_TEST_DATABASE_URL="$AGRISCOPE_TEST_DATABASE_URL" \
    AGRISCOPE_PYTHON="$PYTHON_BIN" \
    MAP_VISUAL_ARTIFACT_DIR="$evidence_dir" \
    npx --no-install playwright test -c apps/web/playwright.config.ts \
      tests/e2e/farm-fields-list-001.spec.ts \
      tests/e2e/farms-list-001.spec.ts \
      tests/e2e/field-001.spec.ts \
      tests/e2e/map-workspace-001.spec.ts \
      tests/e2e/web-security.spec.ts \
      --project=chromium --workers=1
  DATABASE_URL="$AGRISCOPE_TEST_DATABASE_URL" \
    AGRISCOPE_TEST_DATABASE_URL="$AGRISCOPE_TEST_DATABASE_URL" \
    AGRISCOPE_PYTHON="$PYTHON_BIN" \
    MAP_VISUAL_ARTIFACT_DIR="$evidence_dir" \
    npx --no-install playwright test -c apps/web/playwright.config.ts \
      tests/e2e/field-workspace-001.spec.ts \
      tests/e2e/field-workspace-api-backed.spec.ts \
      --project=chromium --workers=1
  DATABASE_URL="$AGRISCOPE_TEST_DATABASE_URL" \
    AGRISCOPE_TEST_DATABASE_URL="$AGRISCOPE_TEST_DATABASE_URL" \
    AGRISCOPE_PYTHON="$PYTHON_BIN" \
    MAP_VISUAL_ARTIFACT_DIR="$evidence_dir" \
    npx --no-install playwright test -c apps/web/playwright.config.ts \
      tests/e2e/field-workspace-001.spec.ts \
      --project=mobile-observation --workers=1
}

case "$MODE" in
  static)
    run_static
    ;;
  integration)
    run_integration
    ;;
  browser)
    run_browser
    ;;
  all)
    run_static
    run_integration
    run_browser
    ;;
esac
