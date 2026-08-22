from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
import json
from decimal import Decimal
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
from apps.api.agriscope_api.services.satellite import SatelliteResponse


DATABASE_URL = "postgresql://agriscope:agriscope_dev_password@localhost:5432/agriscope"
APP_ORIGIN = "http://localhost:3000"


def _connect():
    return psycopg.connect(DATABASE_URL)


@pytest.fixture(autouse=True)
def clean_database():
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "TRUNCATE field_acquisitions, fields, farms, refresh_sessions, memberships, organizations, users RESTART IDENTITY"
            )
    yield


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
            cur.execute("SELECT email, password_hash FROM users WHERE email = %s", ("farmer@example.com",))
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
        parse_token(raw_refresh, client.app.state.settings.session_secret, TokenType.REFRESH).session_id
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
def test_invalid_origin_rejects_registration_before_limiter_or_database(client: TestClient, origin: str | None):
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
        client.cookies.set("agriscope_refresh", refresh_value, path="/api/v1/auth")

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
            cur.execute("UPDATE memberships SET status = 'disabled' WHERE organization_id = %s", (org_id,))
    disabled = client.get(f"/api/v1/organizations/{org_id}/members")
    assert disabled.status_code == 404


def test_create_organization_requires_authentication_and_health_masks_dependencies(client: TestClient):
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
                    (second_farm["id"], first["organization"]["id"], json.dumps(VALID_FIELD_GEOMETRY)),
                )


def test_invalid_field_geometry_rejected(client: TestClient):
    registered = _register(client)
    farm = _create_farm(client, registered["organization"]["id"])
    invalid = {
        "type": "Polygon",
        "coordinates": [
            [[98.0, 18.0], [99.0, 19.0], [98.0, 19.0], [99.0, 18.0], [98.0, 18.0]]
        ],
    }
    response = client.post(f"/api/v1/farms/{farm['id']}/fields", json={"name": "Bad", "geometry": invalid})
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
    viewer_read = other_client.get(f"/api/v1/farms/{farm['id']}")
    assert viewer_read.status_code == 200


def test_satellite_search_persists_latest_acquisition_idempotently_and_uses_persisted_geometry(client: TestClient):
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
    assert anonymous.post(f"/api/v1/fields/{field['id']}/satellite/search-latest").status_code == 401

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
    assert other_client.post(f"/api/v1/fields/{field['id']}/satellite/search-latest").status_code == 404
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
    assert anonymous.post(f"/api/v1/fields/{field['id']}/satellite/search-latest").status_code == 401
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
            cur.execute("SELECT count(*) FROM field_acquisitions WHERE field_id = %s", (field["id"],))
            assert cur.fetchone()[0] == 0
            cur.execute("SELECT count(*) FROM farms WHERE organization_id = %s", (owner["organization"]["id"],))
            before = cur.fetchone()[0]
    limited_mutation = client.post(
        "/api/v1/farms",
        json={"organization_id": owner["organization"]["id"], "name": "Never created"},
    )
    assert limited_mutation.status_code == 429
    assert rejected_limiter.calls[-1] == ("mutation-ip", "mutation-subject")
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM farms WHERE organization_id = %s", (owner["organization"]["id"],))
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


def test_satellite_viewer_can_search_and_database_rejects_mismatched_field_organization(client: TestClient):
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
    assert viewer.post(f"/api/v1/fields/{field['id']}/satellite/search-latest").status_code == 200

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
