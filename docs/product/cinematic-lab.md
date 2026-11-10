# Interactive cinematic lab

## Current owner direction, 10 November 2026

The shared preview now presents the same five orbital shots and field handoff as
`/`, using `main.js` through `lab-main.js`. The active contract is the five-shot
section in `cinematic-integration.md`. The former ten-chapter native descent,
parcel hotspots, and comparison presentation below describe the earlier experiment.
Its authored assets remain available for offline inspection. Browser acceptance
now exercises the five-shot camera, handoff, accessible controls, and fallback on
both routes.

## Historical lab experiment

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
`apps/web/public/cinematic/REFERENCE-NOTES.md`. Edolus supplies cinematography
principles including a full-viewport world, deliberate holds, sparse labels and
continuous perceived travel. Generated hybrid imagery and authored Blender GLBs
supply the lab descent. The existing spacecraft supplies the orbital chapters.

The native descent follows three readable scales from orbit through basin to one
field. Brief moving-cloud passages conceal the two approved scale changes.
Progress .30–.56 drives twelve seconds of absolute native animation. The final
field camera holds through the boundary, dates/quality, NDVI, inspection and
workspace chapters. The complete journey retains all ten chapters and nineteen
beats. Native parcel projection registers the boundary, comparison cells and
hotspots to the same visible field. Wide screens crop the authored 16:9 cameras
to fill the viewport. Portrait screens keep the complete parcel above the data
controls, with a soft foreground falloff into the panel background. This framing
holds from field arrival through the final chapter. The mobile registration
action sits in the final field panel.

The four GLBs and lighting environment are source-bound by SHA-256 and byte
length. Distant generated imagery and photo-projected foreground support this
shot's limited camera travel. Editable native parcels, palms, irrigation, camera
and moving clouds are retained in the external Blender masters. The accepted
12-second descent is one scoped visual milestone. Full-product acceptance
requires review of the integrated journey and its adjacent transitions.

ADR-0014 records the owner-authorized hybrid integration. The public landing
route retains its existing asset graph. One Three.js renderer owns the journey,
render targets and cleanup. Native assets load only in the active lab experience.

Acceptance for the prototype is a production build and real-browser evidence at
desktop and mobile sizes covering ten chapters, forward/reverse traversal,
chapter jumps, pointer/touch/keyboard controls, CTA, `NOT_ASSESSABLE`, reduced
motion and failure fallback. Hardware timing must name the renderer and limits.
Technical validation does not establish independent artistic acceptance or
equivalence with any reference.
