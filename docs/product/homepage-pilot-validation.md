# Homepage pilot validation

Date: 2026-11-18
Route: `/cinematic-lab?qa=1`
Runtime: local Next dev server on `127.0.0.1:5180`, software WebGL

## Evidence

The pilot handoff was captured after seeking the runtime to checkpoint `0.95` (field readout state):

- `test-results/cinematic/pilot-scene-375x667.png`
- `test-results/cinematic/pilot-scene-390x844.png`
- `test-results/cinematic/pilot-scene-1440x900.png`

## Checks

All three exact viewport sizes were exercised: 375x667, 390x844, and 1440x900.

- The runtime reported the requested viewport dimensions.
- `document.documentElement.scrollWidth` matched the viewport width at each size; no horizontal overflow was observed.
- No `audio` or `video` elements were present (`0` at each size).
- The WebGL canvas remained present and the field handoff rendered.
- The handoff state exposed `FIELD A–204`, NDVI, area `18.4`, the RED + NIR readout, dated comparison `0.64 → 0.71`, quality context, and the non-diagnosis boundary copy.
- The trend control expanded successfully at the handoff state.

No source-code fixes were required during this validation pass.
