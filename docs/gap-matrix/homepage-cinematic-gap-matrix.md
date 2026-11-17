# Homepage Cinematic Gap Matrix

Baseline: `main` at `60231628548091d9aed51237a413377a2bea23e9`.
Recovery reference: PR #19 commit `a118c28140d513334263747cd3cefb5455d0eb51`.
Contract: `docs/contracts/homepage-cinematic-v1.md`.

Status vocabulary: `partial` means the current five-shot landing contains related behavior but not the contracted ten-panel narrative; `missing` means the contracted panel/beat is not present in the current public landing runtime.

## Source file references

| Ref | File and lines | Use |
|---|---|---|
| M1 | `apps/web/public/cinematic/timeline.js:3-9` | Current five public shots |
| M2 | `apps/web/public/cinematic/timeline.js:13-22` | Current five-shot camera keys |
| M3 | `apps/web/public/cinematic/main.js:297-307` | Current five-shot rail and URL/panel selection |
| M4 | `apps/web/components/cinematic/markup.ts:4,11-17` | Current five-shot anchors, narrative, field panel and fallback |
| R1 | `apps/web/public/cinematic/timeline.js:3-14` at `a118c28` | Ten authored panel contract |
| R2 | `apps/web/public/cinematic/timeline.js:18-24` at `a118c28` | Nineteen authored motion beats |
| R3 | `apps/web/public/cinematic/timeline.js:28-46` at `a118c28` | Seventeen source camera keys and interpolation path |
| R4 | `apps/web/components/cinematic/cinematic.css:4,17` at `a118c28` | Landing 750svh and mobile 600svh heights |

## Panel matrix: 10 × 10

| # | Panel / p | Current status | Main evidence | Recovery reference | Asset(s), source bytes | Risk / required action |
|---:|---|---|---|---|---|---|
| 1 | FROM ORBIT TO YOUR FIELD / 0.00 | partial | M1 lines 3-4; M4 lines 11,17 | R1 lines 3-4 | `native-descent/orbit.glb` 2,524,292; `native-descent/clouds.glb` 1,453,272; `textures/earth-day.jpg` 1,766,694; `textures/earth-clouds.jpg` 3,570,291 | Restore original promise/copy while keeping one shared engine and lazy assets. |
| 2 | EARTH OBSERVATION / 0.10 | missing | M1 lines 3-9 has no panel at .10; M3 lines 297-307 creates only five rail buttons | R1 line 5; R2 lines 19-20 | Reuses orbit/cloud/Earth assets above; no unique panel asset | Add panel mapping between flyby .095 and chase .135; avoid beat-ID-only transitions. |
| 3 | MULTISPECTRAL INSTRUMENT / 0.22 | partial | M1 line 7 mentions instrument orbit; M4 line 12 has static instrument label | R1 line 6; R2 lines 20-21 | `native-descent/orbit.glb` 2,524,292; surface maps under `textures/surfaces/` | Restore payload/alignment/corridor/departure choreography and exact Thai copy. |
| 4 | THAILAND / 0.36 | missing | M1 has no Thailand panel; M4 line 4 has no Thailand anchor | R1 line 7; R2 lines 21-22 | `native-descent/regional.glb` 2,195,860; `textures/regional-landscape.png` 1,225,353 | Recover geographic focus and regional tile without duplicating engine logic. |
| 5 | ATMOSPHERIC DESCENT / 0.46 | missing | M1 has no descent panel; M4 has no descent narrative | R1 line 8; R2 line 22 | `native-descent/clouds.glb` 1,453,272; `native-descent/field.glb` 8,212,900; `field-world.hdr` 4,677,061 | Restore descent with explicit simulation disclaimer and performance tiering. |
| 6 | YOUR FIELD BOUNDARY / 0.56 | partial | M4 line 13 has a field panel and handoff, but no cinematic boundary beat | R1 line 9; R2 line 22 | `farmland.mesh.json` 2,518,079; `field.glb` 8,212,900 | Connect boundary visual to the same field used by comparison/handoff. |
| 7 | DATES AND QUALITY / 0.65 | partial | M4 line 13 contains date, cloud and quality metadata, but not a scene panel | R1 line 10; R2 line 23 | Reuses field panel plus data metadata; no separate authored asset | Make date pairing and insufficient-data state explicit in narrative and fallback. |
| 8 | CHANGE OVER TIME / 0.76 | partial | M4 line 13 has hidden trend control, but not a timeline scene | R1 line 11; R2 line 23 | Reuses field panel/trend; no separate authored asset | Restore NDVI comparison and retain sample-data disclaimer. |
| 9 | INSPECTION EVIDENCE / 0.86 | partial | M4 lines 13,17 contain demo note/static sample, but no contracted evidence scene | R1 line 12; R2 line 23-24 | Reuses field assets; no separate authored asset | Preserve limitation that satellite data alone does not identify cause. |
| 10 | AGRISCOPE WORKSPACE / 0.95 | partial | M4 lines 13,17 contain `/login` handoff, but no final workspace panel | R1 line 13; R2 line 23-24 | No unique 3D asset; CTA/workspace routes are application behavior | Add final hold from .95–1.0 with truthful CTA and accessible fallback. |

## Beat matrix: 19 × 19

| Beat / p | Contract panel | Current status | Main evidence | Recovery reference | Asset / recovery source | Risk |
|---|---:|---|---|---|---|---|
| earth-limb / .000 | 1 | partial | M1:3-9; M2:13-22 | R2:19 | orbit.glb 2,524,292 + Earth textures | Preserve opening composition. |
| approach / .045 | 1 | missing | M2:13-22 has different five-shot keys | R2:19; R3:28-30 | orbit.glb 2,524,292 | Recover approach without camera reset. |
| flyby / .095 | 1 | missing | M2:13-22 | R2:19; R3:31 | orbit.glb 2,524,292 | Keep S1 active until .10. |
| chase / .135 | 2 | missing | M1:3-9 | R2:19; R3:32 | orbit/cloud assets | Panel 2 must trigger between flyby and chase. |
| wing-traverse / .180 | 2 | missing | M1:3-9 | R2:20; R3:33 | orbit.glb 2,524,292 | Avoid treating this as another panel. |
| payload / .220 | 3 | partial | M1:7; M4:12 | R2:20; R3:34 | orbit.glb 2,524,292 | Restore payload reveal. |
| alignment / .265 | 3 | missing | M1:3-9 | R2:20; R3:35 | orbit.glb 2,524,292 | Restore continuous tangent. |
| corridor / .300 | 3 | missing | M1:3-9 | R2:20; R3:36 | orbit/cloud assets | Keep narrative panel 3 active. |
| departure / .330 | 3 | missing | M1:3-9 | R2:21; R3:37 | orbit/regional transition | Panel 4 starts at .36, not .33. |
| thailand / .360 | 4 | missing | M1:3-9; M4:4 | R2:21; R3:38 | regional.glb 2,195,860 | Recover Thailand focus. |
| multispectral / .390 | 4 | missing | M4:12 only static label | R2:21; interpolate R3:38-39 | regional/field transition | No exact key; interpolation must be tested. |
| regional-tile / .420 | 4 | missing | M1:3-9 | R2:21; interpolate R3:39-40 | regional.glb 2,195,860; regional-landscape.png 1,225,353 | No exact key; maintain geographic registration. |
| descent / .460 | 5 | missing | M1:3-9 | R2:22; R3:40 | clouds.glb 1,453,272; field.glb 8,212,900 | Simulation disclaimer and lazy loading. |
| field-approach / .510 | 5 | missing | M1:3-9 | R2:22; interpolate R3:40-41 | field.glb 8,212,900; field-world.hdr 4,677,061 | No exact key; test interpolation and no blank frame. |
| boundary / .560 | 6 | partial | M4:13 field panel | R2:22; R3:41 | farmland.mesh.json 2,518,079 | Connect 3D boundary to field data. |
| dates-quality / .650 | 7 | partial | M4:13 metadata | R2:23; R3:42 | field panel data; no unique asset | Make insufficient-data state explicit. |
| ndvi / .760 | 8 | partial | M4:13 trend control | R2:23; R3:43 | field panel data; no unique asset | Keep sample-data disclaimer. |
| inspection-limits / .860 | 9 | partial | M4:13,17 notes/fallback | R2:23-24; R3:44 | field panel/fallback | Preserve no-cause-diagnosis limitation. |
| workspace / .950 | 10 | partial | M4:13,17 CTA | R2:23-24; interpolate R3:44-45 | No unique asset; CTA route | Final hold and CTA must remain reachable. |

## Shared asset risk summary

| Asset | Source bytes | Current recovery risk |
|---|---:|---|
| `native-descent/orbit.glb` | 2,524,292 | Required for orbital scenes 1–3; must be lazy/retained by one engine. |
| `native-descent/regional.glb` | 2,195,860 | Required for Thailand/regional scenes 4–5. |
| `native-descent/field.glb` | 8,212,900 | Largest authored payload; highest mobile budget risk. |
| `native-descent/clouds.glb` | 1,453,272 | Shared atmosphere; avoid duplicate loads. |
| `native-descent/field-world.hdr` | 4,677,061 | Environment payload; requires mobile tier/fallback. |
| `farmland.mesh.json` | 2,518,079 | Existing field mesh; registration must remain stable. |
| `scene4-context.mesh.json` | 2,949,364 | Lab/scene-4 recovery candidate; verify whether landing needs it. |
| `scene4-hero.mesh.json` | 2,517,582 | Lab/scene-4 recovery candidate; verify whether landing needs it. |
| `scene4-regional.mesh.json` | 774,811 | Regional recovery candidate; verify whether landing needs it. |
| `textures/earth-clouds.jpg` | 3,570,291 | Must be tiered/reduced for mobile. |

## C acceptance

- Every panel and beat has a non-empty status, source line, asset/recovery source, and risk.
- Missing items point to a concrete recovery commit or asset path.
- The matrix distinguishes the current five-shot public landing from the PR #19 ten-scene candidate.
- D–G must not start until Michael and the independent reviewer agree on this matrix or Bill resolves disagreements.
