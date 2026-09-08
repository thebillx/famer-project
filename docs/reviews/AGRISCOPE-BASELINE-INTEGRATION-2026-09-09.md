# AgriScope baseline integration review

Date: 2026-09-09
Scope: baseline integration from real repository history and bounded R1–R8
corrections. This is a feature-delivery review, not a production security review.

## Boundary and contribution record

Correction revision: v5 after the first LOCAL_NATIVE review returned
`CHANGES_REQUIRED` for legacy-summary single-flight and applied-migration
immutability.

LOCAL_NATIVE delta decision: `REVIEW_DECISION: APPROVED` (Ponytail/Poincare,
exact current diff; 2026-09-09). Feature delivery remains pending staging,
push, Draft PR creation, and remote SHA verification.

- Integration worktree: `/Users/bill/final-project-baseline-integration`
- Branch: `codex/agriscope-baseline-integration`
- Integration base: `origin/main` at `2665a6477ffb71379fa03776ef77de11908eb8dc`
- Real observation foundation source: PR #9 commit
  `19396d1d3e48da25a922d2d35862fea1c9d2efa4`, an ancestor of this branch.
- Primary source observed at `ebe4990ae4502f184ad54dccb27d53c4e3073f48` and
  Wave2B source observed at `19396d1d3e48da25a922d2d35862fea1c9d2efa4`; their
  existing dirty work remains in the source worktrees and was not overwritten.
- Selected contributions are the PR #9 observation-analysis foundation, the
  inspected primary NDVI-history table definition re-homed into a new
  forward-only migration, and the Wave2B observation/map deltas needed for
  geometry lineage, comparison support, raster registration, and runtime
  regressions. The integration uses inspected source contributions selectively;
  it does not import a portable bundle or copy an unreviewed payload wholesale.
- The prior duplicate tip `2576d6a` had the exact tree of PR #9 but was not a
  remote contribution. It was removed from this branch before delivery so the
  application diff rests on the real `19396d1` history.

## R1–R8 disposition

| Finding | Status | Implemented behavior and evidence |
| --- | --- | --- |
| R1 Cold-cache NDVI | PASS | Analysis eligibility is separate from `analysis_ready`; a usable observation without a cache enters the real analysis path and persists the result. Both observation-analysis and legacy `/satellite/ndvi-summary` use the acquisition-row single-flight lock and cache recheck. Evidence: `apps/api/agriscope_api/services/satellite.py`, `apps/api/agriscope_api/repositories/satellite.py`, `tests/integration/test_foundation_api.py` concurrent cold-cache cases, `tests/e2e/field-workspace-001.spec.ts` cold-cache case. |
| R2 Backend/frontend integration | PASS | Observation DTOs carry geometry/provenance, comparison eligibility, raster metadata, and safe legacy limitations through route → service → repository → UI. Evidence: `apps/api/agriscope_api/api/v1/satellite.py`, `apps/api/agriscope_api/services/satellite.py`, `apps/web/components/ObservationWorkspace.tsx`, `apps/web/components/SpatialEvidenceMap.tsx`; 50 PostgreSQL integration tests and observation browser cases. |
| R3 Canonical API contract | PASS | OpenAPI, FastAPI response models, typed web adapters, and TypeScript types agree on required/null fields and assessable semantics. Evidence: `docs/api/openapi.yaml`, `apps/api/agriscope_api/api/v1/satellite.py`, `apps/web/lib/types.ts`, `tests/contract/test_foundation_contract.py`; 115 unit/contract tests and real API-backed field creation. |
| R4 Runtime regression coverage | PASS | Latest/selected/latest-usable, poor-quality preview, cold cache, delayed responses, principal switch, map position, and mobile layout are exercised against the built app. Evidence: 49 focused Chromium tests, 16 observation tests across Chromium and Pixel 5, and screenshots listed below. |
| R5 Stale observation state | PASS | Request identity epochs clear selected assets and reject late preview/raster/summary/change responses. Evidence: `apps/web/components/ObservationWorkspace.tsx`, `tests/e2e/field-workspace-001.spec.ts` delayed-response case; included in the 16-test desktop/mobile run. |
| R6 Map error lifecycle | PASS | Map initialization/style failure is independent from image loading; failure remains visible until the real retry succeeds. Evidence: `apps/web/components/SpatialEvidenceMap.tsx`, `tests/e2e/field-workspace-001.spec.ts` map retry case; desktop/mobile runtime pass and `field-map-error.png`. |
| R7 Delivery integrity | PASS (local) | Branch is based on verified `origin/main`, PR #9 is represented by its real commit, and no source worktree was changed. Push/remote SHA verification remains a delivery step after approval. Evidence: `git log --graph` and worktree/status inspection; remote SHA/PR are intentionally outside this pre-delivery review. |
| R8 Migration integration | PASS (bounded) | The applied `20260830_0005` revision is byte-identical to PR #9. The untracked candidate `20260824_0005` was not in verified repository history; its table definition is re-homed in linear `20260908_0006_ndvi_history`, so the shared acquisition constraint is created once by `20260830_0005`. `20260908_0007` adds geometry lineage. Disposable PostGIS proved `20260823_0004` → head, `20260830_0005` → head, full downgrade to base, and re-upgrade. Candidate-stamped and external/applied production states were not inspected and are not claimed. |

## Migration transition boundary

The collision was between candidate `20260824_0005_ndvi_history` and real
`20260830_0005_observation_analysis`, both descending from `20260823_0004` and
both touching `uq_field_acquisitions_id_field_organization`. Because the
candidate revision was not present in verified repository history, the selected
forward-only transition is:

```text
20260823_0004
  └─ 20260830_0005  (real observation analysis/raster table; owns shared constraint)
       └─ 20260908_0006 (NDVI snapshot table re-homed from candidate)
            └─ 20260908_0007 (geometry_hash lineage)
```

Supported and demonstrated starting states on the disposable PostGIS container:

- `20260823_0004` → `head`.
- `20260830_0005` → `head`.
- `head` → `base` → `head`, and `head` → `20260830_0005` → `head`.

No owner or production database was changed. A database stamped with the
unverified candidate `20260824_0005`, an already-applied custom migration,
manually altered constraints, or unknown data state remains an explicit
follow-up gate. A downgrade from `20260908_0007` also fails closed before schema
changes when one legacy cache key has multiple geometry-versioned rows; silently
retaining one row would destroy historical lineage.

## Validation evidence

### Runtime evidence

- `DATABASE_URL=<disposable PostGIS on 127.0.0.1:55432> npx playwright test -c apps/web/playwright.config.ts tests/e2e/farm-fields-list-001.spec.ts tests/e2e/farms-list-001.spec.ts tests/e2e/field-001.spec.ts tests/e2e/map-workspace-001.spec.ts tests/e2e/web-security.spec.ts --project=chromium --workers=1` — PASS, 49/49, real built Next app + FastAPI runtime on disposable PostGIS at `20260908_0007`; log: `/tmp/agriscope-baseline-49-final-v5.log`.
- `DATABASE_URL=<disposable PostGIS on 127.0.0.1:55432> MAP_VISUAL_ARTIFACT_DIR=/tmp/agriscope-baseline-screenshots-final-v5 npx playwright test -c apps/web/playwright.config.ts tests/e2e/field-workspace-001.spec.ts --workers=1` — PASS, 16/16 across Chromium and Pixel 5; log: `/tmp/agriscope-baseline-observation-16-final-v5.log`.
- `AGRISCOPE_TEST_DATABASE_URL=<disposable PostGIS on 127.0.0.1:55432> pytest -q tests/integration/test_foundation_api.py` — PASS, 50/50, including the legacy summary single-flight regression; log: `/tmp/agriscope-baseline-postgres-integration-final-v5.log`.
- Alembic disposable migration probes — PASS for `20260823_0004` and `20260830_0005` starting states, full downgrade/re-upgrade, and final schema/constraint state; logs: `/tmp/agriscope-baseline-migrations-branchpoint-8155.log`, `/tmp/agriscope-baseline-migrations-applied_observation-8155.log`, `/tmp/agriscope-baseline-migrations-full-8155.log`.

Screenshots are generated from the real app runtime and remain outside Git:

| Artifact | SHA-256 |
| --- | --- |
| `/tmp/agriscope-baseline-screenshots-final-v5/field-compare-spatial-registration.png` | `69738ae4510431e7058469e533b6240ea503b33e5b1cd4acb50f3636cf053549` |
| `/tmp/agriscope-baseline-screenshots-final-v5/field-map-error.png` | `edd0c029f062e605c7e1c9526ca6dea06bd34dcbe13f3bc12c6ceb9fd5198b43` |
| `/tmp/agriscope-baseline-screenshots-final-v5/field-ndvi-cold-cache.png` | `8f4918dc57647c543d9bc239a57519965f4f805c3068b8f5ad83a6cff72f29d9` |
| `/tmp/agriscope-baseline-screenshots-final-v5/field-poor-quality.png` | `6ad9d3190fea02ff88f31ad5df9f3f82772947d0fd6ee908d4028bca6613d0ae` |

### Static and contract evidence

- `.venv/bin/ruff check apps/api packages tests` — PASS; log:
  `/tmp/agriscope-baseline-ruff-final-v5.log`.
- `.venv/bin/pytest -q tests/unit tests/contract` — PASS, 115/115; log:
  `/tmp/agriscope-baseline-unit-contract-final-v5.log`.
- `npm -w apps/web run typecheck` — PASS; log:
  `/tmp/agriscope-baseline-typecheck-final-v5.log`.
- `npm -w apps/web run build` — PASS; log:
  `/tmp/agriscope-baseline-build-final-v5.log`.
- `git diff --check` — PASS.

The Next build reports that ESLint is not installed in this repository and skips
the lint phase. This is reported as a validation limitation, not a build pass for
lint.

## Product and safety boundary

The implementation keeps trend-first monitoring and map-first evidence, separates
selected/latest/latest-usable dates, keeps preview available for poor quality when
the API permits it, returns `NOT_ASSESSABLE` when common valid support is absent,
and keeps safe Thai non-diagnostic wording. Geometry edits create a new analysis
identity; renames do not. Two observations produce change-versus-previous only.
No disease, pest, nutrient, flooding, chemical, yield, urgency, or priority claim
was added.

This review does not claim live CDSE raster success, production readiness, formal
security approval, deployment, merge, or support for uninspected applied migration
states.
