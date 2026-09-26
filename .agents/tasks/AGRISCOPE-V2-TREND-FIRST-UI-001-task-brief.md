# Task Brief

## Task ID

AGRISCOPE-V2-TREND-FIRST-UI-001

## Status

VALIDATED_PENDING_REVIEW

## Title

Trend-first field workspace using existing observation/change contracts

## Objective

Reorient the existing field analysis workspace so the first answer is the latest measurable trend and any spatial NDVI-decrease evidence, while keeping satellite/NDVI modes and explicit compare as supporting drill-downs.

## Confirmed facts

- The recovered baseline already exposes observation history, observation-scoped imagery/NDVI, and canonical field change through existing APIs.
- `FieldChange` already carries `USABLE | NOT_ASSESSABLE`, common-support policy, mean NDVI delta, thresholded changed area, and GeoJSON geometry.
- The current workspace already requests this evidence for the selected usable observation.
- No new API, migration, provider algorithm, threshold, ranking model, or dependency is required.
- `DESIGN.md` defines Observe → Compare → Prioritize → Inspect and asks the product to answer where change occurred and what deserves inspection.

## Expected behavior

1. When the latest selected observation has a valid comparable prior observation, the workspace defaults to the existing spatial change mode instead of plain satellite mode.
2. The inspector shows a concise `แนวโน้มล่าสุด` section before raw metrics.
3. If canonical change is `USABLE` and `changed_area_rai > 0`, the primary message is `พบพื้นที่ควรตรวจ` and shows the measured area.
4. If canonical change is `USABLE` with no thresholded decrease area, report the measured mean direction (increased/decreased/unchanged) without calling it better/worse/healthy.
5. If change is `NOT_ASSESSABLE`, say the evidence is insufficient and preserve the existing support explanation.
6. If there is no comparable previous observation, say that a trend cannot yet be summarized.
7. `เปรียบเทียบภาพ` remains a secondary drill-down when a usable comparison exists.
8. Satellite/NDVI/change modes, timeline selection, stale-response identity guards, terminal-auth handling, object URL cleanup, and existing API calls remain unchanged.

## Scope / file ownership

- `.agents/tasks/AGRISCOPE-V2-TREND-FIRST-UI-001-task-brief.md`
- `apps/web/components/ObservationWorkspace.tsx`
- `apps/web/components/observation-workspace.module.css`
- `tests/e2e/field-workspace-001.spec.ts`

All backend, API, OpenAPI, migration, provider, repository, service, and other paths are read-only.

## Explicit non-goals

- No farm-wide ranking endpoint.
- No new risk/health/urgency score.
- No automatic provider fan-out beyond existing workspace behavior.
- No new change threshold or agronomic interpretation.
- No diagnosis, cause attribution, treatment advice, alerting, scheduler, or persistence change.

## Validation

- Existing TypeScript typecheck and production build.
- Focused browser cases for usable decrease area, usable no-decrease, NOT_ASSESSABLE, and first-observation/no-comparison states.
- Regression for mode switching, timeline identity, terminal auth, stale responses, and mobile layout.
- `git diff --check`.

## Stop conditions

Stop if implementation requires any API/contract/backend change, a new threshold, new product classification beyond the messages above, or edits outside the owned paths.


## Current validation evidence — 2026-09-26

- Delivery base: `cb92bc21e86526c98c1bc2ed77a643f777a97c9c`; branch `codex/agriscope-v2-recovery-001`.
- Exact contribution is the four paths under Scope / file ownership. Other dirty governance, skill, design, review-record, and farm-overview files remain outside this delivery.
- Static validation: `bash scripts/validate.sh static` PASS with installed Node 24.19.0 and Python 3.12: Ruff, 119 unit/contract tests, TypeScript typecheck, production build, and diff whitespace. Log: `/tmp/agriscope-trend-static-20260926.log`.
- Current CSS/markup correction moves Compare evidence below its map on narrow screens; the slider remains inside the map viewport. This fixes overlap discovered by inspecting the real browser screenshots.
- Final Playwright run rebuilt the app and passed 38/38 desktop/mobile tests, including no-overlap geometry, keyboard slider control, cold cache, map registration, stale responses, and terminal auth. Log: `/tmp/agriscope-trend-browser-correction1-20260926.log`.
- Bounded review correction 1: operational comparison failures have an explicit ERROR state and retry; Compare evidence enters normal flow up to 1000px, with 390px/920px geometry assertions. Both reviewer root causes have regression coverage.
- Final TypeScript typecheck PASS: `/tmp/agriscope-trend-typecheck-final-20260926.log`.
- Disposable loopback PostGIS migration + integration validation PASS, 50/50. Log: `/tmp/agriscope-trend-integration-20260926.log`.
- Current screenshots were inspected at desktop and narrow sizes. Artifacts: `/tmp/agriscope-trend-visuals-20260926/`; project-prefixed filenames prevent desktop/mobile overwrite. Provider imagery is explicitly deterministic test data.
- ESLint is absent and remains NOT_PROVEN. No live CDSE or production database validation is claimed.
- Exact-diff LOCAL_NATIVE review and matching PR CI remain delivery gates. No production deployment is included.
