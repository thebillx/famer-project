# ADR-0014 — Integrate the authored hybrid descent into the cinematic lab

Date 2026-11-10. Accepted implementation of the owner-authorized Blender GLB and hybrid imagery direction.

## Decision

Keep the existing single Three.js 0.170 renderer and ten product chapters. Load the accepted orbit, regional, field and moving-cloud GLBs only in `/cinematic-lab`. Native clips use their authored 16:9 cameras and absolute animation time. Two brief cloud-covered scale changes preserve the approved three-scale storyboard.

The existing orbital spacecraft sequence leads into native descent at progress .30–.33. Native time advances from zero at .30 to twelve seconds at .56. Orbit-to-basin and basin-to-field blends occur at native seconds 3.69–3.81 and 7.69–7.81. The final field camera holds through boundary, quality, NDVI, inspection and workspace chapters.

Render the native scenes into reusable render targets and composite with the existing renderer. Preserve the reference reader's unlit image colors, AgX PBR mapping, alpha handling and environment. Verify the exact downloaded bytes against a source-bound manifest before parsing.

Project the accepted native parcel vertices through the native camera. Register the existing synthetic boundary, comparison cells and hotspot coordinates through one projective mapping. Keep vertex identities fixed while seeking. Portrait framing crops within the authored image coverage and applies the same crop to all overlays.

## Tradeoffs and validation

The hybrid distant imagery supports the authored shot and limited camera travel. Editable foreground geometry and moving clouds provide local depth. This approach carries approximately twenty megabytes of additional lab-only assets and requires visual material parity checks across the reader and pinned runtime.

Validation covers all ten chapters, dense forward/reverse joins, native camera and material parity, parcel registration, portrait coverage, synthetic data semantics, keyboard/touch paths, reduced motion, asset failure, cancellation and disposal. Independent full-journey artistic review follows browser evidence. The accepted twelve-second descent receipt has a narrower scope than the integrated experience.
