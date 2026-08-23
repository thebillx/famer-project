import unittest

from apps.api.agriscope_api.core.config import (
    SettingsSnapshot,
    settings_from_env,
    validate_settings,
)


class SettingsFoundationTests(unittest.TestCase):
    def test_development_configuration_accepted(self):
        settings = settings_from_env({"APP_ENV": "development"})
        self.assertEqual(validate_settings(settings), [])

    def test_missing_production_secret_rejected(self):
        settings = SettingsSnapshot(
            app_env="production",
            app_name="AgriScope Thailand",
            app_url="https://example.com",
            api_v1_prefix="/api/v1",
            database_url="",
            redis_url="redis://localhost:6379/0",
            object_storage_endpoint="https://storage.example.com",
            object_storage_bucket="agriscope",
            session_secret="x" * 40,
            encryption_key="y" * 40,
            access_token_ttl_minutes=15,
            refresh_token_ttl_days=30,
            cookie_secure=True,
            cookie_samesite="lax",
            log_level="INFO",
            cdse_stac_url="https://stac.dataspace.copernicus.eu/v1/search",
            satellite_search_lookback_days=90,
            satellite_search_timeout_seconds=15,
            satellite_max_cloud_cover_percent=80.0,
        )
        issues = validate_settings(settings)
        self.assertTrue(any(issue.field == "DATABASE_URL" for issue in issues))

    def test_known_development_secret_rejected_in_production(self):
        settings = settings_from_env(
            {
                "APP_ENV": "production",
                "DATABASE_URL": "postgresql+asyncpg://user:pass@localhost/db",
                "REDIS_URL": "redis://localhost:6379/0",
                "OBJECT_STORAGE_ENDPOINT": "https://storage.example.com",
                "OBJECT_STORAGE_BUCKET": "agriscope",
                "SESSION_SECRET": "change-me-development-session-secret-32",
                "ENCRYPTION_KEY": "change-me-development-encryption-key-32",
                "COOKIE_SECURE": "true",
            }
        )
        issues = validate_settings(settings)
        fields = {issue.field for issue in issues}
        self.assertIn("SESSION_SECRET", fields)
        self.assertIn("ENCRYPTION_KEY", fields)

    def test_secret_not_shown_in_repr(self):
        settings = settings_from_env({"SESSION_SECRET": "s" * 40, "ENCRYPTION_KEY": "e" * 40})
        rendered = repr(settings)
        self.assertNotIn("s" * 40, rendered)
        self.assertNotIn("e" * 40, rendered)
        self.assertIn("********", rendered)

    def test_satellite_search_settings_are_validated(self):
        settings = settings_from_env(
            {
                "APP_ENV": "development",
                "SATELLITE_SEARCH_LOOKBACK_DAYS": "0",
                "SATELLITE_SEARCH_TIMEOUT_SECONDS": "-1",
                "SATELLITE_MAX_CLOUD_COVER_PERCENT": "101",
                "SATELLITE_PREVIEW_MIN_VALID_RATIO": "0",
                "SATELLITE_ANALYSIS_MIN_VALID_RATIO": "1.1",
            }
        )
        fields = {issue.field for issue in validate_settings(settings)}

        self.assertIn("SATELLITE_SEARCH_LOOKBACK_DAYS", fields)
        self.assertIn("SATELLITE_SEARCH_TIMEOUT_SECONDS", fields)
        self.assertIn("SATELLITE_MAX_CLOUD_COVER_PERCENT", fields)
        self.assertIn("SATELLITE_PREVIEW_MIN_VALID_RATIO", fields)
        self.assertIn("SATELLITE_ANALYSIS_MIN_VALID_RATIO", fields)

    def test_production_requires_server_side_cdse_process_credentials_and_https(self):
        settings = settings_from_env(
            {
                "APP_ENV": "production",
                "DATABASE_URL": "postgresql+psycopg://user:pass@localhost/db",
                "REDIS_URL": "redis://localhost:6379/0",
                "OBJECT_STORAGE_ENDPOINT": "https://storage.example.com",
                "OBJECT_STORAGE_BUCKET": "agriscope",
                "SESSION_SECRET": "s" * 40,
                "ENCRYPTION_KEY": "e" * 40,
                "COOKIE_SECURE": "true",
                "CDSE_CLIENT_ID": "",
                "CDSE_CLIENT_SECRET": "",
                "CDSE_TOKEN_URL": "http://identity.example.test/token",
                "CDSE_PROCESS_URL": "http://process.example.test/process/v1",
                "CDSE_STATISTICAL_URL": "http://process.example.test/statistics/v1",
            }
        )
        issues = validate_settings(settings)
        issue_pairs = {(issue.field, issue.message) for issue in issues}

        self.assertIn(("CDSE_CLIENT_ID", "required in production"), issue_pairs)
        self.assertIn(("CDSE_CLIENT_SECRET", "required in production"), issue_pairs)
        self.assertIn(("CDSE_TOKEN_URL", "must use https in production"), issue_pairs)
        self.assertIn(("CDSE_PROCESS_URL", "must use https in production"), issue_pairs)
        self.assertIn(("CDSE_STATISTICAL_URL", "must use https in production"), issue_pairs)


if __name__ == "__main__":
    unittest.main()
