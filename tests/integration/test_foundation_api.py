from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
import json
from decimal import Decimal
import os
import threading
from urllib.parse import unquote, urlsplit
from uuid import UUID, uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from apps.api.agriscope_api.application import create_app
from apps.api.agriscope_api.api.v1 import auth as auth_api
from apps.api.agriscope_api.api.v1.satellite import (
    SatelliteAvailableResponse,
    SatelliteEmptySearchResponse,
    SatelliteNotSearchedResponse,
    _search_response,
)
from apps.api.agriscope_api.core.errors import ApiException
from apps.api.agriscope_api.core.security import TokenClaims, TokenType, create_token, parse_token
from apps.api.agriscope_api.providers.cdse_stac import (
    CDSE_STAC_PROVIDER,
    SENTINEL_2_L2A_COLLECTION,
    CdseStacItem,
    CdseStacSearchResult,
    CdseStacUnavailable,
)
from apps.api.agriscope_api.providers.cdse_process import (
    CdseNdviSummary,
    CdseNdviRaster,
    CdseTrueColorPreview,
)
from apps.api.agriscope_api.services.satellite import SatelliteResponse
from packages.geospatial.agriscope_geospatial.field_geometry import geometry_fingerprint


TEST_DATABASE_ENV = "AGRISCOPE_TEST_DATABASE_URL"
APP_ORIGIN = "http://localhost:3000"


def _test_database_config() -> tuple[str, dict[str, str | int]]:
    raw_url = os.environ.get(TEST_DATABASE_ENV)
    if not raw_url:
        raise RuntimeError(
            f"{TEST_DATABASE_ENV} is required; integration tests never use the development database"
        )

    parsed = urlsplit(raw_url)
    database = unquote(parsed.path.removeprefix("/"))
    username = unquote(parsed.username or "")
    password = unquote(parsed.password or "")
    if (
        parsed.scheme != "postgresql+psycopg"
        or parsed.hostname != "127.0.0.1"
        or parsed.port is None
        or parsed.query
        or parsed.fragment
        or not username.startswith("agriscope_test_")
        or not database.startswith("agriscope_test_")
        or not password
    ):
        raise RuntimeError(
            f"{TEST_DATABASE_ENV} must identify a loopback-only agriscope_test database and user"
        )
    return raw_url, {
        "host": "127.0.0.1",
        "port": parsed.port,
        "dbname": database,
        "user": username,
        "password": password,
    }


@pytest.mark.parametrize(
    "database_url",
    [
        pytest.param(
            "postgresql+psycopg://agriscope_test_user:local-pass@127.0.0.1:5432/agriscope_test_ci",
            id="valid_disposable_local_host",
        ),
        pytest.param(None, id="missing_url"),
        pytest.param(
            "postgresql+psycopg://agriscope:dev-pass@127.0.0.1:5432/agriscope",
            id="development_identity",
        ),
        pytest.param(
            "postgresql://agriscope_test_user:local-pass@127.0.0.1:5432/agriscope_test_ci",
            id="wrong_scheme",
        ),
        pytest.param(
            "postgresql+psycopg://agriscope_test_user:local-pass@127.0.0.1/agriscope_test_ci",
            id="missing_port",
        ),
        pytest.param(
            "postgresql+psycopg://agriscope_test_user:local-pass@localhost:5432/agriscope_test_ci",
            id="non_loopback_host",
        ),
        pytest.param(
            "postgresql+psycopg://agriscope_test_user:local-pass@127.0.0.1:5432/agriscope_test_ci?sslmode=disable",
            id="query_rejected",
        ),
        pytest.param(
            "postgresql+psycopg://agriscope_test_user:local-pass@127.0.0.1:5432/agriscope_test_ci#build",
            id="fragment_rejected",
        ),
        pytest.param(
            "postgresql+psycopg://agriscope_test_user@127.0.0.1:5432/agriscope_test_ci",
            id="missing_password",
        ),
        pytest.param(
            "postgresql+psycopg://agriscope_ci_user:local-pass@127.0.0.1:5432/agriscope_test_ci",
            id="wrong_user_prefix",
        ),
        pytest.param(
            "postgresql+psycopg://agriscope_test_user:local-pass@127.0.0.1:5432/agri_ci_ci",
            id="wrong_database_prefix",
        ),
    ],
)
def test_database_config_url_contract(monkeypatch, database_url: str | None):
    calls = {"connect": 0}

    def guarded_connect(*_args, **_kwargs) -> None:
        calls["connect"] += 1
        raise AssertionError("unexpected database connection while validating URL")

    monkeypatch.setattr(psycopg, "connect", guarded_connect)

    if database_url is None:
        monkeypatch.delenv(TEST_DATABASE_ENV, raising=False)
        with pytest.raises(RuntimeError, match="required"):
            _test_database_config()
        assert calls["connect"] == 0
        return

    monkeypatch.setenv(TEST_DATABASE_ENV, database_url)
    if (
        database_url
        == "postgresql+psycopg://agriscope_test_user:local-pass@127.0.0.1:5432/agriscope_test_ci"
    ):
        parsed, connection = _test_database_config()
        assert parsed == database_url
        assert connection["host"] == "127.0.0.1"
        assert connection["port"] == 5432
        assert connection["user"] == "agriscope_test_user"
        assert connection["dbname"] == "agriscope_test_ci"
        assert connection["password"] == "local-pass"
        assert calls["connect"] == 0
        return

    with pytest.raises(RuntimeError):
        _test_database_config()
    assert calls["connect"] == 0


def _connect():
    _, connection = _test_database_config()
    return psycopg.connect(**connection)


def _truncate_application_tables() -> None:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "TRUNCATE field_ndvi_snapshots, field_observation_analyses, field_acquisitions, fields, farms, refresh_sessions, memberships, organizations, users"
            )


@pytest.fixture(scope="session", autouse=True)
def isolated_database():
    database_url, expected = _test_database_config()
    previous_database_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = database_url
    try:
        with psycopg.connect(**expected) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT current_database(), current_user, current_setting('server_version_num'), PostGIS_Lib_Version()"
                )
                database, user, server_version, postgis_version = cur.fetchone()
                assert database == expected["dbname"]
                assert user == expected["user"]
                assert str(server_version).startswith("16")
                assert str(postgis_version).startswith("3.4")
        yield
    finally:
        if previous_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous_database_url


@pytest.fixture(autouse=True)
def clean_database():
    _truncate_application_tables()
    try:
        yield
    finally:
        _truncate_application_tables()


@pytest.fixture
def client():
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def _prime_csrf(client: TestClient) -> str:
    response = client.get("/api/v1/auth/csrf")
    assert response.status_code == 200, response.text
    token = response.json()["csrf_token"]
    assert client.cookies["agriscope_csrf"] == token
    client.headers.update({"Origin": APP_ORIGIN, "X-CSRF-Token": token})
    return token


def _register(client: TestClient, email: str = "farmer@example.com") -> dict:
    _prime_csrf(client)
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "StrongPass12345",
            "display_name": "Farmer One",
            "organization_name": "North Farm",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_register_persists_user_org_owner_membership_and_sets_cookies(client: TestClient):
    body = _register(client)

    assert body["user"]["email"] == "farmer@example.com"
    assert body["organization"]["name"] == "North Farm"
    assert "agriscope_access" in client.cookies
    assert "agriscope_refresh" in client.cookies

    raw_refresh = client.cookies["agriscope_refresh"]
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT email, password_hash FROM users WHERE email = %s", ("farmer@example.com",)
            )
            user_row = cur.fetchone()
            assert user_row is not None
            assert user_row[1] != "StrongPass12345"

            cur.execute(
                """
                SELECT m.role, m.status
                FROM memberships m
                JOIN users u ON u.id = m.user_id
                WHERE u.email = %s
                """,
                ("farmer@example.com",),
            )
            membership_row = cur.fetchone()
            assert membership_row == ("organization_owner", "active")

            cur.execute("SELECT token_hash FROM refresh_sessions")
            token_hash = cur.fetchone()[0]
            assert token_hash != raw_refresh


def test_duplicate_email_and_invalid_credentials_use_safe_errors(client: TestClient):
    _register(client)
    duplicate = client.post(
        "/api/v1/auth/register",
        json={
            "email": "FARMER@example.com",
            "password": "StrongPass12345",
            "display_name": "Duplicate",
            "organization_name": "Other Farm",
        },
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "email_already_registered"

    failed = client.post(
        "/api/v1/auth/login",
        json={"email": "farmer@example.com", "password": "WrongPass12345"},
    )
    assert failed.status_code == 401
    assert failed.json()["error"]["message"] == "Invalid email or password"


def test_login_me_refresh_rotation_and_logout_revoke_database_session(client: TestClient):
    _register(client)
    client.cookies.clear()
    _prime_csrf(client)
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "farmer@example.com", "password": "StrongPass12345"},
    )
    assert login.status_code == 204
    login_cookies = [value.lower() for value in login.headers.get_list("set-cookie")]
    login_by_name = {value.split("=", 1)[0]: value for value in login_cookies}
    assert "max-age=900" in login_by_name["agriscope_access"]
    assert "path=/" in login_by_name["agriscope_access"]
    assert "max-age=2592000" in login_by_name["agriscope_refresh"]
    assert "path=/api/v1/auth" in login_by_name["agriscope_refresh"]
    assert all(
        "httponly" in value and "samesite=lax" in value and "domain=" not in value
        for value in login_by_name.values()
    )
    old_refresh = client.cookies["agriscope_refresh"]

    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "farmer@example.com"

    refresh = client.post("/api/v1/auth/refresh")
    assert refresh.status_code == 204
    refresh_cookie_names = {
        value.split("=", 1)[0].lower() for value in refresh.headers.get_list("set-cookie")
    }
    assert refresh_cookie_names == {"agriscope_access", "agriscope_refresh"}
    new_refresh = client.cookies["agriscope_refresh"]
    assert new_refresh != old_refresh

    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT previous.status, rotated.status
                FROM refresh_sessions rotated
                JOIN refresh_sessions previous ON previous.id = rotated.rotated_from
                """
            )
            rows = cur.fetchall()
            assert rows == [("revoked", "active")]

    client.cookies.set("agriscope_refresh", old_refresh, path="/api/v1/auth")
    old_refresh_response = client.post("/api/v1/auth/refresh")
    assert old_refresh_response.status_code == 401

    client.cookies.set("agriscope_refresh", new_refresh, path="/api/v1/auth")
    logout = client.post("/api/v1/auth/logout")
    assert logout.status_code == 204
    assert "agriscope_access" not in client.cookies

    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM refresh_sessions WHERE rotated_from IS NOT NULL")
            assert cur.fetchone()[0] == "revoked"


def test_concurrent_refresh_rotates_session_exactly_once(client: TestClient):
    _register(client)
    client.cookies.clear()
    _prime_csrf(client)
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "farmer@example.com", "password": "StrongPass12345"},
    )
    assert login.status_code == 204
    raw_refresh = client.cookies["agriscope_refresh"]
    old_session_id = UUID(
        parse_token(
            raw_refresh, client.app.state.settings.session_secret, TokenType.REFRESH
        ).session_id
    )

    def refresh_once() -> int:
        worker = TestClient(client.app)
        _prime_csrf(worker)
        worker.cookies.set("agriscope_refresh", raw_refresh, path="/api/v1/auth")
        return worker.post("/api/v1/auth/refresh").status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = sorted(executor.map(lambda _: refresh_once(), range(2)))

    assert statuses == [204, 401]
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM refresh_sessions WHERE id = %s", (old_session_id,))
            assert cur.fetchone()[0] == "revoked"
            cur.execute(
                """
                SELECT count(*)
                FROM refresh_sessions
                WHERE rotated_from = %s AND status = 'active'
                """,
                (old_session_id,),
            )
            assert cur.fetchone()[0] == 1
            cur.execute(
                """
                SELECT count(*)
                FROM refresh_sessions
                WHERE token_hash = %s
                """,
                (raw_refresh,),
            )
            assert cur.fetchone()[0] == 0


def test_expired_and_wrong_type_refresh_rejected(client: TestClient):
    _register(client)
    app = client.app
    settings = app.state.settings

    class BucketKinds:
        def __init__(self) -> None:
            self.calls: list[tuple[str, ...]] = []

        def check(self, buckets) -> None:
            self.calls.append(tuple(bucket.kind for bucket in buckets))

    limiter = BucketKinds()
    app.state.rate_limiter = limiter
    expired = create_token(
        TokenClaims(
            subject=str(uuid4()),
            token_type=TokenType.REFRESH,
            expires_at=datetime.now(UTC) - timedelta(seconds=1),
            session_id=str(uuid4()),
        ),
        settings.session_secret,
    )
    client.cookies.set("agriscope_refresh", expired, path="/api/v1/auth")
    assert client.post("/api/v1/auth/refresh").status_code == 401
    assert limiter.calls[-1] == ("session-ip", "session-token")

    wrong_type = create_token(
        TokenClaims(
            subject=str(uuid4()),
            token_type=TokenType.ACCESS,
            expires_at=datetime.now(UTC) + timedelta(minutes=5),
        ),
        settings.session_secret,
    )
    client.cookies.set("agriscope_refresh", wrong_type, path="/api/v1/auth")
    assert client.post("/api/v1/auth/refresh").status_code == 401
    assert limiter.calls[-1] == ("session-ip", "session-token")


def test_csrf_bootstrap_rotation_headers_and_cookie_attributes(client: TestClient):
    first_response = client.get("/api/v1/auth/csrf")
    first = first_response.json()["csrf_token"]
    second_response = client.get("/api/v1/auth/csrf")
    second = second_response.json()["csrf_token"]

    assert first != second
    assert first_response.headers["cache-control"] == "no-store"
    assert first_response.headers["vary"] == "Origin"
    cookie = first_response.headers.get_list("set-cookie")[0].lower()
    assert "agriscope_csrf=" in cookie
    assert "max-age=900" in cookie
    assert "path=/" in cookie
    assert "samesite=lax" in cookie
    assert "domain=" not in cookie
    assert "httponly" not in cookie


@pytest.mark.parametrize(
    "origin",
    [None, "null", "not-an-origin", "https://localhost:3000", "http://localhost:3001"],
)
def test_invalid_origin_rejects_registration_before_limiter_or_database(
    client: TestClient, origin: str | None
):
    token = _prime_csrf(client)
    client.headers.pop("Origin", None)
    if origin is not None:
        client.headers["Origin"] = origin
    before_keys = client.app.state.rate_limiter.active_entry_count()

    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "blocked@example.com",
            "password": "StrongPass12345",
            "display_name": "Blocked",
            "organization_name": "Blocked Farm",
        },
        headers={"X-CSRF-Token": token},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "csrf_failed"
    assert client.app.state.rate_limiter.active_entry_count() == before_keys
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM users WHERE email = 'blocked@example.com'")
            assert cur.fetchone()[0] == 0


def test_duplicate_origin_and_mismatched_token_fail_closed(client: TestClient):
    token = _prime_csrf(client)
    payload = {
        "email": "blocked@example.com",
        "password": "StrongPass12345",
        "display_name": "Blocked",
        "organization_name": "Blocked Farm",
    }
    duplicate_origin = client.post(
        "/api/v1/auth/register",
        json=payload,
        headers=[
            ("origin", APP_ORIGIN),
            ("origin", APP_ORIGIN),
            ("x-csrf-token", token),
        ],
    )
    mismatched_token = client.post(
        "/api/v1/auth/register",
        json=payload,
        headers={"Origin": APP_ORIGIN, "X-CSRF-Token": "not-the-cookie-token"},
    )
    assert duplicate_origin.status_code == 403
    assert mismatched_token.status_code == 403


def test_bearer_only_mutation_skips_csrf_but_auth_cookie_presence_enforces(client: TestClient):
    _register(client, "bearer@example.com")
    access_token = client.cookies["agriscope_access"]
    client.cookies.clear()
    client.headers.clear()
    client.headers["Authorization"] = f"Bearer {access_token}"

    bearer_only = client.post("/api/v1/organizations", json={"name": "Bearer Farm"})
    assert bearer_only.status_code == 201, bearer_only.text

    client.cookies.set("agriscope_access", access_token, path="/")
    cookie_bearing = client.post("/api/v1/organizations", json={"name": "Cookie Farm"})
    assert cookie_bearing.status_code == 403
    assert cookie_bearing.json()["error"]["code"] == "csrf_failed"


def test_logout_is_idempotent_exempt_from_limiter_and_clears_matching_cookies(client: TestClient):
    _register(client, "logout@example.com")

    class RejectEveryLimit:
        def check(self, _buckets) -> None:
            raise AssertionError("logout must not consult the limiter")

    client.app.state.rate_limiter = RejectEveryLimit()
    response = client.post("/api/v1/auth/logout")
    assert response.status_code == 204
    assert not {"agriscope_access", "agriscope_refresh", "agriscope_csrf"} & set(client.cookies)

    set_cookies = [value.lower() for value in response.headers.get_list("set-cookie")]
    by_name = {value.split("=", 1)[0]: value for value in set_cookies}
    assert set(by_name) == {"agriscope_access", "agriscope_refresh", "agriscope_csrf"}
    assert "path=/" in by_name["agriscope_access"]
    assert "httponly" in by_name["agriscope_access"]
    assert "path=/api/v1/auth" in by_name["agriscope_refresh"]
    assert "httponly" in by_name["agriscope_refresh"]
    assert "path=/" in by_name["agriscope_csrf"]
    assert "httponly" not in by_name["agriscope_csrf"]
    assert all("domain=" not in value and "samesite=lax" in value for value in by_name.values())

    client.cookies.set("agriscope_csrf", "again", path="/")
    client.headers.update({"Origin": APP_ORIGIN, "X-CSRF-Token": "again"})
    assert client.post("/api/v1/auth/logout").status_code == 204


@pytest.mark.parametrize("failure", ["revoke", "commit"])
def test_logout_terminal_cleanup_survives_transaction_failures(
    client: TestClient,
    monkeypatch,
    failure: str,
):
    _register(client, f"logout-{failure}@example.com")
    events: list[str] = []

    class FailingSession:
        async def commit(self) -> None:
            events.append("commit")
            if failure == "commit":
                raise RuntimeError("commit fixture failure")

        async def rollback(self) -> None:
            events.append("rollback")
            raise RuntimeError("rollback fixture failure")

        async def close(self) -> None:
            events.append("close")
            raise RuntimeError("close fixture failure")

    def session_factory():
        events.append("factory")
        return FailingSession()

    async def logout(_service, _session, _raw_refresh_token) -> None:
        events.append("revoke")
        if failure == "revoke":
            raise RuntimeError("revoke fixture failure")

    client.app.state.session_factory = session_factory
    monkeypatch.setattr(auth_api.AuthService, "logout", logout)

    response = client.post("/api/v1/auth/logout")
    assert response.status_code == 204
    assert not {"agriscope_access", "agriscope_refresh", "agriscope_csrf"} & set(client.cookies)
    if failure == "revoke":
        assert events == ["factory", "revoke", "rollback", "close"]
    else:
        assert events == ["factory", "revoke", "commit", "rollback", "close"]
    assert {
        value.split("=", 1)[0].lower() for value in response.headers.get_list("set-cookie")
    } == {"agriscope_access", "agriscope_refresh", "agriscope_csrf"}


@pytest.mark.parametrize("refresh_value", [None, "malformed-refresh-fixture"])
def test_logout_missing_or_malformed_refresh_never_opens_a_session(
    client: TestClient,
    refresh_value: str | None,
):
    _register(client, "logout-no-session@example.com")
    if refresh_value is None:
        client.cookies.delete("agriscope_refresh", path="/api/v1/auth")
    else:
        client.cookies.set(
            "agriscope_refresh",
            refresh_value,
            domain="testserver.local",
            path="/api/v1/auth",
        )

    def forbidden_session_factory():
        raise AssertionError("invalid refresh state must not open or mutate a session")

    client.app.state.session_factory = forbidden_session_factory
    response = client.post("/api/v1/auth/logout")
    assert response.status_code == 204
    assert not {"agriscope_access", "agriscope_refresh", "agriscope_csrf"} & set(client.cookies)


def test_validation_errors_exclude_raw_input_context_and_pii(client: TestClient):
    private_email = "private.person@example.com"
    private_password = "TopSecret9"
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": private_email,
            "password": private_password,
            "display_name": {"private": "display-value"},
        },
    )
    assert response.status_code == 422
    body = response.json()
    rendered = response.text
    assert private_email not in rendered
    assert private_password not in rendered
    assert '"password"' not in rendered.lower()
    assert "display-value" not in rendered
    errors = body["error"]["details"]["errors"]
    assert errors
    for item in errors:
        assert set(item) == {"loc", "type", "message"}
        assert isinstance(item["loc"], list)
        assert isinstance(item["type"], str)
        assert item["message"] in {"Field required", "Invalid value"}
    assert "input" not in rendered
    assert "ctx" not in rendered


def test_refresh_limit_keys_use_valid_subject_or_privacy_safe_token_fallback(client: TestClient):
    class CapturingLimiter:
        def __init__(self) -> None:
            self.calls: list[tuple[tuple[str, str], ...]] = []

        def check(self, buckets) -> None:
            self.calls.append(tuple((bucket.kind, bucket.value) for bucket in buckets))

    _register(client, "refresh-buckets@example.com")
    limiter = CapturingLimiter()
    client.app.state.rate_limiter = limiter
    valid_refresh = client.cookies["agriscope_refresh"]
    valid_subject = parse_token(
        valid_refresh,
        client.app.state.settings.session_secret,
        TokenType.REFRESH,
    ).subject
    assert client.post("/api/v1/auth/refresh").status_code == 204
    assert [kind for kind, _value in limiter.calls[-1]] == ["session-ip", "session-subject"]
    assert limiter.calls[-1][1][1] == valid_subject

    client.cookies.set("agriscope_refresh", "malformed-private-token", path="/api/v1/auth")
    assert client.post("/api/v1/auth/refresh").status_code == 401
    assert [kind for kind, _value in limiter.calls[-1]] == ["session-ip", "session-token"]

    client.cookies.delete("agriscope_refresh", path="/api/v1/auth")
    assert client.post("/api/v1/auth/refresh").status_code == 401
    assert [kind for kind, _value in limiter.calls[-1]] == ["session-ip"]


def test_organization_tenant_scope_and_disabled_membership(client: TestClient):
    first = _register(client, "owner@example.com")
    org_id = first["organization"]["id"]
    farm = _create_farm(client, org_id, name="privacy-scope-farm")
    field = _create_field(client, farm["id"], name="privacy-scope-field")
    second_client = TestClient(client.app)
    second = _register(second_client, "other@example.com")
    foreign_org_id = second["organization"]["id"]

    own_list = client.get("/api/v1/organizations")
    assert own_list.status_code == 200
    assert [item["id"] for item in own_list.json()] == [org_id]

    own_get = client.get(f"/api/v1/organizations/{org_id}")
    assert own_get.status_code == 200

    foreign_get = client.get(f"/api/v1/organizations/{foreign_org_id}")
    assert foreign_get.status_code == 404
    assert foreign_get.json()["error"]["code"] == "not_found"

    random_get = client.get(f"/api/v1/organizations/{uuid4()}")
    assert random_get.status_code == 404

    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM memberships WHERE organization_id = %s", (org_id,))
            assert cur.fetchone()[0] == 1

    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE memberships SET status = 'disabled' WHERE organization_id = %s", (org_id,)
            )
    disabled_org_list = client.get("/api/v1/organizations")
    assert disabled_org_list.status_code == 200
    assert disabled_org_list.json() == []
    disabled_farms = client.get("/api/v1/farms")
    assert disabled_farms.status_code == 200
    assert disabled_farms.json() == []
    disabled_farm = client.get(f"/api/v1/farms/{farm['id']}")
    assert disabled_farm.status_code == 404
    assert disabled_farm.json()["error"]["code"] == "not_found"
    disabled_field = client.get(f"/api/v1/fields/{field['id']}")
    assert disabled_field.status_code == 404
    assert disabled_field.json()["error"]["code"] == "not_found"

    client.app.state.cdse_stac_provider = FakeAvailableProvider()
    client.app.state.cdse_process_provider = FakeProcessProvider()
    limiter = TrackingLimiter()
    client.app.state.rate_limiter = limiter
    latest = client.get(f"/api/v1/fields/{field['id']}/satellite/latest")
    search = client.post(f"/api/v1/fields/{field['id']}/satellite/search-latest")
    preview = client.get(f"/api/v1/fields/{field['id']}/satellite/preview")
    ndvi = client.get(f"/api/v1/fields/{field['id']}/satellite/ndvi-summary")

    assert latest.status_code == 404
    assert search.status_code == 404
    assert preview.status_code == 404
    assert ndvi.status_code == 404
    assert limiter.calls == []
    assert client.app.state.cdse_stac_provider.calls == 0
    assert client.app.state.cdse_process_provider.render_calls == []
    assert client.app.state.cdse_process_provider.summary_calls == []
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM field_acquisitions WHERE field_id = %s", (field["id"],)
            )
            assert cur.fetchone()[0] == 0

    disabled = client.get(f"/api/v1/organizations/{org_id}/members")
    assert disabled.status_code == 404


def test_create_organization_requires_authentication_and_health_masks_dependencies(
    client: TestClient,
):
    anonymous = TestClient(client.app)
    unauthorized = anonymous.post("/api/v1/organizations", json={"name": "Other"})
    assert unauthorized.status_code == 401
    assert "error" in unauthorized.json()

    live = anonymous.get("/health/live")
    assert live.status_code == 200
    assert live.json() == {"status": "live"}

    ready = anonymous.get("/health/ready")
    assert ready.status_code == 200
    assert ready.json()["status"] == "ready"

    dependencies = anonymous.get("/health/dependencies")
    assert dependencies.status_code == 200
    assert dependencies.json()["database"] == "ok"


VALID_FIELD_GEOMETRY = {
    "type": "Polygon",
    "coordinates": [
        [
            [98.9801, 18.7901],
            [98.9811, 18.7901],
            [98.9811, 18.7911],
            [98.9801, 18.7911],
            [98.9801, 18.7901],
        ]
    ],
}


def _create_farm(client: TestClient, organization_id: str, name: str = "Farm 1") -> dict:
    response = client.post(
        "/api/v1/farms",
        json={"organization_id": organization_id, "name": name, "province": "Chiang Mai"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_field(client: TestClient, farm_id: str, name: str = "Field A") -> dict:
    response = client.post(
        f"/api/v1/farms/{farm_id}/fields",
        json={"name": name, "geometry": VALID_FIELD_GEOMETRY},
    )
    assert response.status_code == 201, response.text
    return response.json()


class FakeAvailableProvider:
    calls = 0
    geometries: list[dict] = []

    async def search_latest(self, geometry, *, now=None):
        self.calls += 1
        self.geometries.append(geometry)
        searched_at = now or datetime.now(UTC)
        return CdseStacSearchResult(
            item=CdseStacItem(
                provider=CDSE_STAC_PROVIDER,
                collection=SENTINEL_2_L2A_COLLECTION,
                item_id="S2A_MSIL2A_20260730T034541_TEST",
                acquired_at=datetime(2026, 7, 30, 3, 45, 41, tzinfo=UTC),
                cloud_cover_percent=12.4,
            ),
            searched_at=searched_at,
        )


class FakeNoDataProvider:
    def __init__(self) -> None:
        self.calls = 0

    async def search_latest(self, geometry, *, now=None):
        self.calls += 1
        return CdseStacSearchResult(item=None, searched_at=now or datetime.now(UTC))


class FakeProcessProvider:
    def __init__(self) -> None:
        self.render_calls: list[tuple[dict, datetime]] = []
        self.summary_calls: list[tuple[dict, datetime]] = []
        self.raster_calls: list[tuple[dict, datetime]] = []

    async def render_true_color(self, geometry, *, acquired_at, exact_observation=False):
        self.render_calls.append((geometry, acquired_at))
        return CdseTrueColorPreview(image_png=b"\x89PNG\x0d\x0a\x1a\x0a", valid_pixel_ratio=0.8)

    async def summarize_ndvi(self, geometry, *, acquired_at, exact_observation=False):
        self.summary_calls.append((geometry, acquired_at))
        return CdseNdviSummary(
            mean=0.5,
            minimum=0.1,
            maximum=0.9,
            standard_deviation=0.05,
            sample_count=100,
            valid_sample_count=80,
            valid_pixel_ratio=0.8,
        )

    async def render_ndvi_raster(self, geometry, *, acquired_at):
        import numpy as np
        from rasterio.io import MemoryFile
        from rasterio.transform import from_bounds

        self.raster_calls.append((geometry, acquired_at))
        before = acquired_at.day < 20
        values = np.full((4, 4), 0.75 if before else 0.70, dtype=np.float32)
        if not before:
            values[1:3, 1:3] = 0.45
        valid = np.ones((4, 4), dtype=np.float32)
        ring = geometry["coordinates"][0]
        west, east = min(point[0] for point in ring), max(point[0] for point in ring)
        south, north = min(point[1] for point in ring), max(point[1] for point in ring)
        with MemoryFile() as memory:
            with memory.open(driver="GTiff", width=4, height=4, count=2, dtype="float32",
                crs="EPSG:4326", transform=from_bounds(west, south, east, north, 4, 4),
                compress="deflate") as dataset:
                dataset.write(values, 1)
                dataset.write(valid, 2)
            body = memory.read()
        return CdseNdviRaster(body, 4, 4, (west, south, east, north), "EPSG:4326", 1.0)


class SingleFlightProcessProvider(FakeProcessProvider):
    def __init__(self) -> None:
        super().__init__()
        self._calls_lock = threading.Lock()
        self.summary_started = threading.Event()
        self.release_summary = threading.Event()

    async def summarize_ndvi(self, geometry, *, acquired_at, exact_observation=False):
        with self._calls_lock:
            self.summary_calls.append((geometry, acquired_at))
        self.summary_started.set()
        assert self.release_summary.wait(timeout=5)
        return CdseNdviSummary(
            mean=0.5,
            minimum=0.1,
            maximum=0.9,
            standard_deviation=0.05,
            sample_count=100,
            valid_sample_count=80,
            valid_pixel_ratio=0.8,
        )

    async def render_ndvi_raster(self, geometry, *, acquired_at):
        return await super().render_ndvi_raster(geometry, acquired_at=acquired_at)


class FakeUnavailableProvider:
    def __init__(self) -> None:
        self.calls = 0

    async def search_latest(self, geometry, *, now=None):
        self.calls += 1
        raise CdseStacUnavailable("fixture unavailable")


class TrackingLimiter:
    def __init__(self, *, reject: bool = False) -> None:
        self.reject = reject
        self.calls: list[tuple[str, ...]] = []

    def check(self, buckets) -> None:
        self.calls.append(tuple(bucket.kind for bucket in buckets))
        if self.reject:
            raise ApiException("rate_limited", "Too many requests", 429, {"retry_after": 30})


def test_farm_and_field_crud_persists_geometry_and_area(client: TestClient):
    registered = _register(client)
    organization_id = registered["organization"]["id"]

    farm = _create_farm(client, organization_id)
    listed_farms = client.get("/api/v1/farms")
    assert listed_farms.status_code == 200
    assert [item["id"] for item in listed_farms.json()] == [farm["id"]]

    created_field = client.post(
        f"/api/v1/farms/{farm['id']}/fields",
        json={"name": "Field A", "geometry": VALID_FIELD_GEOMETRY},
    )
    assert created_field.status_code == 201, created_field.text
    field = created_field.json()
    assert field["geometry"]["type"] == "Polygon"
    assert float(field["area_sqm"]) > 0
    assert float(field["area_rai"]) == round(float(field["area_sqm"]) / 1600, 4)

    reloaded_farm = client.get(f"/api/v1/farms/{farm['id']}")
    assert reloaded_farm.status_code == 200
    reloaded_fields = client.get(f"/api/v1/farms/{farm['id']}/fields")
    assert reloaded_fields.status_code == 200
    assert reloaded_fields.json()[0]["id"] == field["id"]
    assert reloaded_fields.json()[0]["geometry"] == field["geometry"]

    moved_geometry = {
        "type": "Polygon",
        "coordinates": [
            [
                [98.9802, 18.7901],
                [98.9812, 18.7901],
                [98.9812, 18.7911],
                [98.9802, 18.7911],
                [98.9802, 18.7901],
            ]
        ],
    }
    patched = client.patch(
        f"/api/v1/fields/{field['id']}",
        json={"name": "Field A North", "geometry": moved_geometry},
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Field A North"
    assert patched.json()["geometry"] == moved_geometry

    delete_field = client.delete(f"/api/v1/fields/{field['id']}")
    assert delete_field.status_code == 204
    assert client.get(f"/api/v1/fields/{field['id']}").status_code == 404

    delete_farm = client.delete(f"/api/v1/farms/{farm['id']}")
    assert delete_farm.status_code == 204
    assert client.get(f"/api/v1/farms/{farm['id']}").status_code == 404


def test_field_farm_organization_integrity_is_enforced_by_database(client: TestClient):
    first = _register(client, "db-owner-one@example.com")
    first_farm = _create_farm(client, first["organization"]["id"], "Farm One")

    second_client = TestClient(client.app)
    second = _register(second_client, "db-owner-two@example.com")
    second_farm = _create_farm(second_client, second["organization"]["id"], "Farm Two")

    api_field = client.post(
        f"/api/v1/farms/{first_farm['id']}/fields",
        json={"name": "Valid DB Field", "geometry": VALID_FIELD_GEOMETRY},
    )
    assert api_field.status_code == 201, api_field.text

    with _connect() as conn:
        with conn.cursor() as cur:
            with pytest.raises(psycopg.errors.ForeignKeyViolation):
                cur.execute(
                    """
                    INSERT INTO fields (farm_id, organization_id, name, geometry, area_sqm, area_rai, status)
                    VALUES (
                      %s,
                      %s,
                      'Mismatched tenant field',
                      ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)::geometry(Polygon, 4326),
                      1.00,
                      0.0006,
                      'active'
                    )
                    """,
                    (
                        second_farm["id"],
                        first["organization"]["id"],
                        json.dumps(VALID_FIELD_GEOMETRY),
                    ),
                )


def test_invalid_field_geometry_rejected(client: TestClient):
    registered = _register(client)
    farm = _create_farm(client, registered["organization"]["id"])
    invalid = {
        "type": "Polygon",
        "coordinates": [[[98.0, 18.0], [99.0, 19.0], [98.0, 19.0], [99.0, 18.0], [98.0, 18.0]]],
    }
    response = client.post(
        f"/api/v1/farms/{farm['id']}/fields", json={"name": "Bad", "geometry": invalid}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_geometry"


def test_farm_field_tenant_isolation_and_viewer_mutation_denial(client: TestClient):
    owner = _register(client, "owner-field@example.com")
    owner_org_id = owner["organization"]["id"]
    farm = _create_farm(client, owner_org_id)
    field = client.post(
        f"/api/v1/farms/{farm['id']}/fields",
        json={"name": "Field A", "geometry": VALID_FIELD_GEOMETRY},
    ).json()

    other_client = TestClient(client.app)
    _register(other_client, "other-field@example.com")
    assert other_client.get(f"/api/v1/farms/{farm['id']}").status_code == 404
    assert other_client.get(f"/api/v1/fields/{field['id']}").status_code == 404

    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", ("other-field@example.com",))
            other_user_id = cur.fetchone()[0]
            cur.execute(
                """
                INSERT INTO memberships (organization_id, user_id, role, status, joined_at)
                VALUES (%s, %s, 'viewer', 'active', now())
                """,
                (owner_org_id, other_user_id),
            )

    viewer_create = other_client.post(
        "/api/v1/farms",
        json={"organization_id": owner_org_id, "name": "Viewer Farm"},
    )
    assert viewer_create.status_code == 403
    same_org_farms = other_client.get("/api/v1/farms")
    assert same_org_farms.status_code == 200
    assert same_org_farms.json() == []
    assert other_client.get(f"/api/v1/farms/{farm['id']}").status_code == 404
    assert other_client.get(f"/api/v1/farms/{farm['id']}/fields").status_code == 404
    assert other_client.get(f"/api/v1/fields/{field['id']}").status_code == 404
    assert (
        other_client.patch(f"/api/v1/farms/{farm['id']}", json={"name": "Hidden"}).status_code
        == 404
    )
    assert other_client.delete(f"/api/v1/farms/{farm['id']}").status_code == 404
    assert (
        other_client.post(
            f"/api/v1/farms/{farm['id']}/fields",
            json={"name": "Hidden", "geometry": VALID_FIELD_GEOMETRY},
        ).status_code
        == 404
    )
    assert (
        other_client.patch(f"/api/v1/fields/{field['id']}", json={"name": "Hidden"}).status_code
        == 404
    )
    assert other_client.delete(f"/api/v1/fields/{field['id']}").status_code == 404


def test_creator_privacy_and_org_owner_override_after_role_change(client: TestClient):
    creator = _register(client, "creator-privacy@example.com")
    creator_org_id = creator["organization"]["id"]
    farm = _create_farm(client, creator_org_id, "Creator Farm")
    field = _create_field(client, farm["id"], "Creator Field")

    teammate_client = TestClient(client.app)
    _register(teammate_client, "teammate-privacy@example.com")

    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM users WHERE email = %s",
                ("creator-privacy@example.com",),
            )
            creator_user_id = cur.fetchone()[0]
            cur.execute(
                "SELECT id FROM users WHERE email = %s",
                ("teammate-privacy@example.com",),
            )
            teammate_user_id = cur.fetchone()[0]
            cur.execute(
                """
                UPDATE memberships
                SET organization_id = %s, role = 'viewer', status = 'active'
                WHERE user_id = %s
                """,
                (creator_org_id, teammate_user_id),
            )
            cur.execute(
                """
                UPDATE memberships
                SET role = 'viewer'
                WHERE user_id = %s
                """,
                (creator_user_id,),
            )

    same_org_farms = teammate_client.get("/api/v1/farms").json()
    assert same_org_farms == []
    assert teammate_client.get(f"/api/v1/farms/{farm['id']}").status_code == 404
    assert teammate_client.get(f"/api/v1/fields/{field['id']}").status_code == 404

    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE memberships
                SET role = 'organization_owner'
                WHERE user_id = %s
                """,
                (teammate_user_id,),
            )

    assert teammate_client.get("/api/v1/farms").json()[0]["id"] == farm["id"]
    assert teammate_client.get(f"/api/v1/farms/{farm['id']}").status_code == 200
    assert teammate_client.get(f"/api/v1/farms/{farm['id']}/fields").status_code == 200
    assert teammate_client.get(f"/api/v1/fields/{field['id']}").status_code == 200
    assert (
        teammate_client.patch(
            f"/api/v1/farms/{farm['id']}", json={"name": "Owner Override Farm"}
        ).status_code
        == 200
    )
    assert (
        teammate_client.patch(
            f"/api/v1/fields/{field['id']}", json={"name": "Owner Override Field"}
        ).status_code
        == 200
    )

    assert client.get("/api/v1/farms").json()[0]["id"] == farm["id"]
    assert client.get(f"/api/v1/farms/{farm['id']}").status_code == 200
    assert client.get(f"/api/v1/farms/{farm['id']}/fields").status_code == 200
    assert client.get(f"/api/v1/fields/{field['id']}").status_code == 200
    assert (
        client.post(
            "/api/v1/farms",
            json={"organization_id": creator_org_id, "name": "Viewer Cannot Create"},
        ).status_code
        == 403
    )
    assert (
        client.patch(f"/api/v1/farms/{farm['id']}", json={"name": "Creator Farm II"}).status_code
        == 403
    )
    assert (
        client.patch(f"/api/v1/fields/{field['id']}", json={"name": "Creator Field II"}).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/farms/{farm['id']}/fields",
            json={"name": "Viewer Cannot Create", "geometry": VALID_FIELD_GEOMETRY},
        ).status_code
        == 403
    )
    assert client.delete(f"/api/v1/fields/{field['id']}").status_code == 403
    assert client.delete(f"/api/v1/farms/{farm['id']}").status_code == 403


def test_satellite_search_persists_latest_acquisition_idempotently_and_uses_persisted_geometry(
    client: TestClient,
):
    registered = _register(client, "satellite-owner@example.com")
    farm = _create_farm(client, registered["organization"]["id"])
    field = _create_field(client, farm["id"])
    provider = FakeAvailableProvider()
    client.app.state.cdse_stac_provider = provider

    initial = client.get(f"/api/v1/fields/{field['id']}/satellite/latest")
    assert initial.status_code == 200
    assert initial.json() == {
        "field_id": field["id"],
        "status": "not_searched",
        "acquisition": None,
        "searched_at": None,
        "message_th": "ยังไม่มีผลการค้นหาดาวเทียมที่บันทึกไว้",
    }

    first = client.post(f"/api/v1/fields/{field['id']}/satellite/search-latest")
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["status"] == "available"
    assert body["acquisition"]["collection"] == SENTINEL_2_L2A_COLLECTION
    assert body["acquisition"]["item_id"] == "S2A_MSIL2A_20260730T034541_TEST"
    assert body["acquisition"]["cloud_cover_percent"] == 12.4
    assert provider.geometries == [field["geometry"]]

    second = client.post(f"/api/v1/fields/{field['id']}/satellite/search-latest")
    assert second.status_code == 200
    latest = client.get(f"/api/v1/fields/{field['id']}/satellite/latest")
    assert latest.status_code == 200
    assert latest.json()["acquisition"]["item_id"] == body["acquisition"]["item_id"]

    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT count(*), max(organization_id::text), max(provider_metadata::text)
                FROM field_acquisitions
                WHERE field_id = %s
                """,
                (field["id"],),
            )
            count, organization_id, metadata = cur.fetchone()
            assert count == 1
            assert str(organization_id) == field["organization_id"]
            assert "features" not in metadata


def test_satellite_no_data_unavailable_auth_and_tenant_scope(client: TestClient):
    registered = _register(client, "satellite-scope@example.com")
    farm = _create_farm(client, registered["organization"]["id"])
    field = _create_field(client, farm["id"])

    anonymous = TestClient(client.app)
    assert (
        anonymous.post(f"/api/v1/fields/{field['id']}/satellite/search-latest").status_code == 401
    )

    client.app.state.cdse_stac_provider = FakeNoDataProvider()
    no_data = client.post(f"/api/v1/fields/{field['id']}/satellite/search-latest")
    assert no_data.status_code == 200
    assert no_data.json()["status"] == "no_data"
    assert no_data.json()["acquisition"] is None
    assert no_data.json()["searched_at"] is not None

    client.app.state.cdse_stac_provider = FakeUnavailableProvider()
    unavailable = client.post(f"/api/v1/fields/{field['id']}/satellite/search-latest")
    assert unavailable.status_code == 200
    assert unavailable.json()["status"] == "temporarily_unavailable"
    assert unavailable.json()["acquisition"] is None
    assert unavailable.json()["searched_at"] is not None
    latest_after_negative = client.get(f"/api/v1/fields/{field['id']}/satellite/latest")
    assert latest_after_negative.json()["status"] == "not_searched"
    assert latest_after_negative.json()["searched_at"] is None

    other_client = TestClient(client.app)
    _register(other_client, "satellite-foreign@example.com")
    assert (
        other_client.post(f"/api/v1/fields/{field['id']}/satellite/search-latest").status_code
        == 404
    )
    assert client.post(f"/api/v1/fields/{uuid4()}/satellite/search-latest").status_code == 404

    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE fields SET status = 'deleted' WHERE id = %s", (field["id"],))
    assert client.post(f"/api/v1/fields/{field['id']}/satellite/search-latest").status_code == 404


def test_security_ordering_blocks_limiter_repository_and_provider_side_effects(client: TestClient):
    owner = _register(client, "ordering-owner@example.com")
    farm = _create_farm(client, owner["organization"]["id"])
    field = _create_field(client, farm["id"])
    provider = FakeNoDataProvider()
    client.app.state.cdse_stac_provider = provider

    limiter = TrackingLimiter()
    client.app.state.rate_limiter = limiter
    anonymous = TestClient(client.app)
    assert (
        anonymous.post(f"/api/v1/fields/{field['id']}/satellite/search-latest").status_code == 401
    )
    assert limiter.calls == []
    assert provider.calls == 0
    csrf_rejected = client.post(
        f"/api/v1/fields/{field['id']}/satellite/search-latest",
        headers={"Origin": APP_ORIGIN, "X-CSRF-Token": "mismatch"},
    )
    assert csrf_rejected.status_code == 403
    assert limiter.calls == []
    assert provider.calls == 0

    other = TestClient(client.app)
    _register(other, "ordering-other@example.com")
    limiter.calls.clear()
    foreign = other.post(f"/api/v1/fields/{field['id']}/satellite/search-latest")
    assert foreign.status_code == 404
    assert limiter.calls == []
    assert provider.calls == 0

    rejected_limiter = TrackingLimiter(reject=True)
    client.app.state.rate_limiter = rejected_limiter
    limited_search = client.post(f"/api/v1/fields/{field['id']}/satellite/search-latest")
    assert limited_search.status_code == 429
    assert limited_search.headers["retry-after"] == "30"
    assert rejected_limiter.calls == [("satellite-subject", "satellite-field")]
    assert provider.calls == 0

    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM field_acquisitions WHERE field_id = %s", (field["id"],)
            )
            assert cur.fetchone()[0] == 0
            cur.execute(
                "SELECT count(*) FROM farms WHERE organization_id = %s",
                (owner["organization"]["id"],),
            )
            before = cur.fetchone()[0]
    limited_mutation = client.post(
        "/api/v1/farms",
        json={"organization_id": owner["organization"]["id"], "name": "Never created"},
    )
    assert limited_mutation.status_code == 429
    assert rejected_limiter.calls[-1] == ("mutation-ip", "mutation-subject")
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM farms WHERE organization_id = %s",
                (owner["organization"]["id"],),
            )
            assert cur.fetchone()[0] == before


def test_role_failure_precedes_limiter_and_mutation(client: TestClient):
    owner = _register(client, "ordering-role-owner@example.com")
    owner_org_id = owner["organization"]["id"]
    viewer = TestClient(client.app)
    _register(viewer, "ordering-viewer@example.com")
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", ("ordering-viewer@example.com",))
            viewer_id = cur.fetchone()[0]
            cur.execute(
                """
                INSERT INTO memberships (organization_id, user_id, role, status, joined_at)
                VALUES (%s, %s, 'viewer', 'active', now())
                """,
                (owner_org_id, viewer_id),
            )

    limiter = TrackingLimiter()
    client.app.state.rate_limiter = limiter
    response = viewer.post(
        "/api/v1/farms",
        json={"organization_id": owner_org_id, "name": "Viewer must not create"},
    )
    assert response.status_code == 403
    assert limiter.calls == []
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM farms WHERE organization_id = %s", (owner_org_id,))
            assert cur.fetchone()[0] == 0


def test_satellite_viewer_can_search_and_database_rejects_mismatched_field_organization(
    client: TestClient,
):
    owner = _register(client, "satellite-db-owner@example.com")
    owner_org_id = owner["organization"]["id"]
    farm = _create_farm(client, owner_org_id)
    field = _create_field(client, farm["id"])

    viewer = TestClient(client.app)
    _register(viewer, "satellite-viewer@example.com")
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", ("satellite-viewer@example.com",))
            viewer_user_id = cur.fetchone()[0]
            cur.execute(
                """
                INSERT INTO memberships (organization_id, user_id, role, status, joined_at)
                VALUES (%s, %s, 'viewer', 'active', now())
                """,
                (owner_org_id, viewer_user_id),
            )
    viewer.app.state.cdse_stac_provider = FakeAvailableProvider()
    _prime_csrf(viewer)
    viewer.app.state.rate_limiter = TrackingLimiter()
    viewer_search = viewer.post(f"/api/v1/fields/{field['id']}/satellite/search-latest")
    assert viewer_search.status_code == 404
    assert viewer.app.state.rate_limiter.calls == []
    assert viewer.app.state.cdse_stac_provider.calls == 0

    other = _register(TestClient(client.app), "satellite-db-other@example.com")
    with _connect() as conn:
        with conn.cursor() as cur:
            with pytest.raises(psycopg.errors.ForeignKeyViolation):
                cur.execute(
                    """
                    INSERT INTO field_acquisitions (
                      field_id,
                      organization_id,
                      provider,
                      collection,
                      provider_item_id,
                      acquired_at,
                      cloud_cover_percent,
                      search_status,
                      searched_at,
                      provider_metadata
                    )
                    VALUES (%s, %s, 'cdse_stac', 'sentinel-2-l2a', 'mismatched-item', now(), %s, 'available', now(), '{}')
                    """,
                    (field["id"], other["organization"]["id"], Decimal("12.40")),
                )


def test_hidden_field_satellite_endpoints_return_generic_not_found_before_side_effects(
    client: TestClient,
):
    owner = _register(client, "satellite-hidden-owner@example.com")
    farm = _create_farm(client, owner["organization"]["id"])
    field = _create_field(client, farm["id"])

    client.app.state.cdse_stac_provider = FakeAvailableProvider()
    owner_search = client.post(f"/api/v1/fields/{field['id']}/satellite/search-latest")
    assert owner_search.status_code == 200

    teammate = TestClient(client.app)
    teammate_user = _register(teammate, "satellite-hidden-viewer@example.com")
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", (teammate_user["user"]["email"],))
            teammate_user_id = cur.fetchone()[0]
            cur.execute(
                """
                UPDATE memberships
                SET organization_id = %s, role = 'viewer', status = 'active'
                WHERE user_id = %s
                """,
                (owner["organization"]["id"], teammate_user_id),
            )

    teammate.app.state.cdse_stac_provider = FakeAvailableProvider()
    process_provider = FakeProcessProvider()
    teammate.app.state.cdse_process_provider = process_provider
    _prime_csrf(teammate)
    teammate.app.state.rate_limiter = TrackingLimiter()

    latest = teammate.get(f"/api/v1/fields/{field['id']}/satellite/latest")
    search = teammate.post(f"/api/v1/fields/{field['id']}/satellite/search-latest")
    preview = teammate.get(f"/api/v1/fields/{field['id']}/satellite/preview")
    ndvi = teammate.get(f"/api/v1/fields/{field['id']}/satellite/ndvi-summary")

    assert latest.status_code == 404
    assert search.status_code == 404
    assert preview.status_code == 404
    assert ndvi.status_code == 404
    assert teammate.app.state.rate_limiter.calls == []
    assert teammate.app.state.cdse_stac_provider.calls == 0
    assert process_provider.render_calls == []
    assert process_provider.summary_calls == []

    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM field_acquisitions WHERE field_id = %s", (field["id"],)
            )
            assert cur.fetchone()[0] == 1


def test_satellite_response_models_reject_impossible_discriminator_shapes():
    field_id = str(uuid4())
    now = datetime.now(UTC)
    valid_initial = SatelliteNotSearchedResponse(
        field_id=field_id,
        status="not_searched",
        acquisition=None,
        searched_at=None,
        message_th="ยังไม่มีผลการค้นหาดาวเทียมที่บันทึกไว้",
    )
    assert valid_initial.searched_at is None
    with pytest.raises(ValidationError):
        SatelliteNotSearchedResponse(
            field_id=field_id,
            status="not_searched",
            acquisition=None,
            searched_at=now,
            message_th="invalid",
        )
    with pytest.raises(ValidationError):
        SatelliteEmptySearchResponse(
            field_id=field_id,
            status="no_data",
            acquisition=None,
            searched_at=None,
            message_th="invalid",
        )
    with pytest.raises(ValidationError):
        SatelliteAvailableResponse(
            field_id=field_id,
            status="available",
            acquisition=None,
            searched_at=now,
            message_th="invalid",
        )
    with pytest.raises(ValueError, match="cannot return not_searched"):
        _search_response(
            SatelliteResponse(
                field_id=UUID(field_id),
                status="not_searched",
                acquisition=None,
                searched_at=None,
                message_th="initial state is GET-only",
            )
        )


def test_observation_history_raster_and_change_end_to_end(client: TestClient):
    registered = _register(client, "wave2a-owner@example.com")
    farm = _create_farm(client, registered["organization"]["id"])
    field = _create_field(client, farm["id"], "A02")
    before_at = datetime(2026, 8, 17, 3, tzinfo=UTC)
    after_at = datetime(2026, 8, 22, 3, tzinfo=UTC)
    with _connect() as conn:
        with conn.cursor() as cur:
            observation_ids = []
            for suffix, acquired_at, cloud in (("BEFORE", before_at, 2.0), ("AFTER", after_at, 6.0)):
                cur.execute("""
                    INSERT INTO field_acquisitions
                      (field_id, organization_id, provider, collection, provider_item_id,
                       acquired_at, cloud_cover_percent, search_status, searched_at, provider_metadata)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,'available',now(),%s::jsonb)
                    RETURNING id
                """, (field["id"], field["organization_id"], CDSE_STAC_PROVIDER,
                    SENTINEL_2_L2A_COLLECTION, f"S2_{suffix}", acquired_at, cloud,
                    json.dumps({"geometry_hash": geometry_fingerprint(field["geometry"])})))
                observation_ids.append(str(cur.fetchone()[0]))

    class TemporalProvider(FakeProcessProvider):
        async def summarize_ndvi(self, geometry, *, acquired_at, exact_observation=False):
            self.summary_calls.append((geometry, acquired_at))
            mean = 0.75 if acquired_at.day < 20 else 0.62
            return CdseNdviSummary(mean=mean, minimum=0.4, maximum=0.85,
                standard_deviation=0.08, sample_count=100, valid_sample_count=90,
                valid_pixel_ratio=0.9)

    provider = TemporalProvider()
    client.app.state.cdse_process_provider = provider
    history = client.get(f"/api/v1/fields/{field['id']}/observations")
    assert history.status_code == 200
    assert [item["observation_id"] for item in history.json()] == observation_ids[::-1]
    assert [item["cloud_percent"] for item in history.json()] == [6.0, 2.0]
    assert all(item["analysis_eligible"] is True for item in history.json())
    assert all(item["analysis_ready"] is False for item in history.json())
    assert all(item["comparison_eligible"] is True for item in history.json())

    for observation_id, expected in zip(observation_ids, (0.75, 0.62), strict=True):
        preview = client.get(f"/api/v1/fields/{field['id']}/observations/{observation_id}/preview")
        assert preview.status_code == 200
        summary = client.get(f"/api/v1/fields/{field['id']}/observations/{observation_id}/ndvi-summary")
        assert summary.status_code == 200, summary.text
        assert summary.json()["ndvi_mean"] == expected
        raster = client.get(f"/api/v1/fields/{field['id']}/observations/{observation_id}/ndvi-raster")
        assert raster.status_code == 200
        assert raster.json()["crs"] == "EPSG:4326"
        assert raster.json()["value_min"] == pytest.approx(0.45 if expected == 0.62 else 0.75)
        assert raster.json()["value_max"] == pytest.approx(0.70 if expected == 0.62 else 0.75)
        image = client.get(raster.json()["image_url"])
        assert image.status_code == 200 and image.content.startswith(b"\x89PNG")

    params = {"before": observation_ids[0], "after": observation_ids[1]}
    change = client.get(f"/api/v1/fields/{field['id']}/change", params=params)
    assert change.status_code == 200, change.text
    assert change.json()["ndvi_delta"] == pytest.approx(-0.13)
    assert change.json()["changed_area_rai"] > 0
    assert change.json()["geometry"]["type"] == "MultiPolygon"
    assert len(provider.summary_calls) == 2
    assert len(provider.raster_calls) == 2
    ready_history = client.get(f"/api/v1/fields/{field['id']}/observations")
    assert ready_history.status_code == 200
    assert all(item["analysis_ready"] is True for item in ready_history.json())
    assert client.get(f"/api/v1/fields/{field['id']}/change", params=params).status_code == 200
    assert len(provider.summary_calls) == 2 and len(provider.raster_calls) == 2
    client.app.state.rate_limiter = TrackingLimiter()
    reversed_params = {"before": observation_ids[1], "after": observation_ids[0]}
    assert client.get(f"/api/v1/fields/{field['id']}/change", params=reversed_params).status_code == 422
    same_params = {"before": observation_ids[0], "after": observation_ids[0]}
    assert client.get(f"/api/v1/fields/{field['id']}/change", params=same_params).status_code == 422

    other_field = _create_field(client, farm["id"], "B01")
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO field_acquisitions
                  (field_id, organization_id, provider, collection, provider_item_id,
                   acquired_at, cloud_cover_percent, search_status, searched_at, provider_metadata)
                VALUES (%s,%s,%s,%s,'S2_OTHER',%s,3,'available',now(),'{}'::jsonb)
                RETURNING id
            """, (other_field["id"], other_field["organization_id"], CDSE_STAC_PROVIDER,
                SENTINEL_2_L2A_COLLECTION, before_at))
            other_observation_id = str(cur.fetchone()[0])
            cur.execute("""
                INSERT INTO field_acquisitions
                  (field_id, organization_id, provider, collection, provider_item_id,
                   acquired_at, cloud_cover_percent, search_status, searched_at, provider_metadata)
                VALUES (%s,%s,%s,%s,'S2_CLOUD',%s,84,'available',now(),'{}'::jsonb)
                RETURNING id
            """, (field["id"], field["organization_id"], CDSE_STAC_PROVIDER,
                SENTINEL_2_L2A_COLLECTION, after_at + timedelta(days=5)))
            cloudy_observation_id = str(cur.fetchone()[0])
            cur.execute("""
                INSERT INTO field_acquisitions
                  (field_id, organization_id, provider, collection, provider_item_id,
                   acquired_at, cloud_cover_percent, search_status, searched_at, provider_metadata)
                VALUES (%s,%s,%s,%s,'S2_UNAVAILABLE',%s,5,'unavailable',now(),'{}'::jsonb)
                RETURNING id
            """, (field["id"], field["organization_id"], CDSE_STAC_PROVIDER,
                SENTINEL_2_L2A_COLLECTION, after_at + timedelta(days=10)))
            unavailable_observation_id = str(cur.fetchone()[0])
    client.app.state.rate_limiter = TrackingLimiter()
    cross_field = {"before": other_observation_id, "after": observation_ids[1]}
    assert client.get(f"/api/v1/fields/{field['id']}/change", params=cross_field).status_code == 404
    calls_before_cloud = (len(provider.render_calls), len(provider.summary_calls), len(provider.raster_calls))
    cloudy = client.get(f"/api/v1/fields/{field['id']}/observations/{cloudy_observation_id}/ndvi-summary")
    assert cloudy.status_code == 422
    assert cloudy.json()["error"]["code"] == "satellite_insufficient_quality"
    assert (len(provider.render_calls), len(provider.summary_calls), len(provider.raster_calls)) == calls_before_cloud
    unavailable = client.get(f"/api/v1/fields/{field['id']}/observations/{unavailable_observation_id}/preview")
    assert unavailable.status_code == 422
    assert unavailable.json()["error"]["code"] == "observation_unavailable"
    assert (len(provider.render_calls), len(provider.summary_calls), len(provider.raster_calls)) == calls_before_cloud

    anonymous = TestClient(client.app)
    assert anonymous.get(f"/api/v1/fields/{field['id']}/observations").status_code == 401
    assert anonymous.get(f"/api/v1/fields/{field['id']}/observations/{observation_ids[0]}/preview").status_code == 401
    assert (len(provider.render_calls), len(provider.summary_calls), len(provider.raster_calls)) == calls_before_cloud

    foreign = TestClient(client.app)
    _register(foreign, "wave2a-foreign@example.com")
    assert foreign.get(f"/api/v1/fields/{field['id']}/observations").status_code == 404
    assert foreign.get(f"/api/v1/fields/{field['id']}/observations/{observation_ids[0]}/ndvi-raster").status_code == 404


def test_concurrent_cold_cache_analysis_computes_provider_products_once(client: TestClient):
    registered = _register(client, "single-flight-owner@example.com")
    farm = _create_farm(client, registered["organization"]["id"])
    field = _create_field(client, farm["id"], "SINGLE-FLIGHT")
    acquired_at = datetime(2026, 8, 20, 3, tzinfo=UTC)
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO field_acquisitions
                  (field_id, organization_id, provider, collection, provider_item_id,
                   acquired_at, cloud_cover_percent, search_status, searched_at, provider_metadata)
                VALUES (%s,%s,%s,%s,'SINGLE_FLIGHT_ITEM',%s,5,'available',now(),%s::jsonb)
                RETURNING id
                """,
                (
                    field["id"],
                    field["organization_id"],
                    CDSE_STAC_PROVIDER,
                    SENTINEL_2_L2A_COLLECTION,
                    acquired_at,
                    json.dumps({"geometry_hash": geometry_fingerprint(field["geometry"])}),
                ),
            )
            observation_id = str(cur.fetchone()[0])

    provider = SingleFlightProcessProvider()
    client.app.state.cdse_process_provider = provider
    access_token = client.cookies["agriscope_access"]

    def request_summary() -> int:
        worker = TestClient(client.app)
        worker.cookies.set("agriscope_access", access_token, path="/")
        return worker.get(
            f"/api/v1/fields/{field['id']}/observations/{observation_id}/ndvi-summary"
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(request_summary)
        assert provider.summary_started.wait(timeout=5)
        second = executor.submit(request_summary)
        provider.release_summary.set()
        statuses = sorted((first.result(timeout=10), second.result(timeout=10)))

    assert statuses == [200, 200]
    assert len(provider.summary_calls) == 1
    assert len(provider.raster_calls) == 1


def test_concurrent_legacy_ndvi_summary_computes_provider_once(client: TestClient):
    registered = _register(client, "legacy-single-flight-owner@example.com")
    farm = _create_farm(client, registered["organization"]["id"])
    field = _create_field(client, farm["id"], "LEGACY-SINGLE-FLIGHT")
    acquired_at = datetime(2026, 8, 20, 3, tzinfo=UTC)
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO field_acquisitions
                  (field_id, organization_id, provider, collection, provider_item_id,
                   acquired_at, cloud_cover_percent, search_status, searched_at, provider_metadata)
                VALUES (%s,%s,%s,%s,'LEGACY_SINGLE_FLIGHT_ITEM',%s,5,'available',now(),%s::jsonb)
                """,
                (
                    field["id"],
                    field["organization_id"],
                    CDSE_STAC_PROVIDER,
                    SENTINEL_2_L2A_COLLECTION,
                    acquired_at,
                    json.dumps({"geometry_hash": geometry_fingerprint(field["geometry"])}),
                ),
            )

    provider = SingleFlightProcessProvider()
    client.app.state.cdse_process_provider = provider
    access_token = client.cookies["agriscope_access"]

    def request_summary() -> int:
        worker = TestClient(client.app)
        worker.cookies.set("agriscope_access", access_token, path="/")
        return worker.get(
            f"/api/v1/fields/{field['id']}/satellite/ndvi-summary"
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(request_summary)
        assert provider.summary_started.wait(timeout=5)
        second = executor.submit(request_summary)
        provider.release_summary.set()
        statuses = sorted((first.result(timeout=10), second.result(timeout=10)))

    assert statuses == [200, 200]
    assert len(provider.summary_calls) == 1


def test_legacy_observation_keeps_preview_but_reports_unverified_analysis(client: TestClient):
    registered = _register(client, "legacy-observation-owner@example.com")
    farm = _create_farm(client, registered["organization"]["id"])
    field = _create_field(client, farm["id"], "LEGACY")
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO field_acquisitions
                  (field_id, organization_id, provider, collection, provider_item_id,
                   acquired_at, cloud_cover_percent, search_status, searched_at, provider_metadata)
                VALUES (%s,%s,%s,%s,'LEGACY_ITEM',%s,5,'available',now(),'{}'::jsonb)
                RETURNING id
                """,
                (field["id"], field["organization_id"], CDSE_STAC_PROVIDER,
                 SENTINEL_2_L2A_COLLECTION, datetime(2026, 8, 20, 3, tzinfo=UTC)),
            )
            observation_id = str(cur.fetchone()[0])

    provider = FakeProcessProvider()
    client.app.state.cdse_process_provider = provider
    history = client.get(f"/api/v1/fields/{field['id']}/observations")
    assert history.status_code == 200
    assert history.json()[0]["imagery_available"] is True
    assert history.json()[0]["analysis_eligible"] is False
    assert history.json()[0]["analysis_ready"] is False
    preview = client.get(f"/api/v1/fields/{field['id']}/observations/{observation_id}/preview")
    assert preview.status_code == 200
    summary = client.get(f"/api/v1/fields/{field['id']}/observations/{observation_id}/ndvi-summary")
    assert summary.status_code == 422
    assert summary.json()["error"]["code"] == "observation_provenance_unavailable"
    assert provider.summary_calls == []


def test_geometry_edit_changes_analysis_identity_without_overwriting_history(client: TestClient):
    registered = _register(client, "geometry-lineage-owner@example.com")
    farm = _create_farm(client, registered["organization"]["id"])
    field = _create_field(client, farm["id"], "LINEAGE")
    original_geometry = field["geometry"]
    original_hash = geometry_fingerprint(original_geometry)
    acquired_at = datetime(2026, 8, 20, 3, tzinfo=UTC)
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO field_acquisitions
                  (field_id, organization_id, provider, collection, provider_item_id,
                   acquired_at, cloud_cover_percent, search_status, searched_at, provider_metadata)
                VALUES (%s,%s,%s,%s,'LINEAGE_ITEM',%s,5,'available',now(),%s::jsonb)
                RETURNING id
                """,
                (
                    field["id"],
                    field["organization_id"],
                    CDSE_STAC_PROVIDER,
                    SENTINEL_2_L2A_COLLECTION,
                    acquired_at,
                    json.dumps({"geometry_hash": original_hash}),
                ),
            )
            observation_id = str(cur.fetchone()[0])

    provider = FakeProcessProvider()
    client.app.state.cdse_process_provider = provider
    first_summary = client.get(
        f"/api/v1/fields/{field['id']}/observations/{observation_id}/ndvi-summary"
    )
    assert first_summary.status_code == 200
    assert len(provider.summary_calls) == 1

    renamed = client.patch(
        f"/api/v1/fields/{field['id']}", json={"name": "LINEAGE RENAMED"}
    )
    assert renamed.status_code == 200
    renamed_history = client.get(f"/api/v1/fields/{field['id']}/observations")
    assert renamed_history.status_code == 200
    renamed_observation = renamed_history.json()[0]
    assert renamed_observation["geometry_hash"] == original_hash
    assert renamed_observation["analysis_eligible"] is True
    assert renamed_observation["analysis_ready"] is True
    reused_summary = client.get(
        f"/api/v1/fields/{field['id']}/observations/{observation_id}/ndvi-summary"
    )
    assert reused_summary.status_code == 200
    assert len(provider.summary_calls) == 1

    moved_geometry = {
        "type": "Polygon",
        "coordinates": [
            [
                [98.9802, 18.7901],
                [98.9812, 18.7901],
                [98.9812, 18.7911],
                [98.9802, 18.7911],
                [98.9802, 18.7901],
            ]
        ],
    }
    moved = client.patch(
        f"/api/v1/fields/{field['id']}",
        json={"geometry": moved_geometry},
    )
    assert moved.status_code == 200
    moved_history = client.get(f"/api/v1/fields/{field['id']}/observations")
    assert moved_history.status_code == 200
    moved_observation = moved_history.json()[0]
    assert moved_observation["geometry_hash"] == original_hash
    assert moved_observation["analysis_eligible"] is False
    assert moved_observation["analysis_ready"] is False
    assert moved_observation["comparison_eligible"] is False
    blocked_summary = client.get(
        f"/api/v1/fields/{field['id']}/observations/{observation_id}/ndvi-summary"
    )
    assert blocked_summary.status_code == 422
    assert blocked_summary.json()["error"]["code"] == "observation_provenance_unavailable"
    assert len(provider.summary_calls) == 1

    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT count(*), array_agg(geometry_hash)
                FROM field_observation_analyses
                WHERE observation_id = %s
                """,
                (observation_id,),
            )
            count, hashes = cur.fetchone()
            assert count == 1
            assert hashes == [original_hash]
