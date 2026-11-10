# Cinematic storyboard and Blender refinement

## Active Blender MCP hero crop iteration — 15 October 2026

Base `d3e21b50c3db732346d902db94ded576df834c26`; clean feature worktree.
Scope: local Blender MCP installation and connection proof; sample crop authoring
in `build_assets.py`, its farmland export, crop-normal parity in `terrain.js`, focused asset checks, this contract and
Blender README. Existing evidence workflow may update its comparison baseline.
Only public synthetic scene data; no private configuration in GitHub evidence.
Keep PR #19 Draft. Production checkout and owner Untitled scene are excluded.

Use the existing generator as reproducible source of truth and a separate editable
MCP working copy. Inspect p=.56 Blender/browser desktop/mobile before promoting
changes. Preserve all accepted terrain surfaces, NDVI, 19 beats/cameras, atmosphere,
water, UI and fallback contracts. Validate deterministic assets, GLB round trip,
geometry regressions, browser directions, typecheck/build; then exact-byte review.
Stop at applicable Human Gates. Local inspection is not independent art approval.

Selected candidate: connected canopy passes replace the narrow sample ribbons;
leaf-card variants were rejected because they read as detached dark dots on
mobile. The crop normal uses the exact displacement Jacobian, retaining authored
slopes in the browser. Other terrain-normal paths are unchanged. Farmland grows
from 93,783 to 98,743 triangles (+4,960), and 2,488,176 to 2,518,079 bytes
(+29,903); 13 batches remain. At p=.56: 54 draw calls in both viewports;
desktop rendered triangles 214,931 → 219,891, mobile 179,763 → 184,723.
These are workload counts, not frame-rate claims. All 12 non-crop batches remain
byte-identical, and live MCP / fresh CLI farmland exports match byte-for-byte.

Artistic status remains pending independent review. The sample has more visible
continuous canopy relief, but the overall landscape remains stylized, planting
passes are still regular, and Blender contact shadows are stronger than the
browser. No change to exposure, foliage, water or atmosphere conceals these gaps.
The changed farmland rebuild is deterministic; the unchanged spacecraft generator
produced differing serialized solar-cell batches between two rebuilds. Those regenerated
spacecraft JSON files are not shipped. Retained runtime spacecraft bytes are
unchanged, and both GLB asset sets pass the existing semantic round trip.

## Active regional landscape milestone — 15 October 2026

Baseline `1310c66f893c3df9007853e393dd79b69230e0af`; clean feature worktree.
Draft PR #19, no merge/deploy. Three repeatable review frames: regional descent
p=.44, field approach p=.51, hero field p=.56, desktop 1440×900 and mobile
375×667. Actual Copernicus Bangkok and Rangsit canal references inform parcel
hierarchy, access and planting direction. Actual Edolus captures inform depth
and lighting only; no agricultural scene is attributed to Edolus.

Ownership: Blender land composition and crop-map authoring in `build_assets.py`
and `surface_maps.py`, internal `regional_map.py` bake, generated farmland mesh/
crop textures and regional color atlas; `earth.js`, `terrain.js`, `main.js` bind
that shared atlas through existing texture lifecycle via internal `regional-surface.js`; focused cinematic tests, this
contract, Blender README/runtime credits and existing CI comparison baseline. Editable source,
reference copies, captures and reports stay in the external SHA-bound evidence
artifact. No third-party pixels enter runtime assets or private data is used.

The regional bake shares exported holding footprints and recorded tracks, then
extends only the distant color fabric. It replaces magnified global-map color
locally on both surfaces; it does not imply higher-resolution observed data.

Preserve the existing parcel clipping/clearance code, sample footprint, irrigation
profile, cameras, 19 beats, atmosphere correction, spacecraft, narrative and
product behavior. Add planting hierarchy only on parcels clear of canals; the
accepted surfaces at joins remain the datum. Reuse the same material batches
and map loader. No dependencies, schema or public API change. Stop for applicable
repository Human Gates; review final bytes before commit/push.

Validate existing triangle-interior clearance/edge regressions, authored UV and
map binding, deterministic rebuild, runtime/camera/quality/fallback checks,
typecheck and production build. Inspect matched pixels and a connected normal-
speed forward/reverse clip before packaging; code review and tests do not grant
independent artistic acceptance. Report asset bytes, authored/rendered triangles,
material batches and remaining artistic gaps separately from performance.

Local candidate status: functional and geometry regressions pass; independent
artistic approval remains pending. Holdings, grouped planting variation and the
regional-to-local material relationship are more legible in inspected browser
frames. The scene remains stylized: outer continuation is regular, distant trees
are sparse, and cloud texture magnification remains visible before the regional
passage. These are remaining artistic gaps, not claims of reference equivalence.

The selected land export has 93,783 triangles versus 84,393 at baseline (+9,390),
with the same 13 material batches. New distant holdings use native triangulated
face normals because Blender's custom smooth-normal re-encoding exceeded the
unchanged GLB round-trip tolerance on a narrow parcel. This increases packed
vertices, not rendered triangles. The canal water, tracks, wet slopes and damp
shoulder retain identical encoded geometry/normals; subsoil clearance still passes
triangle-interior tests. Ground's shared batch also contains the added shrub stems.
The 2048² regional map adds one shared sampled texture, with no added draw call;
512² crop maps replace the former 256² set. Report measured payload and workload
separately; counters are not FPS evidence. No threshold or validator changes.

## Active atmosphere brightness correction — 15 October 2026

Baseline `369bb2c55b72535dd815aca38d61d5f16b15e81b`. Scope: Earth atmosphere
view-vector interpolation, focused runtime/browser regressions, this contract,
and the existing evidence comparison baseline. Draft PR #19; no merge/deploy.
No camera, timeline, authored asset, terrain, corridor, product or dependency
changes. Production checkout and unrelated work remain outside ownership.
Only synthetic public scene data is used; repository Human Gates still apply.

Production layer isolation attributes the cyan wash to the additive atmosphere
shell. Removing Earth clouds, local clouds, terrain, fog or bloom does not remove
that component. The exterior shell crosses the desktop camera near .451 and the
mobile camera later around .47 (triangle/near-plane crossing is viewport-dependent). Its vertex shader normalized view vectors before
perspective interpolation. At near-shell triangle interiors, the interpolated
unit directions deviate strongly from the actual view ray, falsely activating
the limb term over the screen. Clipping/culling then removes that false wash.

Keep the view-space vector magnitude through raster interpolation; normalize in
the existing fragment expression. No opacity schedule, culling mode, clipping
plane, light, fog, geometry or validation tolerance changes. The existing local
atmospheric depth remains. Tests use actual sphere triangles and production
cameras to demonstrate the old interpolation error and the corrected ray, plus
dense forward/reverse and paused browser states at both crossing intervals.

Inspect actual consecutive desktop/mobile frames and normal/slow traversal,
including other aspect ratios, before final delivery. Preserve prior terrain-pop,
corridor-readability and cloud-placement gains. Publish matched baseline/current
pixels, original-speed motion, raw timing, encoded endpoints and exact-byte
Ponytail coverage. Functional/geometry validation and code review do not grant
independent visual acceptance. Basemap and regional-terrain artistry remain
separate future work; no Edolus-equivalence claim.

## Active descent continuity correction — 15 October 2026

Baseline: `83d0ada5ea6583b3e95cd543c878d0ddd8a2dddb`. Draft PR #19;
no merge/deployment. Ownership: `main.js`, `terrain.js`, `survey-corridor.js`,
new internal `descent-surface.js`, affected cinematic tests, this contract and
existing evidence workflow baseline. No asset bytes, camera keys, product copy,
GLB validator/tolerance, dependencies, application routes or production checkout.
Only synthetic public scene data is involved. Stop for repository Human Gates.

Controlled production-browser layer isolation established that the `.405`
visibility switch exposed a nearly tangent 64-unit landscape over a radius-40
Earth while local materials were already partially active. At local x=20,z=0,
the radius-40 sphere is about -5.36 units below the tangent, whereas the accepted
field is near -0.1: a material fade alone cannot reconcile these surfaces.
The former fixed-height local cloud ellipsoids were also visible beyond the globe
before the descent; the one-pixel information line lost contrast against clouds.

Use one smooth magnification about the Thailand tangent: Earth radius 40 → 900
and landscape scale radius/900 between .375 and .465. The 900 radius follows the
accepted field's 1800 curvature divisor. All terrain layers use one affine
transform, so triangle interiors, canal clearances and alignment are preserved;
original coordinates and scale return exactly before the sample boundary appears.
Keep the 19 beats and camera position/target/FOV/roll curves unchanged. This is an
illustrative multi-scale journey, not a metric geographic flight or a claim that
the synthetic sample is observed at that real Thailand coordinate.

The geographical texture mapping uses the same tangent and angular footprint on
both surfaces. A bounded incoming material transition precedes local detail;
transparent terrain composes before the higher cloud strata. Cloud banks are
positioned above the shared surface and join the existing spherical cloud layers
after the world has expanded. A finite curved corridor cross-section with soft
angular response remains visible in portrait framing. No enclosing cone, opaque
screen fog, camera seek during motion, playback retiming or new texture noise.

Validation includes the existing triangle-interior/parcel-edge regressions,
affine-interpolation and C1 scale checks, dense forward/reverse browser states,
paused/changed-direction scroll, Thai/CTA/NOT_ASSESSABLE and failure/lifecycle
checks. Evidence includes baseline/current isolation, diagnostic colors, dense
frames, equal-speed normal/slow transition recordings and full raw motion.
Functional, geometry and evidence status are separate from artistic acceptance:
self-inspection and Ponytail code approval do not constitute independent visual
acceptance. Remaining terrain/foliage/material artistry is outside this slice.


## Active orbital rendering correction — 14 October 2026

Baseline: `474190f560639eb9f587b427eb81c56f3d4e1f6c`. Keep Draft PR #19;
no merge/deployment. The independent review locks all 19 beats, C1 cameras,
craft silhouette/articulation, Thai narrative, CTA, quality states, and accepted
farmland geometry. This scope supersedes the earlier permission to redesign
choreography and the earlier exclusion of Earth textures.

Correct the illustrative corridor, cloud depth, Earth detail and craft material/
lighting response. Use a narrow curved data trace and absolute-progress packets,
separated world-space cloud volumes, terrain-conforming scan lines, layered
Earth clouds and credited higher-resolution maps. Preserve the agricultural
lighting end state. No new dependencies, public APIs or private data.

Static desktop/mobile hero inspection precedes full evidence. Additional Blender
review cameras sample the existing flyby/corridor transforms; they add no beats.
Keep functional, geometry, artistic and evidence status separate: closed geometry
findings stay closed; implementation self-check and Ponytail code approval are
not independent artistic approval. Final delivery requires matched 474190f views,
actual reference captures, Blender/browser parity, original-speed motion, raw
recorded/unrecorded probes, and final-byte review/source mapping.

## Active owner direction — 14 October 2026

Baseline: `441107574430adc6ec59ceaaa8ec524d5ec29c30`. Draft PR #19.
This visual-development milestone supersedes the fixed ten-camera and static-only
restriction below. Keep the existing product chapters as readable navigation;
visual beats may be more numerous. No merge or deployment.

### Proof boundary

Owned: cinematic runtime modules and spacecraft mesh; Blender generation,
render and camera-export tools; focused cinematic tests; this existing contract,
the Blender README and cinematic evidence workflow's baseline reference.
No production checkout, terrain/tree mesh, Earth texture, field geometry,
NDVI calculation, farm/auth/overview route, package dependency or API changes.
Only public synthetic data is used. Source/evidence stays in the cinematic worktree
and its external evidence directory. Stop for a real repository Human Gate.

### Beat sheet and camera rationale

| Progress | Visual beat | Camera and purpose |
| --- | --- | --- |
| 0 | Earth limb | Diagonal horizon, room for Thai benefit copy |
| .045 | Approach | Original craft enters from orbital distance |
| .095 | Flyby | Three-quarter approach with Earth below the craft |
| .135 | Chase | Match the craft after its pass |
| .18 | Wing traverse | Close under-wing parallax exposes segmented structure |
| .22 | Payload | Shallow iris, titanium rings and ceramic bus |
| .265 | Alignment/deployment | Wings align, rings turn, iris opens |
| .30 | Survey corridor | Payload axis targets the geographic destination |
| .33 | Leave the craft | Camera moves beside the tapered data volume |
| .36 | Thailand | Existing geographically attached locator |
| .39 | Atmospheric/spectral passage | Cloud depth across the scale transition |
| .42 | Regional footprint | Geographic scan grid selects the destination |
| .46 | Agricultural descent | Local landscape and irrigation become readable |
| .51 | Field approach | Footprint contracts to the accepted bounds |
| .56 | Boundary | Existing exact field overlay takes over |
| .65 | Dates and quality | Preserve both valid and insufficient-data states |
| .76 | Matched NDVI | Existing common-support comparison |
| .86 | Inspection/limits | No conclusion when NOT_ASSESSABLE |
| .95–1 | Workspace | Registration handoff remains prominent |

The production path is a shared C1 Hermite position/target/FOV/roll spline.
Craft approach, geographic aim, deployment, iris and corridor derive from absolute
progress. No wall-clock orbital drift. Mobile uses the same path with continuous
aspect-aware framing. Product state after the boundary is unchanged.

### Asset direction and evidence

Original survey-craft silhouette: low octagonal keel, ceramic armour, brushed
and machined titanium, swept segmented wings, asymmetric radiator/tracker,
shallow multispectral iris, alignment actuators and gold/cool status keys.
Blender `survey_craft.py` explicitly authors these shapes; the editable source
retains each component. Runtime batches by material and articulated part; each
part has a shared pivot, avoiding duplicated per-component motion logic.
The accepted land, vegetation, sample geometry and credited Earth maps are reused.

Saved Edolus frames in `tools/cinematic/references/manifest.json` provide guidance
for diagonal composition, narrow highlights and layered wings. Their pixels are
never runtime assets. The scene depicts an illustrative data connection, not an
AgriScope-owned satellite or a physical beam emitted by passive imagery.

Inspect the rough full forward/reverse animatic before final asset treatment.
Use local Blender/browser/mobile loops for the proof, then required exact-byte
Ponytail review, commit/push and exact-head CI. Deliver original-speed recordings,
raw timing, editable Blender source, provenance, material-parity comparisons and
source hashes. Keep functional, geometry, artistic and evidence status separate.
Artistic approval remains independent; tests and counters cannot establish it.

## Historical ten-shot contract (superseded camera restriction)


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
