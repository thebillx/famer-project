# Asset sources and permissions

- **Spacecraft:** original AgriScope sci-fi orbital survey craft authored in Blender 4.5.3 LTS. Ceramic armour, titanium hardware, segmented energy wings and an articulated iris share stable material/pivot batches. No downloaded spacecraft geometry or AI-generated artwork. It is not a Sentinel replica or an AgriScope-owned satellite.
- **Terrain:** original Blender-authored synthetic landscape with a continuous sample plot, raised planting rows, tracks, irrigation canal/banks and a true-geometry instanced tree prototype. This is an illustration, not surveyed land. Runtime dates, values and quality masks reuse the project's existing offline demonstration fixtures; they are not satellite observations or area measurements.
- **Scene 4 regional derivative:** original AgriScope geometry derived from the
  SHA-bound Scene 4 establishing master. The lab-only 774,811-byte mesh carries
  the authored valley, waterways, access, distant ridges, woodland groups and
  riparian land-cover masses in six material batches (42,234 triangles). Source
  master SHA-256: `5ef375387e51165c45e41f08db19c737b40709207e80a901443c3e35bd9f35c5`;
  runtime SHA-256: `2abfb8fca677075c087359a8148ca4fcc704860a874bdf5e33e6774fd137f470`.
  The Hero Field remains a separate runtime derivative so its sample boundary
  and NDVI registration stay independently testable.
- **Scene 4 Hero Field derivative:** original AgriScope `08_EXPORT` geometry from
  the same SHA-bound Scene 4 authoring source, preserving its authored origin,
  orientation, sample boundary and NDVI registration. The lab-only mesh
  is 2,517,582 bytes with 98,743 triangles in 12 semantic material batches;
  runtime SHA-256:
  `2b6bd63d50336983b866b4bf66a9339a8933cde2b70e28f781467056510539e9`.
  Editable derivative SHA-256:
  `76344b57671cb43e798434a5757446cc0069bb9d68207bfccab24b43c7ffed18`.
  The separately accepted Hero Field milestone remains archived and
  integrity-verified at
  `20f30c80278b04a91428b33f4633f18531662a3c2411bea5dfe255737cc967c7`;
  it was not an input to this exporter, and no byte or geometry equivalence is
  claimed between the two Blender files.
- **Scene 4 browser clouds:** original shader volumes authored for this prototype
  from six deterministic lobe arrangements. The owner concept and Blender cloud
  layout informed framing and depth only; no concept pixels or VDB data ship in
  the browser.
- **Earth day map:** NASA Earth Observatory, Blue Marble Next Generation (October 2004). Historical visual composite, not current imagery or Sentinel data. NASA does not endorse AgriScope. Catalog: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/.
- **Earth clouds:** Solar System Scope, https://www.solarsystemscope.com/textures/, licensed CC BY 4.0. Attribution and modification details below.
- **Earth night:** retained Three.js example `https://threejs.org/examples/textures/planets/earth_lights_2048.png`, downloaded 9 October 2026; NASA Blue Marble credit (Reto Stöckli and Robert Simmon); Three.js distribution MIT.

### earth-day.jpg provenance

- Source: https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/october/world.200410.3x5400x2700.jpg
- Content: NASA Earth Observatory Blue Marble Next Generation, October 2004, 5400×2700
- Retrieved: 2026-10-14T11:18:29.939273+00:00
- Usage: NASA media-use guidelines: https://www.nasa.gov/nasa-brand-center/images-and-media/
- Processing: Original JPEG bytes; no geographic alteration
- Source SHA-256: `ccfd9b7a5e5ee601e1466556716bba50ea418f3a8e068ab0194ae0425815b1b0`
- Runtime SHA-256: `ccfd9b7a5e5ee601e1466556716bba50ea418f3a8e068ab0194ae0425815b1b0`

### earth-clouds.jpg provenance

- Source: https://www.solarsystemscope.com/textures/download/8k_earth_clouds.jpg
- Content: Solar System Scope global cloud density texture, source 8192×4096
- Retrieved: 2026-10-14T11:22:26.056102+00:00
- Usage: CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
- Processing: Resized from 8192×4096 to 4096×2048; green density channel encoded JPEG quality 93, 4:4:4, no geographic relocation. Linear cloud density/bump data.
- Source SHA-256: `c792eca228989d36ebb45d3ea6ff1198be5e21a25d70d2fbcb2124ffd14ba7f5`
- Runtime SHA-256: `c15373b492a66f057e4fb1427c60d4cd42d34491b5154a6bab686ab0ad646a2b`

- **Thai font:** Noto Sans Thai, Google Fonts; SIL Open Font License 1.1 is bundled in `fonts/OFL.txt`. Hosted locally so rendering does not depend on Google Fonts at runtime.
- **Three.js:** MIT; pinned 0.170.0 to preserve the supplied project dependency. Vite retains the supplied major version.
- **Edolus:** visual/cinematography reference only. No code, logo, model, audio or texture from Edolus was copied. A local Chrome inspection on 11 October 2026 verified orbital satellite/Earth-limb, pale atmospheric satellite, cloud-layered urban terrain, and dark compute-core scenes. These scenes inform composition, light and material response; no equivalence claim is made.
- **Interactive lab references:** Edolus was re-inspected in a real browser on 23 October 2026 as the primary motion reference. ThreeUI Meridian was selected as a secondary information-hierarchy cue. Aurora Link, MUGEN and Fathomless were inspected through their public preview videos. No ThreeUI Pro access, source, export, model, image or template asset was used. Details and URLs are recorded in `REFERENCE-NOTES.md`.
- **Surface maps:** original AgriScope artwork, MIT (repository LICENSE), generated by `tools/cinematic/blender/surface_maps.py` in Blender. Six locally bundled 256×256 color/normal/roughness sets cover soil, crops, water, foil, metal and leaves. Blender and the existing Three.js 0.170.0 runtime use the same UV-mapped images. No third-party surface texture is included.
- No paid AI services, generated images or subscriptions were used. The owner authorized integration into the AgriScope Next.js application on 10 October 2026.

- Integration source: supplied `/Users/bill/agriscope-cinematic`, version 1.0.0; the original folder is retained unchanged apart from newly recorded evidence. The generated local vendor includes Three.js 0.170.0 and its addons.

### Original regional landscape artwork

`textures/regional-landscape.png` is an original deterministic color bake from
AgriScope's authored synthetic parcel, access-track and irrigation layout.
`textures/surfaces/crop-*.png` contains original planting-aligned blade artwork.
No satellite/reference image pixels are included. These assets use the same
project licence as the other original Blender artwork; Thai aerial references
are guidance only. The regional atlas is illustrative, not observed farm data.
