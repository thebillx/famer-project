# Original Blender assets

The web spacecraft and agricultural landscape are evaluated meshes authored by
Blender 4.5.3 LTS. They are original conceptual artwork, not an engineering model
of Sentinel-2 or a surveyed farm. No paid service, AI image or copied reference
asset is involved. Earth textures and the Thai font retain their existing credits.

The generator writes three compact material-batched mesh containers into
`apps/web/public/cinematic/models/`. Their combined transfer size is recorded
in the per-build metadata before HTTP compression. Seven spacecraft materials preserve folded
thermal blankets, hinges, individually modeled solar cells, a recessed lens,
radiator fins, harnesses, telemetry dish and thrusters. Land includes raised
planting beds, staggered and proportion-varied parcels cleared against the
sample field's actual footprint, adjacent paddies placed around the unchanged
sample field, connected shallow irrigation runs with separate raised banks,
two access spurs and low track crossings, and three instanced branched tree
silhouettes. The compact export keeps Blender base color, metalness, roughness
and clearcoat. The existing browser loader adds role-based procedural detail
for spacecraft finishes, foliage, soil, crops, tracks and canal water without
UV maps or third-party surface textures. These meshes are synthetic illustration and do not
represent surveyed ownership or real irrigation.
Planting rows retain upward-facing normals through the Blender-to-runtime axis
conversion. Tree variants share one JSON file with tapered bark and batched,
pointed foliage in shaded and sunlit material batches. Terrain uses procedural
roughness and multi-scale color grain in Blender and the web shader. Geometry
uses fixed seeds for reproducible output. Irrigation bed, raised bank and track
crossing triangles are explicitly oriented upward; the mesh check verifies
water and track winding for the overhead Three.js camera.

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
and `farmland.glb` interchange models, two Blender preview renders and build
metadata. The .blend initially displays the spacecraft with an inspection camera
and lights; enable the separate agricultural collection to edit the landscape.
The runtime meshes are baked with split normals; quantization preserves positions
within 0.0006 scene units across the 36-unit landscape and 0.0002 scene units across the spacecraft.
These units describe original artwork and do not assert agricultural area.

The browser uses the supplied local Three.js 0.170.0 runtime. Terrain detail and
curvature blend as the camera descends; the Earth surface clears at progress
0.555 so geographic map texture cannot show through gaps between the synthetic
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
