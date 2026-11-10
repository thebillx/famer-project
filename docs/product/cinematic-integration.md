# Public cinematic journey integration

## Current owner direction, 10 November 2026

The active journey has five orbital shots on both `/` and `/cinematic-lab`.
Their progress checkpoints are `0`, `.16`, `.34`, `.55`, and `.78`. The current
Hermite sampler provides one continuous camera path and keeps Earth visible.
At `.88` the single field handoff begins fading in and reaches full opacity at
`.95`. It restores the explicitly requested `FIELD A–204` demonstration, trend
disclosure, and `/login` link from `c9a1788`. The five shot names and Thai strings
also come verbatim from that source. The journey is `520svh` with five rail buttons.

The owner approved using current main and updating directly affected callers and
tests. The runtime loads Earth textures and the authored spacecraft. Previous
native descent assets and offline authoring tools remain available as historical
work. The delivery for this change ends with a reviewed PR.

## Historical integration record

Status: CONTRACT_READY. Owner mission: 10 October 2026.

Integrate the existing `/Users/bill/agriscope-cinematic` Vite/Three.js source into
an isolated Next.js worktree. The public home page presents ten continuous shots,
then the existing product sections. The original landing remains at `/overview`.
Login and authenticated farm/field routes retain their existing behavior. No API,
authentication, database, geospatial formula, tenant or deployment change.

Ownership: `apps/web/app/page.tsx`, `apps/web/app/icon.svg`, `apps/web/next.config.ts`, `apps/web/app/overview/page.tsx`,
`apps/web/components/cinematic/`, `apps/web/public/cinematic/`,
`tests/cinematic/`, `tests/e2e/landing-001.spec.ts`, `tests/e2e/farms-list-001.spec.ts`, `tools/cinematic/`, cinematic developer scripts and this contract/ADR.
Existing owner work in the original checkout and the standalone prototype source
is excluded. Evidence and recoverable backups go to the prototype's `evidence/`.

The spacecraft, globe and stylized farmland remain actual geometry in a shared
world. One continuous position/focus/FOV path must work across wide, tall and
mobile viewports without a progress .55 distance step. All scene state is derived
from progress. Forward and reverse visits must match. UI and 3D resources are
owned by one mounted instance and cleaned up on Next.js navigation.

Preserve supplied Thai messaging, brand, demonstration labels and non-diagnosis
wording. Demo metrics are the supplied fictional values, never backend evidence.
Public rendering makes no API requests. Login links hand off to the existing app;
permissions are handled there. Local credited textures/font remain local.

Acceptance: real Chrome inspection of all ten checkpoints at 1440×900,
1276×1285, 390×844 and 375×667; forward/reverse state; chapter/start/sample
controls; readable non-JS/reduced-motion/failed-renderer/asset fallbacks; no normal
runtime/shader errors, clipping or page overflow; bounded existing landing and
farm regressions; typecheck and Next.js production build. Mobile is viewport
emulation, not physical-device testing. Edolus is a rendered cinematography
reference only, with no copied assets or visual-equivalence claim.

Stop for unrelated owner edits, production data/credentials, package installation,
backend/public API expansion, or deployment. LOCAL_NATIVE review covers the exact
validated diff; deployment remains owner-controlled.

The owner-approved 10 October Blender/storyboard refinement is governed by
`cinematic-blender-refinement.md`. It replaces the original procedural spacecraft
and the original demonstration metrics with original Blender meshes and existing
offline fixture values/dates, and shortens the supporting home sections. The
authenticated application and the full original `/overview` remain intact.
