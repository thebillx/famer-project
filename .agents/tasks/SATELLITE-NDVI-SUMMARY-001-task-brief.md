# Task Brief

## Task ID

SATELLITE-NDVI-SUMMARY-001

## Status

VERIFIED

## Title

On-demand Sentinel-2 NDVI summary for one authorized field

## User outcome

After AgriScope finds acceptable Sentinel-2 Level-2A metadata, an authenticated
member can explicitly request a compact NDVI summary for the saved field. The UI
shows the mean, observed range, valid-pixel coverage, acquisition date, source,
and a non-diagnostic limitation instead of implying that imagery alone explains
crop condition.

## Confirmed facts and predecessor

- SATELLITE-PREVIEW-001 is LOCAL_NATIVE APPROVED and provides one server-side
  OAuth token flight, persisted-acquisition lookup, tenant-first ordering, safe
  provider errors, and explicit-request UI behavior.
- This successor takes additive ownership from the exact approved predecessor
  bytes recorded below; unrelated active WEB-SEC paths remain excluded.
- Official CDSE Statistical API documentation requires a `dataMask` output and
  returns JSON statistics including mean, min, max, standard deviation,
  `sampleCount`, and `noDataCount`.
- Statistical aggregation intervals are day-based. The request therefore covers
  the persisted acquisition's UTC calendar day with `P1D`; it must not claim
  exact item-level processing when more than one scene contributes that day.
- Existing remote-sensing formula and safe-language modules remain authoritative,
  but this slice does not create anomaly, alert, or diagnosis results.

## Scope

- Extend the existing server-side CDSE client with one fixed Statistical API
  request and the existing shared OAuth token flight.
- Add authenticated `GET
  /api/v1/fields/{field_id}/satellite/ndvi-summary`.
- Use only the latest tenant-scoped persisted acquisition, saved polygon, fixed
  Sentinel-2 L2A input, CRS84 `0.00009` degree sampling (approximately 10 m), and
  one immutable evalscript.
- Return mean/min/max/standard deviation, sample counts, valid-pixel ratio,
  acquisition date, and algorithm version only when coverage is sufficient.
- Add one explicit NDVI button and truthful loading/no-data/quality/provider states
  inside the existing satellite card; never request statistics automatically.
- Extend the existing local provider fixture for deterministic full-stack evidence.

## Out of scope

- Trend/baseline/change detection, anomaly scoring, priority ranking, alerts,
  diagnosis, recommendations, scheduler, background processing, persistence,
  database migration, raster/index overlay, chart/history, export, object storage,
  batch statistics, quota dashboard, or new dependency.
- Claiming live CDSE success from the local fixture. A credentialed smoke remains
  an owner-authorized production gate.

## API, provider, quality, and tenant contract

- Route responses: `200 application/json`; `401`; indistinguishable `404`; `409
  satellite_not_searched`; `422 satellite_no_data |
  satellite_insufficient_quality | satellite_request_too_large`; `429 rate_limited`; `503
  satellite_temporarily_unavailable`.
- Authenticate and tenant-authorize the active field before rate limiting,
  acquisition lookup, OAuth, or Statistical API work. Reuse the existing subject
  and subject+field satellite buckets.
- Endpoint URL defaults to
  `https://sh.dataspace.copernicus.eu/statistics/v1`; production requires HTTPS.
  Credentials stay server-side and never enter logs, API errors, browser source,
  or evidence.
- Evalscript version: `agriscope-ndvi-summary-v1`. NDVI is `(B08-B04)/(B08+B04)`.
  The data mask requires provider `dataMask`, a non-zero denominator, and excludes
  SCL no-data/saturated/cloud-shadow/water/cloud/cirrus/snow classes
  `0,1,3,6,8,9,10,11`.
- Request the acquisition UTC day (`00:00:00Z` inclusive to next day exclusive),
  aggregation interval `P1D`, CRS84 persisted geometry, `0.00009` degree sampling,
  `sentinel-2-l2a`, configured maximum cloud cover, and `mostRecent` mosaicking.
- Bound each Statistical request to at most `262144` bounding-grid cells
  (`512 x 512`, the provider's documented one-Processing-Unit reference grid).
  Reject a larger grid as `satellite_request_too_large` before OAuth or any
  Statistical API call; do not silently coarsen the fixed analysis resolution.
- Accept exactly one `status=OK` interval and one NDVI band. Counts are integers
  with `0 <= noDataCount <= sampleCount`; statistics are finite and within NDVI
  bounds (`-1..1`, standard deviation `0..1`). Unknown/malformed shapes fail
  closed as temporary unavailability.
- Zero valid samples is `satellite_no_data`. Valid ratio below the configured
  analysis minimum is `satellite_insufficient_quality`. Neither returns index
  values. One provider `401` permits exactly one shared token renewal and retry.
- Successful response fields: `field_id`, `acquired_at`, `period_basis=utc_day`,
  `algorithm_version`, `ndvi_mean`, `ndvi_min`, `ndvi_max`, `ndvi_stddev`,
  `sample_count`, `valid_sample_count`, and `valid_pixel_ratio`.
- Response is `Cache-Control: private, no-store` and `X-Content-Type-Options:
  nosniff`.

### Owner-authorized live Process correction

- Credentialed live evidence showed the same latest acquisition returned zero
  valid pixels with the former catalog-timestamp ±1 minute Process window, but
  79.0% valid pixels when requested over its UTC calendar day.
- Credentialed Statistical API evidence also showed that `resx/resy=10` with
  CRS84 sampled the field as one pixel. The documented CRS84 value `0.00009`
  produced 66 samples and correctly classified the latest acquisition as 24.2%
  valid coverage, below the unchanged 40% quality threshold.
- True-color preview now uses that acquisition UTC day, matching the established
  Statistical API period. This avoids candidate fallback, extra provider calls,
  and satellite/platform-specific exceptions.
- Credentials, tokens, raw provider payloads, and image bytes remain outside
  durable evidence.

## UI and wording contract

1. Show the control only for an available acquisition; no automatic summary call.
2. Pending disables the trigger and clears any old summary.
3. Success displays NDVI mean/range, valid coverage, acquisition date, algorithm
   attribution, and: `ค่าดัชนีช่วยเปรียบเทียบการสะท้อนแสงของพืช ไม่ใช่การวินิจฉัย`.
4. No-data, insufficient-quality, oversized-request, rate-limit, and unavailable
   states have distinct safe Thai copy and render no stale values.
5. A different field/acquisition clears the local summary. Do not store it in
   Query cache, browser storage, or a database.
6. Do not say healthy/unhealthy, disease, pest, nutrient, flood, yield, urgency,
   chemical, or causal recommendation.

## Ownership

- Orchestrator: `.agents/tasks/SATELLITE-NDVI-SUMMARY-001-task-brief.md`.
- Implementation successor paths:
  - `.env.example`
  - `apps/api/agriscope_api/core/config.py`
  - `apps/api/agriscope_api/application.py`
  - `apps/api/agriscope_api/providers/cdse_process.py`
  - `apps/api/agriscope_api/services/satellite.py`
  - `apps/api/agriscope_api/api/v1/satellite.py`
  - `docs/api/openapi.yaml`
  - `apps/web/lib/types.ts`
  - `apps/web/components/SatelliteStatusCard.tsx`
  - `tests/unit/test_cdse_process_provider.py`
  - `tests/unit/test_satellite_preview_service.py`
  - `tests/unit/test_settings_foundation.py`
  - `tests/contract/test_foundation_contract.py`
  - `tests/e2e/stac_mock_server.py`
  - `apps/web/playwright.config.ts`
  - `tests/e2e/field-workspace-001.spec.ts`
  - `tests/e2e/field-001.spec.ts` additive NDVI step only
- All other paths are read-only. Do not edit `.agents/tasks/WEB-SEC-CONTRACT-001-task-brief.md`,
  `.github/workflows/ci.yml`, or `tests/integration/test_foundation_api.py`.

## Predecessor byte bases

- `cdse_process.py`: `80a2b5f8648ab59f00b496db92853e524919c89475ffd6482e6def196709662e`
- `SatelliteStatusCard.tsx`: `417cea69cf530a627049ca7489ccb46149fb9cdb0c5fedeaba44a03b06548854`
- `openapi.yaml`: `f86b3262246a1a960a6d34a65a595c67fc2d8475a9f2de0ff571bff52494f63e`
- `field-workspace-001.spec.ts`: `8c6eebb14ea38a1e1d79ac7212292692c783c205da91433e412fcb1bb10a0091`
- `field-001.spec.ts`: `411170c8b3d6f771cc0c1527d8bfbd8ff51847e829218b2e8f4c3b3f7d25fd13`
- The remaining successor path hashes are recorded in SATELLITE-PREVIEW-001
  handoff evidence and must be authenticated before implementation.

## Focused validation

- Provider payload/parser/token-flight unit tests, including exact day bounds,
  SCL/dataMask script, deterministic statistics, zero data, insufficient coverage,
  maximum-grid boundary, oversized rejection before OAuth/provider work,
  malformed/non-finite/out-of-range values, 401 reuse, 429, and 5xx.
- Service/API contract tests for tenant-before-provider, typed states, no-store,
  response schema, and exact request bounds.
- Typecheck/build and serialized field-workspace + API-recovery browser tests proving
  explicit-only request, success, every safe error, acquisition reset, and no raw
  provider detail.
- Mock-backed browser → API → tenant DB → OAuth/Statistical fixture journey; label
  it mock-backed, not live CDSE.
- Exact UTC-day bounds for both true-color Process and NDVI Statistical requests,
  plus the fixed CRS84 `0.00009` sampling resolution.
- Source safety and prohibited-wording scans plus `git diff --check`.

## Acceptance criteria

- One authorized click displays a bounded NDVI summary derived server-side from
  the saved field and latest acquisition day; zero NDVI requests occur before
  the click.
- Foreign/absent fields perform no provider operation and remain 404-equivalent.
- No-data/low-quality/provider failures expose no statistic or private detail.
- A Statistical grid above `262144` cells returns a typed safe error without
  acquiring an OAuth token or calling the provider.
- Existing metadata, preview, token-flight, tenant cache, Thailand geometry, and
  API recovery behavior do not regress.
- Focused validation passes and Ponytail returns LOCAL_NATIVE approval after the
  bounded engineer loop. No security or production approval is implied.

## Implementation evidence

- Python formatting/lint: PASS for every owned Python source and test path.
- Unit plus API contract validation: PASS, 102/102. Coverage includes the fixed
  request, strict one-output/one-band parser, zero/low coverage, malformed values,
  exact UTC-day interval, non-finite/overflow numbers, real-adapter empty-body
  204/401/429/503 states, token renewal/reuse, the `512 x 512` grid boundary,
  oversized rejection with zero OAuth/provider calls, tenant-before-acquisition/
  provider, production settings, OpenAPI schema, and no-store/on-demand contract.
- Web TypeScript and production build: PASS.
- Serialized Chromium validation: PASS, 12/12 across the real
  browser→FastAPI→local PostGIS→local OAuth/Process/Statistical fixture journey
  and deterministic workspace state/error tests. The journey proves zero NDVI
  requests before the click, one successful explicit request, safe attribution,
  and no persistence after reload.
- Diff, prohibited wording, secret-safety, and unexpected storage/source scans:
  PASS.
- Owner-authorized live CDSE smoke: PASS for OAuth, latest metadata search, and
  true-color preview (`200 image/png`, 79.0% valid coverage) using the saved local
  field. Statistical API returned 66 samples with 16 valid (24.2%), which the
  unchanged 40% quality gate correctly reduced to
  `satellite_insufficient_quality` without returning NDVI values. No credential,
  token, raw response, or image byte is stored as evidence; this smoke is not a
  production approval.
- Correction submission 1 closes Ponytail roots `NDVI-HTTP-STATUS-001`,
  `NDVI-PARSER-001`, and `NDVI-UI-ATTR-001`: the adapter classifies empty statuses
  before JSON parsing, the parser binds the exact requested interval and contains
  numeric conversion failures, and the UI renders/tests the fixed algorithm
  version. The full validation above was repeated after these corrections.
- Correction submission 1 for `NDVI-QUOTA-001` binds the fixed-resolution request
  to a `512 x 512` maximum bounding grid, rejects larger geometry before OAuth,
  maps a typed safe API/UI state, and retains the unchanged 40% quality gate.
- Correction submission 2 for `NDVI-QUOTA-001` uses deterministic decimal ceiling
  semantics so the exact `512 x 512` maximum is accepted while the smallest
  documented span above it is rejected with zero OAuth/provider calls.

## Stop conditions

- Stop on need for migration/worker/new dependency, ambiguous provider
  response semantics, inability to enforce tenant-first ordering, request for
  diagnosis/anomaly/alerts, or edits outside owned paths.
