# AGRISCOPE-V2-HISTORY-BACKFILL-001

Status: IMPLEMENTED — focused validation passed; LOCAL_NATIVE review pending

## Objective and authority

Complete the existing M01/M02 historical-discovery contribution as the next bounded slice after Trend-first UI. The owner approved finishing the presented history/overview plan on 2026-09-26. ADR-0011 formalizes synchronous, user-triggered atomic discovery; this is not a background job feature. Source contribution is fingerprinted at /tmp/agriscope-history-source-manifest-20260926.json. Original worktrees remain unchanged.

## User outcome

An authorized field manager selects dates in the field workspace, explicitly searches historical acquisitions, sees new/quality-rejected/empty results, and refreshes the real observation timeline. Opening the page makes no discovery request. Historical metadata is not a successful NDVI measurement.

## Contract

- POST /api/v1/fields/{field_id}/observations/backfill accepts either a complete start_date/end_date pair or a complete timezone-aware start_at/end_at pair. Reject mixed/unknown/incomplete fields and durations greater than exactly 730 days.
- Reuse authentication, CSRF, active membership, farm-owner/org-owner, field_manager and provider rate-limit gates. Hidden/missing fields return generic 404 before provider work.
- Work is synchronous in one transaction. Success returns a COMPLETED receipt; identical field/normalized-range replay returns it without provider work. Failed attempts roll back entirely and may be retried; no FAILED receipt or polling promise.
- Concurrent identical requests converge on one committed receipt and unique acquisitions. Catalog/new/rejected counts are explicit. Empty results carry NO_CATALOG_RESULTS_IN_BOUNDED_RANGE.
- Follow only same-origin pagination URLs resolved against configured STAC origin; no userinfo/fragment or query widening. Keep original collection/geometry/range/sort/limit/fields while changing continuation state only. Persist allowlisted provenance only.
- Truncated discovery returns 422 backfill_result_truncated with no writes and asks the user to shorten the range. Provider failures return safe 503, with no partial writes.
- Reuse existing acquisition provider_metadata.geometry_hash, canonical observation DTO, derived cache readiness and current-boundary preview. No geometry-version tables or duplicated readiness columns. Missing/mismatched lineage remains ineligible for numeric analysis/comparison. Current-boundary preview remains compatible.
- Receipt identity includes field ID, current geometry hash and normalized UTC range. Historical acquisition INSERT ON CONFLICT DO NOTHING preserves the original acquisition lineage; never overwrite its hash through legacy upsert. A geometry edit permits a new range request but cannot relabel old observations.
- Browser states: permission loading/error/viewer, empty, pending, success/new rows, empty result, range/truncated/provider/rate errors, terminal auth and identity transition. Abort or discard late mutation results after principal/field changes. Provider errors are translated into safe Thai copy.

## Ownership

Backend worker owns:
- apps/api/agriscope_api/providers/cdse_stac.py
- apps/api/agriscope_api/services/observation_history.py (new)
- apps/api/agriscope_api/repositories/satellite.py
- apps/api/agriscope_api/api/v1/satellite.py
- apps/api/agriscope_api/db/models/field_backfill_receipt.py (new)
- apps/api/agriscope_api/db/models/__init__.py
- apps/api/migrations/versions/20260926_0008_history_receipts.py (new)
- docs/api/openapi.yaml
- docs/api/database-schema.md
- tests/unit/test_observation_history.py (new)
- tests/unit/test_cdse_stac_provider.py
- tests/contract/test_foundation_contract.py
- tests/contract/test_migration_contract.py

Root owns tests/integration/test_foundation_api.py (reassigned after worker interruption), disposable migration validation, apps/web/lib/types.ts, apps/web/app/fields/[id]/page.tsx, new apps/web/components/ObservationHistoryDiscovery.tsx and its CSS module, tests/e2e/observation-history-001.spec.ts, scripts/validate.sh (include the new browser suite in CI), task brief and ADR. All other paths are read-only, including original worktrees and already merged Trend files. Backend may inspect M01/M02 source for reusable provider/history code but may not copy the broader lineage/DTO rewrite.

## Validation

Prove exact range boundary, aliases, pagination/deduplication/trust/truncation, failure rollback+retry, concurrent/completed idempotency, safe provenance, missing/changed geometry hash lineage, all tenant/role denials, migration from baseline plus downgrade/reupgrade on disposable PostGIS. Browser checks prove manual-only discovery, success refresh, empty/error/permission/loading/auth/stale-principal behavior. Run static, integration, focused browser and existing observation regression, inspect desktop/mobile renders, then exact-diff Ponytail review and matching CI before merge.

## Boundaries and stop conditions

No dependency installation, credentials, production data, live private geometry, worker/scheduler, alerts, farm bulk acquisition, new bulk/background NDVI analysis, algorithm/threshold change, or deployment. Preserve existing lazy analysis of the selected eligible observation and its comparison pair, including selection after empty-history discovery. No newly introduced per-history-item processing. Stop for expansion beyond this contract, unknown applied migrations, owner conflict or unresolved review root after two correction submissions. Mock provider tests do not prove live provider or production readiness.

## Validation evidence (2026-09-26)

- Ruff and 130 unit/contract tests passed: /tmp/agriscope-history-python-final-20260926.log.
- PostGIS integration: 57 passed, including atomic failure/retry, concurrent idempotency, permission/rate/CSRF gates and unchanged original lineage: /tmp/agriscope-history-integration-final-20260926.log.
- Fresh migration, downgrade to baseline and reupgrade passed on a new disposable database: /tmp/agriscope-history-migration-root-20260926.log. The unrelated legacy-stamped test database was preserved.
- Web typecheck and fresh production build passed. API-backed/mocked browser suite 11 passed: /tmp/agriscope-history-api-browser-final-20260926.log. Existing desktop/mobile observation regression plus mocked discovery 47 passed: /tmp/agriscope-history-ui-regression-20260926.log.
- Desktop/mobile renders inspected in /tmp/agriscope-history-visuals-20260926/. ESLint remains unavailable; live raster/NDVI and production deployment are not claimed.

## Bounded review correction 1

Ponytail found two in-scope blockers: the OpenAPI schema did not enforce exactly one complete date/timestamp pair, and the empty-history workspace retained satellite mode after first discovery of a comparable pair. The schema now encodes exclusive pairs with structural coverage of all 16 key-presence shapes. The analysis workspace remounts only across empty/populated history (and principal/field changes), preserving user mode on ordinary populated refresh. A two-observation browser case proves initial change mode, comparison request and user-mode preservation after repeat discovery. Focused contract 15 passed, typecheck/build passed, browser history+Trend suite 30 passed: /tmp/agriscope-history-correction1-contract-20260926.log, /tmp/agriscope-history-correction1-typecheck-20260926.log, /tmp/agriscope-history-correction1-browser-20260926.log. Delta review pending.
