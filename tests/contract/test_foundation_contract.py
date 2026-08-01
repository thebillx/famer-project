import json
import pathlib
import re
import unittest


OPENAPI = pathlib.Path("docs/api/openapi.yaml")


class FoundationContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = OPENAPI.read_text()

    def test_standard_error_uses_request_id(self):
        self.assertIn("ErrorResponse", self.text)
        self.assertIn("request_id", self.text)
        self.assertNotIn("correlation_id]", self.text)

    def test_required_routes_are_documented(self):
        for route in [
            "/health/live:",
            "/health/ready:",
            "/health/dependencies:",
            "/api/v1/auth/register:",
            "/api/v1/auth/login:",
            "/api/v1/auth/logout:",
            "/api/v1/auth/refresh:",
            "/api/v1/auth/me:",
            "/api/v1/organizations:",
            "/api/v1/organizations/{organization_id}:",
            "/api/v1/organizations/{organization_id}/members:",
        ]:
            self.assertIn(route, self.text)

    def test_core_routes_include_security_metadata(self):
        for route in [
            "/api/v1/auth/register",
            "/api/v1/auth/login",
            "/api/v1/auth/logout",
            "/api/v1/auth/refresh",
            "/api/v1/auth/me",
            "/api/v1/organizations",
            "/api/v1/organizations/{organization_id}",
            "/api/v1/organizations/{organization_id}/members",
        ]:
            start = self.text.index(f"  {route}:")
            next_route = self.text.find("\n  /", start + 1)
            block = self.text[start:] if next_route == -1 else self.text[start:next_route]
            for marker in ["x-required-role", "x-organization-scope", "x-validation", "x-rate-limit"]:
                self.assertIn(marker, block, route)

    def test_shared_json_schemas_parse(self):
        for path in pathlib.Path("packages/shared-types/schemas").glob("*.json"):
            json.loads(path.read_text())


if __name__ == "__main__":
    unittest.main()
