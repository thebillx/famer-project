# Task Brief

## Task ID

LANDING-001

## Status

DONE

## Title

Responsive AgriScope Thailand public landing page

## Business goal

After merge, a prospective Thai customer can understand AgriScope's verified capabilities and safety boundaries, inspect a representative farm-data preview, and continue to registration or login from a polished public homepage.

## User

Anonymous prospect, returning user, farm owner, cooperative, agricultural company, buyer, or agency evaluator.

## Current behavior

`GET /` redirects directly to `/farms` and provides no public product explanation.

## Expected behavior

`GET /` renders a public, responsive, Thai-first marketing page derived from Canva design `DAHRJR9EibI`, extended with How it works, Features, Farm insight, Trust and safety, final CTA, and Footer sections.

## Scope

- Preserve the Canva hero's warm cream canvas, forest-green identity, compact header, split layout, and elevated farm-map preview.
- Replace unsupported mockup claims with evidence-backed current capabilities.
- Render static server-side content without tenant or API data.
- Add anchors for `how-it-works`, `features`, `farm-insight`, and `trust`.
- Link registration/login CTAs to `/login` and the preview CTA to `#farm-insight`.
- Support mobile, tablet, desktop, keyboard, reduced motion, and no-JavaScript content access.
- Add page-specific metadata and focused Playwright coverage.

## Out of scope

- Backend, database, OpenAPI, authentication, or provider changes.
- Live farm, weather, NDVI, analysis, or satellite API calls from the landing page.
- Forms, analytics, tracking, pricing, billing, testimonials, invented statistics, or customer logos.
- New dependencies, third-party scripts, remote Canva assets, or unverified imagery.
- Changes to existing dirty UI-system files, shared design tokens, package manifests, Playwright configuration, or existing E2E specifications.
- Claims that planned features are already implemented.

## Dependencies

- Existing Next.js 15 and React 19 web application.
- Existing `/login` and `/farms` routes.
- Existing `--as-*` design tokens, read without modifying `globals.css`.
- Canva design `DAHRJR9EibI` as visual direction only; do not rasterize the page into the website.

## Contracts

- Endpoint: `GET /`.
- Response: public server-rendered HTML with status 200; no redirect.
- Request schema: none.
- API/data dependency: none.
- Permission: public.
- Organization scope: not applicable; no tenant data may be read.
- Validation: typed static content only.
- Idempotency: safe idempotent GET.
- Error behavior: core text, navigation, CTA, and safety disclosure remain usable if decorative visuals fail.
- Test fixture: static sample field clearly labeled `ตัวอย่างข้อมูล`.
- UI states: loading, empty, and permission are not applicable because no runtime request occurs; responsive, keyboard, reduced-motion, decoration-failure, and no-JavaScript states are required.
- API contract change: none.

## Agent owners

- Orchestrator: task brief, ownership, status, final verification.
- Implementation agent using `nextjs-product-ui`: landing implementation and focused test.
- Canva extension designer: read-only visual research and separate extension candidates; no repository ownership.
- Code review and security review agents: read-only final gates.

## File ownership

- Orchestrator: `.agents/tasks/LANDING-001-task-brief.md`.
- Implementation agent:
  - `apps/web/app/page.tsx`
  - `apps/web/app/landing.module.css`
  - `apps/web/components/landing/LandingHeader.tsx`
  - `apps/web/components/landing/LandingHero.tsx`
  - `apps/web/components/landing/FarmInsightPreview.tsx`
  - `apps/web/components/landing/LandingSections.tsx`
  - `apps/web/components/landing/landing-content.ts`
  - `tests/e2e/landing-001.spec.ts`
- All other files remain read-only owner work. QA may not edit without ownership reassignment.

## Security requirements

- No secrets, tokens, organization IDs, real farm coordinates, or tenant data.
- No `/api/v1` request, local storage, session handling, forms, trackers, or untrusted HTML.
- Internal links only for CTAs.
- Do not claim certification, diagnosis, pest or nutrient identification, irrigation prescriptions, weather forecasts, or unsupported production capabilities.
- Mark all sample numbers as illustrative.
- State that satellite information supports field inspection and does not diagnose crop conditions.
- State that insufficient-quality information is `ข้อมูลไม่เพียงพอ`, not `ไม่พบปัญหา`.
- Include Sentinel/Copernicus attribution where the source is discussed.

## Test requirements

- `npm -w apps/web run typecheck`.
- `npm -w apps/web run build`.
- `npx playwright test -c apps/web/playwright.config.ts landing-001.spec.ts`.
- Verify no `/api/v1` request during initial render.
- Verify root remains `/`, headings and landmarks, CTA destinations, section anchors, illustrative-data label, non-diagnosis disclosure, keyboard focus, reduced motion, and no horizontal overflow at mobile, tablet, and desktop viewports.
- Run existing FIELD-001/UI-system regression tests only after the active owner work is stable.

## Acceptance criteria

- `/` returns 200 and no longer redirects to `/farms`.
- Hero, How it works, Features, Farm insight, Trust and safety, CTA, and Footer render.
- Hero is recognizably derived from Canva `DAHRJR9EibI` without embedding the Canva page as an image.
- Primary/login CTAs resolve to `/login`; internal navigation resolves to defined section IDs.
- Current capabilities include saved boundaries, authoritative area, latest Sentinel-2 acquisition metadata, organization scope, and safe inspection wording.
- Farm insight is visibly labeled `ตัวอย่างข้อมูล`.
- Unsupported scores, diagnoses, risk determinations, weather alerts, and prescriptive actions are absent.
- The page makes no API request and works without client-side interactivity.
- No horizontal overflow at 390x844, 1024x768, or 1920x1080.
- Keyboard navigation, focus, headings, landmarks, contrast, and meaningful link names pass review.
- Existing `/login` and `/farms` flows remain available.

## Definition of done

- Implementation handoff is complete.
- Focused validation evidence is recorded.
- Native code review and security review return approval.
- Status may reach `VERIFIED`; it must not reach `DONE` or merge before external review approval.

## External review

- Decision: `APPROVED`.
- Evidence: repository owner authorized review and merge in the Codex task on 2026-08-16 after native code and security reviews passed.

## Risks

- Active UI-system changes may alter global tokens or build behavior while LANDING-001 is in progress.
- Visual parity must be achieved without licensed remote imagery or a raster screenshot.
- Marketing copy can drift into unsupported satellite claims and must remain evidence-backed.
- The root layout still loads shared providers and MapLibre CSS; changing that boundary is deferred to avoid ownership conflicts.
