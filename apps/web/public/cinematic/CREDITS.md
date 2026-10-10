# Asset sources and permissions

- **Spacecraft:** original conceptual model authored as Three.js geometry for this prototype. Not a Sentinel-2 engineering model. Rounded surfaces, structural bus, foil bump surface, radiator fins, cell arrays, instrument, antenna and thrusters are geometry; no satellite cutout or AI-generated image is used.
- **Terrain:** original seeded geometry, rows, tracks, irrigation channel, trees and field boundary. A fictional illustration, not geographically surveyed Suphan Buri terrain. Values, area and dates in the interface are demonstration data.
- **Earth texture files:** downloaded from the official Three.js example texture collection on 9 October 2026: `https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg`, `earth_clouds_1024.png`, and `earth_lights_2048.png`. Redistribution accompanies the Three.js MIT license in `THREE-LICENSE.txt`. These are visual globe surfaces, not live Sentinel-2 products.
- **NASA context and credit:** NASA Goddard Space Flight Center Blue Marble imagery; Reto Stöckli and Robert Simmon. See https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/ and https://www.nasa.gov/nasa-brand-center/images-and-media/. NASA is not affiliated with or endorsing this prototype.
- **Thai font:** Noto Sans Thai, Google Fonts; SIL Open Font License 1.1 is bundled in `public/fonts/OFL.txt`. Hosted locally so rendering does not depend on Google Fonts at runtime.
- **Three.js:** MIT; pinned 0.170.0 to preserve the supplied project dependency. Vite retains the supplied major version.
- **Edolus:** visual/cinematography reference only. No code, logo, model, audio or texture from Edolus was copied. The live reference was inspected in local Chrome on 10 October 2026; direct visual equivalence is not asserted.
- No paid AI services, generated images or subscriptions were used. The owner authorized integration into the AgriScope Next.js application on 10 October 2026.

- Integration source: supplied `/Users/bill/agriscope-cinematic`, version 1.0.0; the original folder is retained unchanged apart from newly recorded evidence. The generated local vendor includes Three.js 0.170.0 and its addons.
