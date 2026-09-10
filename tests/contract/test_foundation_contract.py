import json
import pathlib
import unittest


REPOSITORY_ROOT = pathlib.Path(__file__).resolve().parents[2]
OPENAPI = REPOSITORY_ROOT / "docs/api/openapi.yaml"
ERROR_RESPONSE_REF = {"$ref": "#/components/schemas/ErrorResponse"}

EXPECTED_SCHEMAS = {
    "CsrfResponse",
    "ErrorResponse",
    "Farm",
    "FarmCreateRequest",
    "FarmUpdateRequest",
    "Field",
    "FieldCreateRequest",
    "FieldUpdateRequest",
    "GeoJsonPolygon",
    "LoginRequest",
    "Member",
    "Organization",
    "OrganizationCreateRequest",
    "RegisterRequest",
    "RegisterResponse",
    "SatelliteAcquisition",
    "SatelliteAvailableResponse",
    "SatelliteEmptySearchResponse",
    "SatelliteLatestResponse",
    "SatelliteNdviSummary",
    "SatelliteNdviComparison",
    "SatelliteNotSearchedResponse",
    "SatelliteSearchResponse",
    "Observation",
    "ObservationNdviSummary",
    "ObservationRaster",
    "ComparisonSupport",
    "FieldChange",
    "User",
}

EXPECTED_METHODS = {
    "/health/live": {"get"},
    "/health/ready": {"get"},
    "/health/dependencies": {"get"},
    "/api/v1/auth/csrf": {"get"},
    "/api/v1/auth/register": {"post"},
    "/api/v1/auth/login": {"post"},
    "/api/v1/auth/logout": {"post"},
    "/api/v1/auth/refresh": {"post"},
    "/api/v1/auth/me": {"get"},
    "/api/v1/organizations": {"get", "post"},
    "/api/v1/organizations/{organization_id}": {"get"},
    "/api/v1/organizations/{organization_id}/members": {"get"},
    "/api/v1/farms": {"get", "post"},
    "/api/v1/farms/{farm_id}": {"delete", "get", "patch"},
    "/api/v1/farms/{farm_id}/fields": {"get", "post"},
    "/api/v1/fields/{field_id}": {"delete", "get", "patch"},
    "/api/v1/fields/{field_id}/satellite/search-latest": {"post"},
    "/api/v1/fields/{field_id}/satellite/latest": {"get"},
    "/api/v1/fields/{field_id}/satellite/preview": {"get"},
    "/api/v1/fields/{field_id}/satellite/ndvi-summary": {"get"},
    "/api/v1/fields/{field_id}/observations": {"get"},
    "/api/v1/fields/{field_id}/observations/{observation_id}/preview": {"get"},
    "/api/v1/fields/{field_id}/observations/{observation_id}/ndvi-summary": {"get"},
    "/api/v1/fields/{field_id}/observations/{observation_id}/ndvi-raster": {"get"},
    "/api/v1/fields/{field_id}/observations/{observation_id}/ndvi-raster/image": {"get"},
    "/api/v1/fields/{field_id}/change": {"get"},
}

EXPECTED_RESPONSES = {
    ("/health/live", "get"): {"200"},
    ("/health/ready", "get"): {"200", "503"},
    ("/health/dependencies", "get"): {"200"},
    ("/api/v1/auth/csrf", "get"): {"200", "429"},
    ("/api/v1/auth/register", "post"): {"201", "400", "403", "409", "422", "429"},
    ("/api/v1/auth/login", "post"): {"204", "401", "403", "422", "429"},
    ("/api/v1/auth/logout", "post"): {"204", "403"},
    ("/api/v1/auth/refresh", "post"): {"204", "401", "403", "429"},
    ("/api/v1/auth/me", "get"): {"200", "401"},
    ("/api/v1/organizations", "get"): {"200", "401"},
    ("/api/v1/organizations", "post"): {"201", "401", "403", "422", "429"},
    ("/api/v1/organizations/{organization_id}", "get"): {"200", "401", "404", "422"},
    ("/api/v1/organizations/{organization_id}/members", "get"): {"200", "401", "404", "422"},
    ("/api/v1/farms", "get"): {"200", "401", "404", "422"},
    ("/api/v1/farms", "post"): {"201", "401", "403", "404", "422", "429"},
    ("/api/v1/farms/{farm_id}", "get"): {"200", "401", "404", "422"},
    ("/api/v1/farms/{farm_id}", "patch"): {"200", "401", "403", "404", "422", "429"},
    ("/api/v1/farms/{farm_id}", "delete"): {"204", "401", "403", "404", "422", "429"},
    ("/api/v1/farms/{farm_id}/fields", "get"): {"200", "401", "404", "422"},
    ("/api/v1/farms/{farm_id}/fields", "post"): {"201", "401", "403", "404", "422", "429"},
    ("/api/v1/fields/{field_id}", "get"): {"200", "401", "404", "422"},
    ("/api/v1/fields/{field_id}", "patch"): {"200", "401", "403", "404", "422", "429"},
    ("/api/v1/fields/{field_id}", "delete"): {"204", "401", "403", "404", "422", "429"},
    ("/api/v1/fields/{field_id}/satellite/search-latest", "post"): {
        "200",
        "401",
        "403",
        "404",
        "422",
        "429",
    },
    ("/api/v1/fields/{field_id}/satellite/latest", "get"): {
        "200",
        "401",
        "404",
        "422",
    },
    ("/api/v1/fields/{field_id}/satellite/preview", "get"): {
        "200",
        "401",
        "404",
        "409",
        "422",
        "429",
        "503",
    },
    ("/api/v1/fields/{field_id}/satellite/ndvi-summary", "get"): {
        "200",
        "401",
        "404",
        "409",
        "422",
        "429",
        "503",
    },
    ("/api/v1/fields/{field_id}/observations", "get"): {"200", "401", "404", "422"},
    ("/api/v1/fields/{field_id}/observations/{observation_id}/preview", "get"): {"200", "401", "404", "422", "429", "503"},
    ("/api/v1/fields/{field_id}/observations/{observation_id}/ndvi-summary", "get"): {"200", "401", "404", "422", "429", "503"},
    ("/api/v1/fields/{field_id}/observations/{observation_id}/ndvi-raster", "get"): {"200", "401", "404", "422", "429", "503"},
    ("/api/v1/fields/{field_id}/observations/{observation_id}/ndvi-raster/image", "get"): {"200", "401", "404", "422", "429", "503"},
    ("/api/v1/fields/{field_id}/change", "get"): {"200", "401", "404", "422", "429", "503"},
}

EXPECTED_RATE_LIMITS = {
    ("/api/v1/auth/csrf", "get"): ("trusted-client-IP aggregate 60 per configured fixed window."),
    ("/api/v1/auth/register", "post"): (
        "trusted-client-IP 25 and HMAC(normalized email) 5 per configured window."
    ),
    ("/api/v1/auth/login", "post"): (
        "trusted-client-IP 50 and HMAC(normalized email) 10 per configured window."
    ),
    ("/api/v1/auth/refresh", "post"): (
        "trusted-client-IP 60 plus valid subject 30 or invalid-token digest 10 per configured window."
    ),
    ("/api/v1/organizations", "post"): (
        "trusted-client-IP 300 and authenticated subject 60 per configured window."
    ),
    ("/api/v1/farms", "post"): (
        "trusted-client-IP 300 and authenticated subject 60 per configured window."
    ),
    ("/api/v1/farms/{farm_id}", "patch"): (
        "trusted-client-IP 300 and authenticated subject 60 per configured window."
    ),
    ("/api/v1/farms/{farm_id}", "delete"): (
        "trusted-client-IP 300 and authenticated subject 60 per configured window."
    ),
    ("/api/v1/farms/{farm_id}/fields", "post"): (
        "trusted-client-IP 300 and authenticated subject 60 per configured window."
    ),
    ("/api/v1/fields/{field_id}", "patch"): (
        "trusted-client-IP 300 and authenticated subject 60 per configured window."
    ),
    ("/api/v1/fields/{field_id}", "delete"): (
        "trusted-client-IP 300 and authenticated subject 60 per configured window."
    ),
    ("/api/v1/fields/{field_id}/satellite/search-latest", "post"): (
        "authenticated subject 20 and subject plus HMAC(field ID) 10 per configured window."
    ),
    ("/api/v1/fields/{field_id}/satellite/preview", "get"): (
        "authenticated subject 20 and subject plus HMAC(field ID) 10 per configured window."
    ),
    ("/api/v1/fields/{field_id}/satellite/ndvi-summary", "get"): (
        "authenticated subject 20 and subject plus HMAC(field ID) 10 per configured window."
    ),
    ("/api/v1/fields/{field_id}/observations/{observation_id}/preview", "get"): (
        "authenticated subject 20 and subject plus HMAC(field ID) 10 per configured window."
    ),
    ("/api/v1/fields/{field_id}/observations/{observation_id}/ndvi-summary", "get"): (
        "authenticated subject 20 and subject plus HMAC(field ID) 10 per configured window."
    ),
    ("/api/v1/fields/{field_id}/observations/{observation_id}/ndvi-raster", "get"): (
        "authenticated subject 20 and subject plus HMAC(field ID) 10 per configured window."
    ),
    ("/api/v1/fields/{field_id}/observations/{observation_id}/ndvi-raster/image", "get"): (
        "authenticated subject 20 and subject plus HMAC(field ID) 10 per configured window."
    ),
    ("/api/v1/fields/{field_id}/change", "get"): (
        "authenticated subject 20 and subject plus HMAC(field ID) 10 per configured window."
    ),
}

OWNER_SCOPE_ASSERTIONS = {
    ("/api/v1/farms", "get"): {
        "x-organization-scope": ("owner",),
        "x-validation": ("non-owner", "omitted"),
    },
    ("/api/v1/farms/{farm_id}", "get"): {
        "x-organization-scope": ("farm owner",),
        "x-validation": ("non-owner",),
    },
    ("/api/v1/farms/{farm_id}", "patch"): {
        "x-organization-scope": ("owner", "organization owner"),
        "x-validation": ("non-owner",),
    },
    ("/api/v1/farms/{farm_id}", "delete"): {
        "x-organization-scope": ("owner", "organization owner"),
        "x-validation": ("non-owner",),
    },
    ("/api/v1/farms/{farm_id}/fields", "get"): {
        "x-organization-scope": ("farm owner",),
        "x-validation": ("non-owned",),
    },
    ("/api/v1/farms/{farm_id}/fields", "post"): {
        "x-organization-scope": ("farm owner", "organization owner"),
    },
    ("/api/v1/fields/{field_id}", "get"): {
        "x-organization-scope": ("farm owner",),
        "x-validation": ("non-owner",),
    },
    ("/api/v1/fields/{field_id}", "patch"): {
        "x-organization-scope": ("farm owner", "organization owner"),
        "x-validation": ("non-owner",),
    },
    ("/api/v1/fields/{field_id}", "delete"): {
        "x-organization-scope": ("farm owner", "organization owner"),
        "x-validation": ("non-owner",),
    },
    ("/api/v1/fields/{field_id}/satellite/search-latest", "post"): {
        "x-organization-scope": ("owner", "before any provider request"),
        "x-validation": ("non-owner",),
    },
    ("/api/v1/fields/{field_id}/satellite/latest", "get"): {
        "x-organization-scope": ("farm owner", "before"),
        "x-validation": ("non-owner",),
    },
    ("/api/v1/fields/{field_id}/satellite/preview", "get"): {
        "x-organization-scope": ("farm owner",),
        "x-validation": ("foreign fields",),
    },
    ("/api/v1/fields/{field_id}/satellite/ndvi-summary", "get"): {
        "x-organization-scope": ("farm owner",),
        "x-validation": ("foreign and non-owner fields",),
    },
}


def reject_duplicate_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key: {key!r}")
        result[key] = value
    return result


def reject_nonfinite(value):
    raise ValueError(f"non-finite JSON value: {value}")


def strict_json_object(text):
    model = json.loads(
        text,
        object_pairs_hook=reject_duplicate_pairs,
        parse_constant=reject_nonfinite,
    )
    if type(model) is not dict:
        raise ValueError("expected a top-level JSON object")
    return model


class FoundationContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = OPENAPI.read_bytes()
        cls.text = cls.raw.decode("utf-8")
        cls.document = strict_json_object(cls.text)

    def test_openapi_is_strict_canonical_json(self):
        canonical = (
            json.dumps(
                self.document,
                ensure_ascii=False,
                allow_nan=False,
                indent=2,
            )
            + "\n"
        ).encode("utf-8")
        self.assertEqual(self.raw, canonical)
        self.assertEqual(self.document["openapi"], "3.1.0")
        self.assertEqual(
            list(self.document),
            ["openapi", "info", "servers", "components", "paths"],
        )

    def test_strict_parser_rejects_duplicate_and_nonfinite_values(self):
        with self.assertRaises(ValueError):
            strict_json_object('{"duplicate": 1, "duplicate": 2}')
        for value in ("NaN", "Infinity", "-Infinity"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                strict_json_object(f'{{"value": {value}}}')
        with self.assertRaises(ValueError):
            strict_json_object("[]")

    def test_components_security_scheme_and_schemas(self):
        components = self.document["components"]
        self.assertEqual(set(components), {"securitySchemes", "responses", "schemas"})
        self.assertEqual(
            components["securitySchemes"],
            {
                "accessCookie": {
                    "type": "apiKey",
                    "in": "cookie",
                    "name": "agriscope_access",
                },
                "bearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "access token",
                },
                "refreshCookie": {
                    "type": "apiKey",
                    "in": "cookie",
                    "name": "agriscope_refresh",
                },
                "csrfCookie": {
                    "type": "apiKey",
                    "in": "cookie",
                    "name": "agriscope_csrf",
                },
                "csrfHeader": {
                    "type": "apiKey",
                    "in": "header",
                    "name": "X-CSRF-Token",
                },
            },
        )
        self.assertEqual(
            set(components["responses"]),
            {
                "UnauthorizedError",
                "ForbiddenError",
                "NotFoundError",
                "ValidationError",
                "RateLimitedError",
            },
        )
        retry_after = components["responses"]["RateLimitedError"]["headers"]["Retry-After"]
        self.assertEqual(retry_after["schema"], {"type": "integer", "minimum": 1})
        schemas = components["schemas"]
        self.assertEqual(set(schemas), EXPECTED_SCHEMAS)
        for name, schema in schemas.items():
            with self.subTest(schema=name):
                self.assertIs(type(schema), dict)
                if name in {"SatelliteLatestResponse", "SatelliteSearchResponse"}:
                    self.assertEqual(
                        len(schema["oneOf"]),
                        3 if name == "SatelliteLatestResponse" else 2,
                    )
                    self.assertEqual(schema["discriminator"]["propertyName"], "status")
                else:
                    self.assertEqual(schema.get("type"), "object")

    def test_satellite_response_union_enforces_initial_and_attempt_states(self):
        schemas = self.document["components"]["schemas"]
        available = schemas["SatelliteAvailableResponse"]
        not_searched = schemas["SatelliteNotSearchedResponse"]
        empty_search = schemas["SatelliteEmptySearchResponse"]
        required = {"field_id", "status", "acquisition", "searched_at", "message_th"}
        self.assertEqual(set(available["required"]), required)
        self.assertEqual(available["properties"]["status"], {"const": "available"})
        self.assertEqual(
            available["properties"]["acquisition"],
            {"$ref": "#/components/schemas/SatelliteAcquisition"},
        )
        self.assertEqual(not_searched["properties"]["status"], {"const": "not_searched"})
        self.assertEqual(not_searched["properties"]["acquisition"], {"type": "null"})
        self.assertEqual(not_searched["properties"]["searched_at"], {"type": "null"})
        self.assertEqual(
            empty_search["properties"]["status"]["enum"],
            ["no_data", "temporarily_unavailable"],
        )
        self.assertEqual(empty_search["properties"]["acquisition"], {"type": "null"})
        self.assertEqual(empty_search["properties"]["searched_at"]["format"], "date-time")
        search_refs = {branch["$ref"] for branch in schemas["SatelliteSearchResponse"]["oneOf"]}
        self.assertEqual(
            search_refs,
            {
                "#/components/schemas/SatelliteAvailableResponse",
                "#/components/schemas/SatelliteEmptySearchResponse",
            },
        )
        self.assertNotIn(
            "not_searched",
            schemas["SatelliteSearchResponse"]["discriminator"]["mapping"],
        )

    def test_satellite_preview_is_binary_on_demand_and_fail_closed(self):
        preview = self.document["paths"]["/api/v1/fields/{field_id}/satellite/preview"]["get"]
        self.assertEqual(
            preview["responses"]["200"]["content"],
            {"image/png": {"schema": {"type": "string", "format": "binary"}}},
        )
        self.assertEqual(
            preview["responses"]["200"]["headers"]["Cache-Control"]["schema"],
            {"type": "string", "const": "private, no-store"},
        )
        self.assertIn("persisted field geometry", preview["x-validation"])
        self.assertIn("no automatic preview request", preview["x-idempotency"])

    def test_satellite_ndvi_summary_is_explicit_bounded_and_suppresses_unproven_comparison(self):
        summary_path = self.document["paths"]["/api/v1/fields/{field_id}/satellite/ndvi-summary"]["get"]
        self.assertEqual(
            summary_path["responses"]["200"]["content"],
            {"application/json": {"schema": {"$ref": "#/components/schemas/SatelliteNdviSummary"}}},
        )
        self.assertEqual(
            summary_path["responses"]["200"]["headers"]["Cache-Control"]["schema"],
            {"type": "string", "const": "private, no-store"},
        )
        self.assertIn("persisted field geometry", summary_path["x-validation"])
        self.assertIn("UTC day", summary_path["x-validation"])
        self.assertIn("common spatial support", summary_path["x-validation"].lower())
        self.assertIn("no automatic summary request", summary_path["x-idempotency"])

        summary = self.document["components"]["schemas"]["SatelliteNdviSummary"]
        self.assertIn("comparison_status", summary["required"])
        self.assertIn("comparison_reason", summary["required"])
        self.assertEqual(summary["properties"]["comparison_status"], {"const": "NOT_ASSESSABLE"})
        self.assertEqual(
            summary["properties"]["comparison_reason"]["enum"],
            ["NO_PREVIOUS_OBSERVATION", "COMMON_SPATIAL_SUPPORT_NOT_PROVEN"],
        )
        self.assertEqual(
            summary["properties"]["comparison"]["anyOf"][-1],
            {"type": "null"},
        )

    def test_observation_contract_separates_eligibility_cache_identity_and_common_support(self):
        schemas = self.document["components"]["schemas"]
        observation = schemas["Observation"]
        self.assertIn("analysis_eligible", observation["required"])
        self.assertIn("analysis_ready", observation["required"])
        self.assertIn("comparison_eligible", observation["required"])
        self.assertIn("geometry_hash", observation["required"])
        self.assertEqual(observation["properties"]["geometry_hash"]["type"], ["string", "null"])

        raster = schemas["ObservationRaster"]
        self.assertEqual(
            {"field_id", "algorithm_version", "geometry_hash"}.issubset(set(raster["required"])),
            True,
        )
        self.assertEqual(raster["properties"]["field_id"]["format"], "uuid")
        self.assertEqual(raster["properties"]["geometry_hash"]["minLength"], 64)
        self.assertNotIn("const", raster["properties"]["value_min"])
        self.assertNotIn("const", raster["properties"]["value_max"])

        support = schemas["ComparisonSupport"]
        self.assertEqual(
            set(support["required"]),
            {
                "common_valid_pixel_count",
                "field_grid_pixel_count",
                "common_support_ratio",
                "minimum_required_ratio",
                "policy_version",
                "denominator",
                "reason",
            },
        )
        self.assertEqual(support["properties"]["denominator"], {"const": "FIELD_GRID_PIXEL_CENTERS"})
        self.assertEqual(
            support["properties"]["reason"]["enum"],
            ["SUFFICIENT_COMMON_SUPPORT", "NO_COMMON_SUPPORT", "BELOW_MINIMUM_COMMON_SUPPORT"],
        )
        self.assertIn("provisional", support["properties"]["policy_version"]["description"].lower())

        change = schemas["FieldChange"]
        self.assertEqual(change["properties"]["status"]["enum"], ["USABLE", "NOT_ASSESSABLE"])
        self.assertEqual(change["properties"]["ndvi_delta"]["type"], ["number", "null"])
        self.assertEqual(change["properties"]["geometry"]["type"], ["object", "null"])
        self.assertEqual(
            change["properties"]["highlight_semantics"],
            {"const": "NDVI_DECREASE_AT_OR_BELOW_THRESHOLD"},
        )
        self.assertEqual(change["properties"]["support"], {"$ref": "#/components/schemas/ComparisonSupport"})
        self.assertIn("before_observation_ndvi_mean", change["required"])
        self.assertIn("after_observation_ndvi_mean", change["required"])
        self.assertIn("algorithm_version", change["required"])
        self.assertIn("geometry_hash", change["required"])
        self.assertIn("support", change["required"])
        self.assertIn("highlight_semantics", change["required"])
        for derived in (
            "before_ndvi",
            "after_ndvi",
            "ndvi_delta",
            "changed_area_sqm",
            "changed_area_rai",
            "geometry",
        ):
            self.assertIn("null", change["properties"][derived]["type"])

        change_path = self.document["paths"]["/api/v1/fields/{field_id}/change"]["get"]
        validation = change_path["x-validation"].lower()
        self.assertIn("common", validation)
        self.assertIn("field-grid", validation)
        self.assertIn("not_assessable", validation)

    def test_standard_error_schema_is_structural(self):
        error_response = self.document["components"]["schemas"]["ErrorResponse"]
        self.assertEqual(error_response["required"], ["error"])
        error = error_response["properties"]["error"]
        self.assertEqual(error["type"], "object")
        self.assertEqual(
            set(error["required"]),
            {"code", "message", "request_id", "details"},
        )
        self.assertEqual(error["properties"]["code"]["type"], "string")
        self.assertEqual(error["properties"]["message"]["type"], "string")
        self.assertEqual(error["properties"]["request_id"]["type"], "string")
        self.assertEqual(error["properties"]["details"]["type"], "object")
        self.assertTrue(error["properties"]["details"]["additionalProperties"])

    def test_required_paths_methods_and_operation_metadata(self):
        paths = self.document["paths"]
        self.assertEqual(set(paths), set(EXPECTED_METHODS))
        self.assertEqual(
            set(EXPECTED_RESPONSES),
            {(path, method) for path, methods in EXPECTED_METHODS.items() for method in methods},
        )

        for path, methods in EXPECTED_METHODS.items():
            self.assertEqual(set(paths[path]), methods, path)
            for method in methods:
                with self.subTest(path=path, method=method):
                    operation = paths[path][method]
                    self.assertEqual(
                        set(operation["responses"]),
                        EXPECTED_RESPONSES[(path, method)],
                    )
                    if (path, method) in EXPECTED_RATE_LIMITS:
                        self.assertEqual(
                            operation.get("x-rate-limit"),
                            EXPECTED_RATE_LIMITS[(path, method)],
                        )
                        self.assertEqual(
                            operation["responses"]["429"],
                            {"$ref": "#/components/responses/RateLimitedError"},
                        )
                    else:
                        self.assertNotIn("x-rate-limit", operation)
                    if path.startswith("/api/v1/"):
                        for extension in (
                            "x-required-role",
                            "x-organization-scope",
                            "x-validation",
                        ):
                            self.assertIs(type(operation.get(extension)), str)
                            self.assertTrue(operation[extension])

    def test_owner_scope_contracts_for_farms_fields_and_satellite_apis(self):
        paths = self.document["paths"]
        for (path, method), assertions in OWNER_SCOPE_ASSERTIONS.items():
            operation = paths[path][method]
            for key, expected_fragments in assertions.items():
                value = operation.get(key, "")
                lowered = value.lower()
                for fragment in expected_fragments:
                    self.assertIn(fragment.lower(), lowered)

    def test_farm_and_field_schemas_do_not_expose_owner_user_id(self):
        schemas = self.document["components"]["schemas"]
        for schema_name in (
            "Farm",
            "FarmCreateRequest",
            "FarmUpdateRequest",
            "Field",
            "FieldCreateRequest",
            "FieldUpdateRequest",
        ):
            schema = schemas[schema_name]
            self.assertNotIn("owner_user_id", schema["properties"])
            self.assertNotIn("owner_user_id", schema.get("required", []))

    def test_security_alternatives_match_browser_and_bearer_contract(self):
        public_operations = {
            ("/health/live", "get"),
            ("/health/ready", "get"),
            ("/health/dependencies", "get"),
            ("/api/v1/auth/csrf", "get"),
        }
        csrf_only = {
            ("/api/v1/auth/register", "post"),
            ("/api/v1/auth/login", "post"),
            ("/api/v1/auth/logout", "post"),
        }
        unsafe_product = {
            (path, method)
            for path, methods in EXPECTED_METHODS.items()
            for method in methods
            if method in {"post", "patch", "delete"}
            and path
            not in {
                "/api/v1/auth/register",
                "/api/v1/auth/login",
                "/api/v1/auth/logout",
                "/api/v1/auth/refresh",
            }
        }
        for path, methods in EXPECTED_METHODS.items():
            for method in methods:
                with self.subTest(path=path, method=method):
                    if (path, method) in public_operations:
                        expected = []
                    elif (path, method) in csrf_only:
                        expected = [{"csrfCookie": [], "csrfHeader": []}]
                    elif (path, method) == ("/api/v1/auth/refresh", "post"):
                        expected = [{"refreshCookie": [], "csrfCookie": [], "csrfHeader": []}]
                    elif (path, method) in unsafe_product:
                        expected = [
                            {"accessCookie": [], "csrfCookie": [], "csrfHeader": []},
                            {"bearerAuth": []},
                        ]
                    else:
                        expected = [{"accessCookie": []}, {"bearerAuth": []}]
                    self.assertEqual(
                        self.document["paths"][path][method]["security"],
                        expected,
                    )

    def test_error_responses_reference_the_standard_schema(self):
        shared = self.document["components"]["responses"]
        for path, methods in EXPECTED_METHODS.items():
            for method in methods:
                responses = self.document["paths"][path][method]["responses"]
                for status, response in responses.items():
                    with self.subTest(path=path, method=method, status=status):
                        if "$ref" in response:
                            name = response["$ref"].removeprefix("#/components/responses/")
                            self.assertIn(name, shared)
                            response = shared[name]
                        self.assertIs(type(response.get("description")), str)
                        self.assertTrue(response["description"])
                        if int(status) >= 400:
                            self.assertEqual(
                                response["content"]["application/json"]["schema"],
                                ERROR_RESPONSE_REF,
                            )

    def test_shared_json_schemas_parse_strictly(self):
        schemas = REPOSITORY_ROOT / "packages/shared-types/schemas"
        for path in schemas.glob("*.json"):
            with self.subTest(path=path.name):
                strict_json_object(path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
