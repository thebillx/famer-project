# Public cinematic journey integration

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
