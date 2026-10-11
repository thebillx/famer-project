# Cinematic storyboard and Blender refinement

Status: CONTRACT_READY. Owner approval: 10 October 2026, after the complete
public-to-authenticated flow review. Branch: codex/cinematic-refinement; base:
cd8b9207ddcb8211873369c1c9705967c151f2a6.

## Outcome

One reversible ten-shot journey: Earth/benefit, spacecraft, payload, Thailand,
descent, field boundary, observation quality, dated NDVI comparison, inspection
summary, and application handoff. Retain Thai-first AgriScope branding. The home
page then contains concise steps, provenance/limitations, and entry actions.
Authenticated farm/field workflows remain intact. Login/register links select
the intended existing form mode; no authentication/API behavior changes.

## Ownership and preservation

The four modified scene files and terrain test are the previous contribution,
explicitly continued by the owner. Their exact pre-change bytes are backed up
outside the repository. Allowed: apps/web/public/cinematic/, components/cinematic/,
components/landing/LandingSections.tsx and landing-content.ts, app/page.tsx
(compact home sections), app/login/page.tsx
(form-mode intent only), tools/cinematic/, tests/cinematic/, focused landing/auth
browser tests, this contract, and the existing cinematic integration contract.
No other farm, field, API, auth-service, database, tenant, formula, deployment,
production-data or unrelated owner files are included.

## Assets and evidence

Author spacecraft and agricultural terrain using the actual Blender engine,
retaining an editable .blend and reproducible Python source. Export material-
batched, quantized true meshes for the existing local Three.js ESM runtime.
Do not install a new frontend runtime or use paid AI assets. All geometry and
textures are original or the already-credited supplied Earth assets. The model
is a conceptual Earth-observation spacecraft, not a certified Sentinel-2 replica.

Public example dates/values/masks reuse the existing offline demonstration specs
in apps/api/agriscope_api/demo.py: inspect (2026-09-10/.68, 2026-09-20/.42),
measured (.47/.56), insufficient (.52 left/.48 right). This is labelled synthetic
throughout and makes no API requests or real Sentinel-2 observation claims.
Illustrative field geometry has no legal ownership or real-area assertion.
Insufficient common data shows no change measurements or inspection conclusion.
Do not infer disease, pests, treatment, or crop health from the example colors.

## Validation and delivery

Inspect all ten rendered shots on wide desktop, tall desktop, and two mobile
viewports, including forward/reverse, sample/entry/chapter controls, resize,
reduced motion, missing asset and failed-renderer fallbacks. Check numerical
camera continuity, source/asset reproducibility and bounded draw calls. Inspect
the actual Next.js home/auth handoff and run typecheck/build when the environment
can support it. Report software WebGL and emulation limits accurately.

Keep source and asset checksums together when syncing to the owned Mac worktree.
Ponytail LOCAL_NATIVE approval is still required before commit/push/PR/merge.
No production deployment is authorized. Stop at unavailable native review or
physical access rather than substituting another machine or bypassing the gate.
