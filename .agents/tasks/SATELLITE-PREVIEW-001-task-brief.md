# Task Brief

## Task ID

SATELLITE-PREVIEW-001

## Status

VERIFIED

## Title

On-demand Sentinel-2 true-color preview for one authorized field

## User outcome

After AgriScope finds acceptable Sentinel-2 Level-2A metadata for a saved field,
an authenticated member can explicitly request and view a true-color image clipped
to that field. The UI explains the acquisition date, cloud metadata, provenance,
and limitations instead of presenting a metadata-only card as if it were imagery.

## Confirmed facts

- The current server searches CDSE STAC metadata and persists one idempotent
  acquisition row; it does not call the Process API or return raster bytes.
- The current card says `ภาพดาวเทียมล่าสุด` but renders only date, cloud, source,
  search time, and item ID. This is the proven reason the saved field feels empty.
- Server settings already reserve CDSE client, token, and Process endpoint values,
  but the client-credentials and Process paths are unused.
- The field geometry and projected area are server-authoritative, and both
  satellite routes authorize the field before provider work.
- Official CDSE documentation requires OAuth2 client credentials and documents
  Process API Sentinel-2 L2A true-color PNG responses with WGS84/CRS84 bounds.
- The accepted Thailand-boundary contribution already owns a dirty canonical
  OpenAPI file at SHA-256
  `b3f8d7cdab80ef3bcd9eeb701c017029cecf388e90b9ac03f86132d8883abe2c`.
  This successor takes additive ownership of that exact byte base; it must retain
  all Thailand geometry clauses.
- WEB-SEC remains active and exclusively owns its current three paths. This task
  must not edit them, especially `tests/integration/test_foundation_api.py`.

## Scope

- Add one server-side CDSE Process client with bounded OAuth token reuse, one fixed
  versioned true-color evalscript, fixed output dimensions, response-size/type
  validation, and valid-pixel measurement from the returned raster mask.
- Add authenticated `GET /api/v1/fields/{field_id}/satellite/preview`.
- Use the latest persisted acquisition timestamp and saved polygon; do not accept
  browser-supplied geometry, date, product ID, evalscript, provider URL, or size.
- Keep the preview on explicit user action only. One click causes at most one
  preview operation plus one bounded token renewal when required.
- Stream `image/png` only when valid coverage meets the configured minimum.
- Add a blob-capable parser to the existing API client's unchanged recovery loop.
- Render the preview and truthful Thai states inside the existing satellite card.
- Replace the two stale static `ตรวจสอบเมื่อพร้อม` metric values with truthful
  capability copy; do not lift satellite state into either page.
- Extend the existing local provider fixture so the real browser/API path can be
  validated without real credentials or an external provider call.

## Out of scope

- NDVI, anomaly/change detection, health diagnosis, alerts, recommendations,
  Statistical API, scheduler, background prefetch, map overlay, download/export,
  raster persistence, object storage, Redis, cross-process cache, or provider quota
  dashboard.
- A browser credential, direct browser-to-CDSE request, user-supplied evalscript,
  automatic preview request, new package, migration, table, worker, or generic
  satellite framework.
- Claiming that mock-backed validation is a live Copernicus success or production
  readiness. A real credential smoke remains a later owner-authorized gate.

## API, tenant, provider, and quality contract

- Route: `GET /api/v1/fields/{field_id}/satellite/preview`.
- Responses: `200 image/png`; `401` unauthenticated; indistinguishable `404` for
  absent/deleted/foreign fields; `409 satellite_not_searched`; `422
  satellite_no_data | satellite_insufficient_quality`; `429 rate_limited`; `503
  satellite_temporarily_unavailable`.
- Resolve the current user and tenant-authorized active field before rate limiting,
  acquisition lookup, token retrieval, or Process API work.
- Use the same subject and subject+field rate-limit buckets as metadata search.
- Use only the latest tenant-scoped persisted acquisition. The Process time range
  is bounded around its UTC acquisition time, with `sentinel-2-l2a`, most-recent
  mosaicking, and the configured maximum cloud percentage.
- The immutable evalscript is `agriscope-true-color-v1`: B04/B03/B02 true color
  with `dataMask` as PNG alpha. The response is field-clipped by the persisted
  GeoJSON polygon in CRS84 and has fixed 768×768 output.
- Accept only a bounded PNG response. Measure the raster dataset mask; zero valid
  pixels is `satellite_no_data`, and a ratio below the configured inclusive minimum
  is `satellite_insufficient_quality`. Neither state returns image bytes.
- CDSE client ID/secret stay server-side and are never logged, serialized to API
  errors, sent to the browser, or written into task/test evidence. Production
  settings require both credentials and an HTTPS token/Process endpoint.
- Response headers are `Cache-Control: private, no-store` and
  `X-Content-Type-Options: nosniff`; do not let a browser cache cross-principal
  imagery. The UI revokes every object URL when replaced or unmounted.
- Provider details are reduced to existing safe error codes/copy. No raw OAuth,
  provider, raster, tenant, or geometry detail reaches the user.

## UI state and wording contract

1. Metadata loading/search behavior stays unchanged and never fetches preview.
2. Preview control is present only for an `available` acquisition.
3. Preview pending: one Thai status, disabled trigger, no old image.
4. Available: image with acquisition-date alt text, Copernicus/Sentinel-2
   attribution, cloud metadata, and a statement that it supports visual field
   inspection only.
5. `satellite_not_searched`, no data, insufficient quality, rate limited, and
   temporarily unavailable have distinct safe Thai copy and no image.
6. A new metadata search that selects a different acquisition clears and revokes
   the old preview before another request.
7. No wording may diagnose disease, pests, nutrients, flooding, field safety, or
   prescribe chemicals.

## Ownership

- Orchestrator:
  - `.agents/tasks/SATELLITE-PREVIEW-001-task-brief.md`
- Implementation:
  - `.env.example`
  - `apps/api/agriscope_api/core/config.py`
  - `apps/api/agriscope_api/application.py` process-client singleton wiring only
  - `apps/api/agriscope_api/providers/cdse_process.py` (new)
  - `apps/api/agriscope_api/services/satellite.py`
  - `apps/api/agriscope_api/api/v1/satellite.py`
  - `docs/api/openapi.yaml` additive successor work from the authenticated Thailand
    slice byte base
  - `apps/web/lib/api.ts`
  - `apps/web/components/SatelliteStatusCard.tsx`
  - `apps/web/app/fields/[id]/page.tsx` copy only
  - `apps/web/app/farms/[id]/page.tsx` copy only
  - `tests/unit/test_cdse_process_provider.py` (new)
  - `tests/unit/test_satellite_preview_service.py` (new)
  - `tests/unit/test_settings_foundation.py` preview-setting assertions only
  - `tests/contract/test_foundation_contract.py`
  - `tests/e2e/stac_mock_server.py` token/Process fixtures only
  - `apps/web/playwright.config.ts` test-only CDSE settings only
  - `tests/e2e/field-workspace-001.spec.ts` preview behavior only
  - `tests/e2e/field-001.spec.ts` preview step only, additive successor work from
    the reviewed coordinate/Thailand journey
- Every other path is read-only. In particular, do not edit the active WEB-SEC
  task, CI workflow, or integration test.

## Focused validation

- Python provider/settings/unit and canonical API contract tests.
- TypeScript typecheck and production build.
- Serialized field-workspace browser tests proving no automatic preview request,
  one request per click, PNG render, object replacement/cleanup behavior, and every
  safe error state.
- One local browser → FastAPI → tenant DB → local OAuth/Process fixture journey;
  label it mock-backed, not live CDSE.
- Source scans for frontend credentials/direct provider endpoints, unsupported
  claims, raw errors, user-controlled evalscripts/provider URLs, and unexpected
  browser storage.
- `git diff --check` and exact dirty-boundary verification.

## Acceptance criteria

- An authorized user with persisted acceptable metadata can request and see a
  field-clipped true-color preview; no request occurs before the explicit action.
- Unauthorized/foreign access performs no Process call and remains an
  indistinguishable `404`.
- Empty/low-coverage/provider/rate-limit states show no stale or blank image and
  expose no provider detail.
- Browser source contains no CDSE credential or direct CDSE endpoint.
- The existing metadata states, Thailand geometry contract, tenant cache guards,
  and API recovery budgets do not regress.
- Focused validation passes and Ponytail returns one LOCAL_NATIVE decision. No
  formal security decision or production claim is implied.

## Implementation evidence

- Ponytail correction submission 1 closes the three LOCAL_NATIVE findings: an
  all-transparent PNG is no data, concurrent same-token `401` waiters share one
  renewal, and a preview resolving after unmount is revoked.
- Provider/settings/service/unit tests: PASS; the complete unit suite is 76/76,
  including zero-mask and concurrent-token-flight regressions.
- Canonical API contract suite: PASS 14/14, including binary response, no-store,
  exact methods/statuses, role/scope, and rate-limit metadata.
- Web TypeScript: PASS. Production build: PASS; all existing routes built.
- Serialized affected browser regression: PASS 26/26 across the real field journey,
  field workspace, pending-unmount cleanup, preview states, API recovery budgets,
  and neutral satellite states.
- Mock-backed browser → FastAPI → disposable PostGIS → local OAuth/Process fixture
  journey: PASS 1/1. It proved zero automatic preview calls, one explicit PNG
  request, attribution, reload non-persistence, and the existing Thailand/API area
  contracts. It is not live Copernicus evidence.
- Python lint/format, source safety scans, canonical JSON, task whitespace, and
  `git diff --check`: PASS.
- Live CDSE credential smoke: NOT_RUN; no credential was provided or requested.
- No dependency, lockfile, migration, active WEB-SEC file, production data, or
  external provider state changed.

## Stop conditions

- Stop on a required migration/object store/worker/dependency, live credential or
  package action, Process contract ambiguity, need to edit active WEB-SEC paths,
  inability to inspect valid coverage, tenant authorization regression, or product
  request for analysis/diagnosis rather than true-color display.
