# Interactive cinematic lab

Status: CONTRACT_READY. Owner mission: 23 October 2026.

`/cinematic-lab` is an isolated browser prototype for developing AgriScope's
camera, lighting, motion, Thai narrative and purposeful interaction together.
It reuses the single-renderer boundary accepted by ADR-0012 and does not replace
the public home page during this slice. `/overview`, farm, field and auth routes
remain outside the owned boundary.

The prototype tells ten product chapters through the existing nineteen visual
beats. All camera and scene state remains a function of absolute scroll progress,
so reverse traversal and chapter jumps restore the same state. Optional pointer
parallax is bounded to the spacecraft sequence and returns to zero when the
pointer leaves. Payload inspection, field hotspots and the dated NDVI comparison
have keyboard and touch paths and do not block scrolling.

All field values and visuals are synthetic demonstration content. The experience
must keep `NOT_ASSESSABLE` consistent across copy, values, legend and overlay and
must not infer disease or cause from satellite data alone. Registration continues
to use `/login?mode=register`. Reduced motion, JavaScript/module/asset/WebGL
failure and context loss retain readable Thai content and the registration path.

Reference direction is recorded in
`apps/web/public/cinematic/REFERENCE-NOTES.md`. No ThreeUI Pro or Edolus source,
asset, branding or imagery is incorporated. Existing original compact mesh assets
remain the runtime source; the accepted Blender masters stay editable evidence and
are not imported as unmeasured full-scene browser payloads.

Acceptance for the prototype is a production build and real-browser evidence at
desktop and mobile sizes covering ten chapters, forward/reverse traversal,
chapter jumps, pointer/touch/keyboard controls, CTA, `NOT_ASSESSABLE`, reduced
motion and failure fallback. Hardware timing must name the renderer and limits.
Technical validation does not establish independent artistic acceptance or
equivalence with any reference.
