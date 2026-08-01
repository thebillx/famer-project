from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient

from apps.api.agriscope_api.application import create_app
from apps.api.agriscope_api.core.security import TokenClaims, TokenType, create_token


DATABASE_URL = "postgresql://agriscope:agriscope_dev_password@localhost:5432/agriscope"


def _connect():
    return psycopg.connect(DATABASE_URL)


@pytest.fixture(autouse=True)
def clean_database():
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE refresh_sessions, memberships, organizations, users RESTART IDENTITY")
    yield


@pytest.fixture
def client():
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def _register(client: TestClient, email: str = "farmer@example.com") -> dict:
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
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "farmer@example.com", "password": "StrongPass12345"},
    )
    assert login.status_code == 204
    old_refresh = client.cookies["agriscope_refresh"]

    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "farmer@example.com"

    refresh = client.post("/api/v1/auth/refresh")
    assert refresh.status_code == 204
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


def test_expired_and_wrong_type_refresh_rejected(client: TestClient):
    _register(client)
    app = client.app
    settings = app.state.settings
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
