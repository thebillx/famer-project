"""Password hashing, token, session, and RBAC policy foundation."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
import base64
import hashlib
import hmac
import json
import re
import secrets
from uuid import UUID, uuid4


class Role(StrEnum):
    ORGANIZATION_OWNER = "organization_owner"
    ORGANIZATION_ADMIN = "organization_admin"
    AGRONOMIST = "agronomist"
    FIELD_MANAGER = "field_manager"
    VIEWER = "viewer"


ROLE_RANK = {
    Role.ORGANIZATION_OWNER: 50,
    Role.ORGANIZATION_ADMIN: 40,
    Role.AGRONOMIST: 30,
    Role.FIELD_MANAGER: 20,
    Role.VIEWER: 10,
}


class TokenType(StrEnum):
    ACCESS = "access"
    REFRESH = "refresh"


class SessionStatus(StrEnum):
    ACTIVE = "active"
    REVOKED = "revoked"


@dataclass(frozen=True)
class TokenClaims:
    subject: str
    token_type: TokenType
    expires_at: datetime
    session_id: str | None = None


@dataclass
class RefreshSession:
    id: UUID
    user_id: UUID
    token_hash: str
    expires_at: datetime
    status: SessionStatus = SessionStatus.ACTIVE
    rotated_from: UUID | None = None

    def is_active(self, now: datetime | None = None) -> bool:
        now = now or datetime.now(UTC)
        return self.status == SessionStatus.ACTIVE and self.expires_at > now


class InMemoryRefreshSessionStore:
    """Testable refresh-session strategy.

    Production will persist this interface in the database. This in-memory
    implementation exists for unit tests and local contract behavior only.
    """

    def __init__(self) -> None:
        self.sessions: dict[UUID, RefreshSession] = {}

    def create(self, user_id: UUID, raw_refresh_token: str, ttl_days: int) -> RefreshSession:
        session = RefreshSession(
            id=uuid4(),
            user_id=user_id,
            token_hash=hash_token(raw_refresh_token),
            expires_at=datetime.now(UTC) + timedelta(days=ttl_days),
        )
        self.sessions[session.id] = session
        return session

    def rotate(
        self, session_id: UUID, raw_old_token: str, raw_new_token: str, ttl_days: int
    ) -> RefreshSession:
        existing = self.sessions[session_id]
        if not existing.is_active() or not hmac.compare_digest(
            existing.token_hash, hash_token(raw_old_token)
        ):
            raise ValueError("invalid refresh session")
        existing.status = SessionStatus.REVOKED
        rotated = RefreshSession(
            id=uuid4(),
            user_id=existing.user_id,
            token_hash=hash_token(raw_new_token),
            expires_at=datetime.now(UTC) + timedelta(days=ttl_days),
            rotated_from=existing.id,
        )
        self.sessions[rotated.id] = rotated
        return rotated

    def revoke(self, session_id: UUID) -> None:
        if session_id in self.sessions:
            self.sessions[session_id].status = SessionStatus.REVOKED


def normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", normalized):
        raise ValueError("invalid email")
    return normalized


def validate_password_strength(password: str) -> None:
    if len(password) < 12:
        raise ValueError("password must be at least 12 characters")
    if not re.search(r"[A-Z]", password):
        raise ValueError("password must include an uppercase letter")
    if not re.search(r"[a-z]", password):
        raise ValueError("password must include a lowercase letter")
    if not re.search(r"[0-9]", password):
        raise ValueError("password must include a number")


class PasswordHasher:
    algorithm = "argon2id"

    def __init__(self) -> None:
        try:
            from argon2 import PasswordHasher as Argon2PasswordHasher
        except Exception as exc:  # pragma: no cover - exercised in dependency-light env
            self._argon2 = None
            self._import_error = exc
        else:
            self._argon2 = Argon2PasswordHasher()
            self._import_error = None

    def hash(self, password: str) -> str:
        validate_password_strength(password)
        if self._argon2 is None:
            raise RuntimeError("argon2-cffi is required for password hashing")
        return self._argon2.hash(password)

    def verify(self, password_hash: str, password: str) -> bool:
        if self._argon2 is None:
            raise RuntimeError("argon2-cffi is required for password verification")
        try:
            return bool(self._argon2.verify(password_hash, password))
        except Exception:
            return False


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_token(claims: TokenClaims, secret: str) -> str:
    payload = {
        "sub": claims.subject,
        "typ": claims.token_type.value,
        "exp": int(claims.expires_at.timestamp()),
    }
    if claims.session_id:
        payload["sid"] = claims.session_id
    encoded = _b64url(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    signature = hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).digest()
    return f"{encoded}.{_b64url(signature)}"


def parse_token(token: str, secret: str, expected_type: TokenType) -> TokenClaims:
    try:
        encoded, signature = token.split(".", 1)
    except ValueError as exc:
        raise ValueError("invalid token") from exc
    expected_signature = _b64url(hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(signature, expected_signature):
        raise ValueError("invalid token")
    payload = json.loads(_b64url_decode(encoded))
    token_type = TokenType(payload["typ"])
    if token_type != expected_type:
        raise ValueError("wrong token type")
    expires_at = datetime.fromtimestamp(int(payload["exp"]), UTC)
    if expires_at <= datetime.now(UTC):
        raise ValueError("expired token")
    return TokenClaims(
        subject=str(payload["sub"]),
        token_type=token_type,
        expires_at=expires_at,
        session_id=payload.get("sid"),
    )


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def has_minimum_role(actual: Role, required: Role) -> bool:
    return ROLE_RANK[actual] >= ROLE_RANK[required]


def require_role(actual: Role, required: Role) -> None:
    if not has_minimum_role(actual, required):
        raise PermissionError("insufficient role")
