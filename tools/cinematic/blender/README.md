# Blender cinematic source

## Live Blender MCP art loop — 15 October 2026

MCP for Blender 2.1.9 (developer: ahujasid/mcp-for-blender), add-on 1.8 /
protocol 13, is verified with Blender 4.5.3 LTS. Use its published wheel: the
inspected upstream Git checkout omitted `blender_mcp.config`, while the release
contains it. Local Codex starts the pinned isolated server; the Blender add-on
listens only on 127.0.0.1:9876. Telemetry and external generators/libraries are
disabled. Existing MCP configuration and Blender preferences were backed up;
private configuration is not included in evidence. No runtime dependency added.

The source of truth remains the existing authoring functions and exported assets.
Use a separate `AgriScope-Hero-Art-Working.blend` for MCP edits, copied from the
SHA-bound delivered source. Never run the destructive scene generator inside a
live owner scene. The generator rejects a GUI/open saved scene and an existing
editable output file before deleting or writing anything. Promote selected edits into the responsible authoring function
before regenerating in a fresh background process and a new output directory.
MCP executes that same function for local iteration; it is not a second exporter.
Save the editable candidate with receipts and publish it with its SHA manifest.
Unrecorded manual edits are experiments, not a deliverable source of truth.

## Scene 4 runtime art transfer — 23 October 2026

`runtime_art_transfer.py` reads a separate authoring copy of the verified Scene 4
establishing master and exports either the bounded regional collections or the
Scene 4 `08_EXPORT` Hero Field collection needed by the browser. Fixed regional
reductions and the un-decimated Hero export produce the existing schema-1 mesh
container while reveal collections, cameras and NDVI registration remain in the
editable derivative for inspection. It never edits the verified master.

- Scene 4 master SHA-256:
  `5ef375387e51165c45e41f08db19c737b40709207e80a901443c3e35bd9f35c5`
- Separately archived Hero Field milestone SHA-256 (integrity reference; not an
  exporter input):
  `20f30c80278b04a91428b33f4633f18531662a3c2411bea5dfe255737cc967c7`
- Owner concept reference SHA-256:
  `755845999cdb05ba011e2262ca60c66330c3b9b129e306015c9315d3d0da29bc`
- Regional editable derivative SHA-256:
  `2aafb5dc35add8e63e6810a00af080f84cc669f94e75c9e8fcbfe33fa48409bc`
  (289,127,427 bytes)
- Hero editable derivative SHA-256:
  `76344b57671cb43e798434a5757446cc0069bb9d68207bfccab24b43c7ffed18`
  (290,537,078 bytes; 23 packed dependencies)
- Regional runtime asset SHA-256:
  `2abfb8fca677075c087359a8148ca4fcc704860a874bdf5e33e6774fd137f470`
  (774,811 bytes; 42,234 triangles; 25,071 vertices; six batches)
- Hero runtime asset SHA-256:
  `2b6bd63d50336983b866b4bf66a9339a8933cde2b70e28f781467056510539e9`
  (2,517,582 bytes; 98,743 triangles; 99,407 vertices; 12 batches)

Run with Blender 4.5.3 LTS:

```sh
AGRISCOPE_RUNTIME_TRANSFER_MASTER=/path/to/verified/AgriScope-Scene4-Establishing.blend \
AGRISCOPE_RUNTIME_TRANSFER_SOURCE=/path/to/separate/authoring-copy.blend \
AGRISCOPE_RUNTIME_TRANSFER_EVIDENCE=/path/to/fresh/evidence-directory \
AGRISCOPE_RUNTIME_TRANSFER_RUNTIME=/path/to/fresh/scene4-regional.mesh.json \
  blender --background --python tools/cinematic/blender/runtime_art_transfer.py
```

Set `AGRISCOPE_RUNTIME_TRANSFER_VARIANT=hero` and use fresh Hero evidence and
runtime output paths to rebuild the Hero derivative.

The runtime JSON was rebuilt byte-for-byte. Blender may rewrite equivalent
container bytes when saving, so the manifest binds each delivered `.blend`
instead of claiming byte-deterministic Blender containers. No concept pixels or
offline VDB volumes are exported. The browser clouds are a separate original,
bounded shader treatment; the compact mesh uses only established soil, crop,
water and leaf surface maps.

Start by reading file/scene/objects and capturing the viewport; successful install
alone is not connection proof. Match the production p=.56 camera and flatten
state, render, inspect pixels, export with the existing material-batched exporter,
and inspect desktop/mobile browser frames. Restore all flatten shape keys to
zero for compact export, then restore the review pose. CLI deterministic build,
GLB semantic validation and final-byte Ponytail review remain required.

This bounded art pass replaces only sample-plot rice ribbons with wider connected
canopy passes and grouped low-establishment areas, preserving the soil surface and accepted canal/boundary geometry. Other
holdings retain static distance-based simplification. The crop normal alone follows the deformation Jacobian to retain authored slopes;
no camera, timeline, product state, spacecraft or water changes are included.

## Regional landscape — 15 October 2026

`regional_map.py` bakes original illustrative regional color from the same parcel
records and access/irrigation paths as the compact farmland export. A 2048² map
covers 128 scene units; the central 64-unit modeled layout is preserved and an
outer agricultural continuation supplies the intermediate viewing scale. Earth
and terrain sample that one map in Thailand-tangent angular coordinates before
local materials resolve. The prior affine scale, terrain reveal, atmosphere
shader and camera path are unchanged. This texture is not observed imagery.

Only irrigation-safe neighboring blocks acquire narrower child holdings; original
sample, canal-adjacent clipping and bank geometry remain. Planting-local UVs bind
one authored 512² crop holding map with overlapping blade strokes, headlands and
grouped low-establishment areas. Far rows beyond eight units use these filtered
maps instead of redundant ridge meshes. Additional low shrubs follow existing
field edges. This is static distance-based simplification, not dynamic LOD.

The runtime still uses the existing compact mesh/material loader and shared
surface textures. The standalone regional map uses the existing texture loading,
error and disposal lifecycle, with a missing-map fallback regression. The edited
source and exact asset hashes are included in the downloadable milestone evidence.

## Current orbital redesign

The owner-approved proof follows 19 visual beats within the existing product
chapters. `survey_craft.py` creates the original ceramic/titanium survey craft;
`build_assets.py` retains the accepted land and vegetation generator unchanged.
`timeline.js` owns camera roll, craft approach, geographic aim and deployment.
`export_camera_contract.mjs` samples that same source for Blender, and
`render_assets.py` applies the matching articulated-part transforms.

Compact mesh schema 1 adds optional `part`/`pivot` records and authored emissive
values. Static assets without those records decode identically. Each articulated
part batches its shared materials. There is still one Three.js runtime and one
production mesh loader. GLB remains the semantic-checked interchange export.
The .blend and evidence are published as SHA-bound downloadable artifacts.

The spacecraft is original conceptual artwork, not a Sentinel replica. The
corridor is an illustrative data link. Final quality across the entire journey
is deferred until the proof segment receives independent visual review.

## Previous asset baseline and retained terrain


The web spacecraft and agricultural landscape are evaluated meshes authored by
Blender 4.5.3 LTS. They are original conceptual artwork, not an engineering model
of Sentinel-2 or a surveyed farm. No paid service, AI image or copied reference
asset is involved. Earth textures and the Thai font retain their existing credits.

The generator writes three compact material-batched mesh containers into
`apps/web/public/cinematic/models/`. Their combined transfer size is recorded
in the per-build metadata before HTTP compression. Seven spacecraft materials preserve folded
thermal blankets, hinges, individually modeled solar cells, a recessed lens,
radiator fins, harnesses, telemetry dish and thrusters. Land has adjoining
nonuniform quadrilateral parcels, continuous shared banks, raised crop ridges,
and irrigation recessed below the soil with separate slopes and access tracks.
Only the actual sample footprint and connected channel clearance are reserved
from adjoining parcels. The channel keeps its accepted centreline and water width, with a compact low
soil cross-section and one localized vegetated verge joining the sample-facing
bank to the unchanged field edge. Three tree variants use tapered branching and
attached folded broadleaf sprays, batched by material and instanced in seeded
groves. The branch-attached sprays break nearby
silhouettes while real gaps remain between crown masses. Distant crop rows use
low ridges rather than individual plants. All geometry uses fixed seeds.

`camera-contract.json` is generated from the production `sampleCamera()`
transforms. It locks eight desktop and eight mobile-safe review cameras: the
original shots 1, 3, 4, 5, 6 and 10 plus flyby (shot 2, progress .095) and
corridor (shot 11, progress .30). These are review samples of the existing
19-beat path, not new timeline beats. The editable source is organized into the numbered collections
`00_CAMERAS` through `09_REFERENCE`; `static_scene.py` adds the Earth texture
layers, geographic Thailand outline, lighting, review instances and field
boundary without changing the compact runtime export collections or scroll
timing.

The compact export preserves Blender base color, metalness, roughness, clearcoat,
UV coordinates (signed 16-bit at 1/512 precision), sidedness and normal strength.
`surface_maps.py` authors six tileable 256×256 color/normal/roughness sets with
Blender's bundled NumPy: soil clods, crop fibers, water ripples, broad foil creases,
brushed metal and leaf veins. The same images drive Blender nodes and runtime
MeshPhysicalMaterial. Color maps use sRGB; normal and roughness maps remain linear.
One shared texture set per role is disposed with the scene. Missing maps produce
the existing readable fallback. Water reflection uses the authored normal and
roughness maps, physical IOR, view angle and the original procedural outdoor
environment; the runtime does not paint periodic fragment-stage bands. No
additional Three.js runtime is introduced.

Surface artwork and modeled geometry are original AgriScope project assets,
licensed under the same terms as this repository. External runtime assets are
documented separately: the Thailand locator derives from public-domain Natural
Earth 1:10m Admin 0 Countries v5.1.2; the Earth day texture is NASA Blue Marble
Next Generation (October 2004); the cloud density texture is Solar System Scope
(CC BY 4.0); and the retained night map comes from the Three.js examples.
`apps/web/public/cinematic/CREDITS.md` and
`tools/cinematic/references/static-asset-board.json` record sources, usage terms,
processing and runtime hashes. No purchased assets or reference screenshots are
incorporated into runtime textures. Edolus review screenshots under `tools/cinematic/references/` retain third-party ownership and
are evidence only, with provenance and file hashes in their manifest.

The mesh budget is 6 MiB before HTTP compression, including UVs, with a separate
1.6 MiB surface-map budget. UVs increase transfer size while enabling actual
surface response; the generator's metadata reports triangles and bytes. These
budgets are not performance claims. Trees remain instanced rather than allocating
a draw call for each leaf or plant. Irrigation/track winding and the unchanged
boundary's clearance are checked against decoded runtime vertices.

Use Blender 4.5 LTS from https://www.blender.org/download/lts/:

```sh
export AGRISCOPE_BLENDER_OUTPUT=/absolute/path/outside/the/repository
blender --background --python tools/cinematic/blender/build_assets.py
blender --background --python tools/cinematic/blender/export_standard.py
blender --background --python tools/cinematic/blender/render_assets.py
```

Alternatively use an isolated Python 3.11 environment with the official
`bpy==4.5.3` package. Dependency installation must be authorized for that machine.
Run the same scripts with that environment's Python. There is no new frontend
package or loader dependency.

Set `AGRISCOPE_RUNTIME_OUTPUT` to route generated mesh JSON somewhere other than
the runtime models directory while inspecting a build. Copy only validated assets
into the runtime directory after checking their metadata and focused tests.

Outputs: editable `AgriScope-Cinematic-Assets.blend`, standard `spacecraft.glb`
and `farmland.glb` interchange prototypes, eight desktop locked-camera beauty
renders, eight clay renders, material-ID frames, focused wireframes and build
metadata. Mobile-safe cameras are stored in the source as well. Render filters
may select a smaller review subset; this orbital pass renders Earth, flyby,
payload and corridor for Blender/browser comparison.
`export_standard.py` repeat-exports each GLB, imports it into an empty Blender
scene and exports it again. The check fails on changed active scene roots, node
hierarchy or transforms, material bindings or PBR values, bound texture payloads,
triangle winding, positions, UVs or split corner normals. Negative controls in
the report prove those guards reject deliberate changes while accepting a value
that stays inside tolerance across a spatial-index boundary.
The .blend opens with the numbered source collections and locked shot-1 camera;
each review camera stores its viewport, progress and text-safe contract as custom
properties. Runtime meshes remain baked with split normals; quantization preserves
positions within 0.0006 scene units across the 36-unit landscape and 0.0002 scene
units across the spacecraft.

`render_assets.py` deliberately renders static acceptance frames only. Final
motion polish remains outside this milestone.
These units describe original artwork and do not assert agricultural area.

The browser uses the supplied local Three.js 0.170.0 runtime. Terrain detail and
curvature blend as the camera descends; the Earth surface clears at progress
0.455 so geographic map texture cannot show through gaps between the synthetic
parcels. All transforms, lighting states and evidence overlays are derived from
scroll progress. Runtime tree placement is seeded and batched by material.

```sh
node tests/cinematic/blender-assets.mjs
node tests/cinematic/terrain.mjs
node tests/cinematic/timeline.mjs
```

The generic sample uses the existing synthetic offline fixtures from
`apps/api/agriscope_api/demo.py`: 10 September 2026 / 0.68 and 20 September 2026 /
0.42. A separate example has zero common usable support and hides measurements
and the change overlay. No public backend or private farm API is called.

References used for workflow: Blender's glTF 2.0 documentation,
https://docs.blender.org/manual/en/3.6/addons/import_export/scene_gltf2.html.
Edolus https://edolus.com/ is a cinematography reference only; no assets or code
were copied and visual equivalence is not asserted.
