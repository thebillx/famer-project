# AgriScope baseline integration review

Date: 2026-09-09
Scope: baseline integration from real repository history and bounded R1–R8
corrections. This is a feature-delivery review, not a production security review.

## Current authoritative state — 2026-09-10

This block is the only current lifecycle state. Every section below is explicitly
superseded historical evidence retained for audit; no approval, path inventory,
validation result, or delivery instruction below authorizes the current tree.

- Project: `/Users/bill/final-project-baseline-integration`
- Branch: `codex/agriscope-baseline-integration`
- Current HEAD: `c724fd655ddcb5290cac0dd21057cf4a4cd4b874`
- Current boundary: 22 tracked modified paths, 2 untracked source files, staged 0.
- Current state: bounded correction applied for review findings; clean integration
  validation passed and delta LOCAL_NATIVE review is pending.
- Recovered review: job `01a08bfb-a73e-7621-a186-ab2fbec53267`, raw session
  `/Users/bill/.codex/sessions/2026/09/10/rollout-2026-09-10T22-42-00-01a08bfb-a73e-7621-a186-ab2fbec53267.jsonl`.
  It completed with `REVIEW_DECISION: CHANGES_REQUIRED` and two findings:
  dependency-preflight coupling and append-only lifecycle-state drift.
- Delivery has not started. No commit, push, PR update, merge, deployment, or
  new-SHA CI run exists. PR #10 remains Draft.
- Targeted correction proof: `scripts/validate.sh integration` passed 50/50 in a
  temporary checkout with no `node_modules`; log:
  `test-results/agriscope-pr10-native/integration-clean-no-node.log`.

## [SUPERSEDED HISTORICAL] Boundary and contribution record — 2026-09-09

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

## [SUPERSEDED HISTORICAL] R1–R8 disposition

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

## [SUPERSEDED HISTORICAL] Migration transition boundary

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

## [SUPERSEDED HISTORICAL] Validation evidence

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

## [SUPERSEDED HISTORICAL] Product and safety boundary

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

## [SUPERSEDED HISTORICAL] Native correction validation receipt — 2026-09-10 (pre-review findings)

This receipt supersedes the correction-delta `NOT RUN` result above for the
current local tree. The historical R1–R8 results remain historical evidence and
are not merged with this correction result. The prior v5 approval is not reused:
the current tree contains post-review bytes and requires a fresh exact-diff
review.

- Reviewed start SHA: `c724fd655ddcb5290cac0dd21057cf4a4cd4b874`.
- Current local HEAD before delivery: `c724fd655ddcb5290cac0dd21057cf4a4cd4b874`.
- Branch: `codex/agriscope-baseline-integration`.
- Focused fixes after native execution: mobile grid min-content overflow is
  constrained in `apps/web/components/observation-workspace.module.css`; the
  account-switch link is explicit opt-in so farm-map route semantics remain
  unchanged; the root browser validator now includes the full desktop regression
  set plus focused Chromium/API-backed and mobile observation coverage.
- C1: PASS — common-support/threshold/lineage behavior is covered by focused
  observation-analysis tests, contract tests, PostGIS integration, and browser
  cases; `NOT_ASSESSABLE` derived values remain null and provisional 0.40 is
  unchanged.
- C2: PASS — identity-gated stale-response, blob cleanup, and no-refetch mode
  transition cases pass in Chromium and Pixel 5.
- C3: PASS — acquired/eligible/measured/last-good and failed-current-attempt
  states pass in unit, integration, Chromium, and Pixel 5 evidence.
- C4: PASS — same-document principal switch, measured raster/vector landmarks,
  real FastAPI + disposable PostGIS API-backed flow, and desktop/mobile browser
  coverage pass.

### New native validation

- `AGRISCOPE_PYTHON=/Users/bill/final-project/.venv/bin/python3.12 AGRISCOPE_TEST_DATABASE_URL=<loopback disposable PostGIS> MAP_VISUAL_ARTIFACT_DIR=test-results/agriscope-pr10-native/screenshots bash scripts/validate.sh all` — PASS; static, integration, and browser phases all completed. Aggregate log: `test-results/agriscope-pr10-native/aggregate-final.log`.
- Static — PASS: Ruff, 119 unit/contract tests, web typecheck, production build,
  and `git diff --check`; ESLint is unavailable and remains NOT_PROVEN.
- Canonical OpenAPI — PASS: `tests/contract/test_foundation_contract.py`, 14/14;
  log: `test-results/agriscope-pr10-native/openapi-contract-final.log`.
- C1 focused unit — PASS: 10/10; log:
  `test-results/agriscope-pr10-native/c1-unit-final.log`.
- PostgreSQL/PostGIS — PASS: 50/50 on the loopback disposable database;
  log: `test-results/agriscope-pr10-native/integration-final.log`.
- Browser — PASS: 49 desktop regression tests, 12 focused Chromium tests
  (mocked plus API-backed), and 11 Pixel 5 observation tests; log:
  `test-results/agriscope-pr10-native/browser-final.log`.
- Additional spatial retry proof — PASS: 5/5 focused Chromium repetitions;
  log: `test-results/agriscope-pr10-native/spatial-repeat.log`.
- Runtime screenshots are retained under
  `test-results/agriscope-pr10-native/screenshots/`.

### Delivery state

- Current exact-diff LOCAL_NATIVE review: **PENDING**; the historical approval
  does not cover the CSS, route opt-in, and validator changes above.
- No correction commit, push, PR update, merge, or deployment has occurred;
  PR #10 remains Draft with its historical head unchanged.
- Live CDSE/provider evidence, production database state, formal security
  review, and uninspected candidate-stamped migration states remain unclaimed.


## [SUPERSEDED HISTORICAL] PR #10 independent-review correction receipt — C1–C4

This section is additive to the historical R1–R8/pre-delivery receipt above.

- Reviewed starting SHA: `c724fd655ddcb5290cac0dd21057cf4a4cd4b874`.
- Current local HEAD before correction delivery: **NOT EXPOSED by the live IRIS FULL Git status capability**. GitHub independently confirms the current remote PR head remains `c724fd655ddcb5290cac0dd21057cf4a4cd4b874`; this is not asserted as a local-HEAD reading.
- Reconnected local state: branch `codex/agriscope-baseline-integration`; dirty with 13 tracked and 1 untracked file; staged 0. This matches the pre-reconnect correction worktree counts, so no newer delta was identified by the exposed status fields.
- Owner-work boundary: existing dirty correction work was preserved. No owner/production database was modified. The primary and Wave2B worktrees were not touched.

### Implemented correction behavior

- **C1:** comparison means and delta use aligned common field support; the denominator is field-grid pixel centers; support policy metadata/version/reason are returned; `NOT_ASSESSABLE` derived values are null; zero changed area is emitted only when assessable; legacy scalar comparisons are suppressed when common spatial support cannot be proven; NDVI-decrease highlighting is explicit.
- **C2:** observation and comparison-pair identity gate asset state before render; API identity fields are validated; late responses are rejected; blob URLs are revoked; display-mode changes reuse provider metadata without unnecessary refetches; transition regressions use `MutationObserver`.
- **C3:** latest acquired, latest eligible, and latest successfully measured are separate; the current attempt is separate from last-good measurement; successful analysis updates the React Query observation cache; freshness is explicit; legacy-ineligible observations do not make the workspace analytically ready.
- **C4:** same-document principal switching releases a pending principal-A response only after the switch; raster/vector landmarks and pan/zoom registration are measured in pixel positions; an API-backed browser flow uses real FastAPI plus disposable PostGIS while mocking only the STAC/CDSE boundary; the fixture is a deterministic georeferenced GeoTIFF; CI adds focused Chromium/mobile regression and failure-artifact upload.

The comparison minimum common-support ratio is configurable through `SATELLITE_COMPARISON_MIN_COMMON_SUPPORT_RATIO` and defaults provisionally to **0.40**. The default is a conservative pilot policy rather than a production-calibrated agronomic threshold: it prevents sparse overlap from producing a numeric comparison while leaving room for realistic masked imagery. Because correction validation could not execute after reconnect, production/candidate calibration of 0.40 remains unproven and must use representative field/provider data before production reliance.

### Correction delta paths recovered from governed write receipts

`.env.example`; `.github/workflows/ci.yml`; `apps/api/agriscope_api/api/v1/satellite.py`; `apps/api/agriscope_api/core/config.py`; `apps/api/agriscope_api/services/satellite.py`; `apps/web/components/MapWorkspaceShell.tsx`; `apps/web/components/ObservationWorkspace.tsx`; `apps/web/lib/types.ts`; `docs/decisions/ADR-0010-observation-raster-change-cache.md`; `tests/contract/test_foundation_contract.py`; `tests/e2e/field-workspace-001.spec.ts`; `tests/e2e/field-workspace-api-backed.spec.ts`; `tests/e2e/stac_mock_server.py`; `tests/unit/test_observation_analysis.py`.

IRIS exposes only counts, not porcelain paths or tracked/untracked classification. Therefore these are the 14 mission-write paths matching the 13 tracked + 1 untracked status, but the exact untracked member is not asserted.

### Validation and delivery result after reconnect

Attempted governed command/capability:

- `project.test.run` for the registered project — **BLOCKED**: `CAPABILITY_DENIED: Registered project does not declare a bounded test script`.

Consequently the focused C1 unit tests, full unit + contract suite, disposable-PostGIS integration suite, TypeScript typecheck, production build, mocked-API Playwright C1–C4 suite, API-backed Playwright suite, mobile observation regression, and `git diff --check` are **NOT RUN for this correction delta**. Historical R1–R8 passes above do not validate the newer C1–C4 dirty delta. No gate was weakened and no test result was fabricated.

- Mocked-API evidence: implementation and regression source present; execution **NOT RUN**.
- API-backed evidence: real-FastAPI/disposable-PostGIS test and deterministic provider mock source present; execution **NOT RUN**.
- Live-provider evidence: **NOT RUN**.
- Independent correction-diff review: **NOT RUN**; no reviewer capability is exposed by IRIS FULL.
- Intended CI failure artifacts: Playwright traces/screenshots/videos uploaded by the focused browser-regression job defined in `.github/workflows/ci.yml`; no new-SHA CI artifacts exist because delivery was blocked before commit.

Remaining limitations are production/CDSE calibration and live-provider proof, candidate-stamped or unknown applied migration states, and validation through an explicitly declared bounded project test script. IRIS FULL also exposes no commit/push capability, so no correction commit was created, the feature branch was not pushed, PR #10 was not updated, and CI for a new SHA could not start. The PR remains Draft; merge and deploy were not requested.
