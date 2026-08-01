import unittest
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from apps.api.agriscope_api.core.security import (
    InMemoryRefreshSessionStore,
    Role,
    TokenClaims,
    TokenType,
    create_token,
    hash_token,
    has_minimum_role,
    new_refresh_token,
    normalize_email,
    parse_token,
    validate_password_strength,
)


class SecurityFoundationTests(unittest.TestCase):
    def test_email_normalization_and_validation(self):
        self.assertEqual(normalize_email(" OWNER@Example.COM "), "owner@example.com")
        with self.assertRaises(ValueError):
            normalize_email("not-an-email")

    def test_password_strength_validation(self):
        validate_password_strength("StrongPassword123")
        with self.assertRaises(ValueError):
            validate_password_strength("weak")

    def test_password_hash_is_not_plaintext_token_hash(self):
        token = "refresh-token"
        hashed = hash_token(token)
        self.assertNotEqual(hashed, token)
        self.assertEqual(hashed, hash_token(token))

    def test_access_token_expired_rejected(self):
        secret = "s" * 40
        token = create_token(
            TokenClaims("user-1", TokenType.ACCESS, datetime.now(UTC) - timedelta(seconds=1)),
            secret,
        )
        with self.assertRaises(ValueError):
            parse_token(token, secret, TokenType.ACCESS)

    def test_wrong_token_type_rejected(self):
        secret = "s" * 40
        token = create_token(
            TokenClaims("user-1", TokenType.REFRESH, datetime.now(UTC) + timedelta(minutes=5)),
            secret,
        )
        with self.assertRaises(ValueError):
            parse_token(token, secret, TokenType.ACCESS)

    def test_refresh_rotation_revokes_old_session(self):
        store = InMemoryRefreshSessionStore()
        user_id = uuid4()
        old_token = new_refresh_token()
        session = store.create(user_id, old_token, ttl_days=1)
        new_token = new_refresh_token()
        rotated = store.rotate(session.id, old_token, new_token, ttl_days=1)
        self.assertFalse(store.sessions[session.id].is_active())
        self.assertTrue(rotated.is_active())
        self.assertEqual(rotated.rotated_from, session.id)

    def test_logout_revokes_refresh_session(self):
        store = InMemoryRefreshSessionStore()
        session = store.create(uuid4(), new_refresh_token(), ttl_days=1)
        store.revoke(session.id)
        self.assertFalse(session.is_active())

    def test_role_hierarchy(self):
        self.assertTrue(has_minimum_role(Role.ORGANIZATION_OWNER, Role.VIEWER))
        self.assertFalse(has_minimum_role(Role.VIEWER, Role.ORGANIZATION_ADMIN))


if __name__ == "__main__":
    unittest.main()
