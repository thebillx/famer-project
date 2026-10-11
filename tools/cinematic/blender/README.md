# Original Blender assets

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
Only the central cell is reserved for the unchanged sample boundary and canals.
Three tree variants use tapered branching and small folded leaves, batched by
material and instanced in seeded groves. Distant crop rows use low ridges rather
than individual plants. All geometry uses fixed seeds.

The compact export preserves Blender base color, metalness, roughness, clearcoat,
UV coordinates (signed 16-bit at 1/512 precision), sidedness and normal strength.
`surface_maps.py` authors six tileable 256×256 color/normal/roughness sets with
Blender's bundled NumPy: soil clods, crop fibers, water ripples, broad foil creases,
brushed metal and leaf veins. The same images drive Blender nodes and runtime
MeshPhysicalMaterial. Color maps use sRGB; normal and roughness maps remain linear.
One shared texture set per role is disposed with the scene. Missing maps produce
the existing readable fallback. No additional Three.js runtime is introduced.

Surface artwork and geometry are original AgriScope project assets, licensed
under the same terms as this repository. No external textures, purchased assets,
or reference screenshots are incorporated into the runtime. Edolus review
screenshots under `tools/cinematic/references/` retain third-party ownership and
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
