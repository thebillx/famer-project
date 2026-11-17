Verdict: changes required. The contract faithfully copies the authored timeline data, but it does not faithfully describe the source’s actual panel activation timing. The historical implementation also fails the contract’s new viewport-stability requirement. Current-main validation is valid baseline evidence, not ten-panel recovery evidence.

Scope
  Reviewed the contract in /Users/bill/farmer-contract-worktree, the three requested files at a118c28140d513334263747cd3cefb5455d0eb51, current-main tests at 60231628548091d9aed51237a413377a2bea23e9, and /Users/bill/farmer-main-baseline/evidence/baseline-main-20261116/.
  No prior reviewer findings consulted. No files modified.

Defects

1. HIGH — Contracted panel timing and flyby mapping differ from actual source behavior.

   References:
     docs/contracts/homepage-cinematic-v1.md:43–54, 62
     apps/web/public/cinematic/main.js@a118c28:180, 304–313

   Evidence:
     The contract says panel 2 begins at .10 and flyby (.095) belongs to panel 1. Runtime selects panels using p >= s.p - .025, not p >= s.p.

     Executing that selection against the source arrays gives actual panel starts:
       0, .075, .195, .335, .435, .535, .625, .735, .835, .925

     At flyby (.095), runtime therefore displays panel 2. Every panel after the first starts .025 earlier than its contracted checkpoint.

   Impact:
     The contract’s mapping is internally coherent as a desired recovery specification, but it is not an exact account of historical rendered behavior. Restoring exact thresholds would be an intentional correction, which should be identified explicitly rather than presented as unchanged source behavior.

2. HIGH — Historical resize handling does not satisfy the iOS progress-stability requirement.

   References:
     docs/contracts/homepage-cinematic-v1.md:117–124
     apps/web/public/cinematic/main.js@a118c28:43–45, 340–343, 370
     apps/web/components/cinematic/cinematic.css@a118c28:4, 17

   Evidence:
     Layout uses stable svh heights, but the progress denominator subtracts live innerHeight. On resize, the handler immediately recalculates progress and applies it. There is no progress snapshot, debounce, or scroll re-anchoring.

     A numerical reproduction using a stable mobile journey height of 4002px:
       scrollY: 1534.1px
       innerHeight 667px: p = .460000
       innerHeight 744px: p = .470872

     Camera framing also depends on innerWidth/innerHeight.

   Impact:
     Address-bar viewport changes can alter progress and camera framing without an intentional journey advance. The contract correctly requires a fix, but the historical source cannot be accepted as already satisfying it. This is source-level evidence of the mechanism, not a physical-iPhone reproduction.

3. MEDIUM — Mobile rendering does not preserve all quoted disclaimer strings.

   References:
     docs/contracts/homepage-cinematic-v1.md:143–147
     apps/web/public/cinematic/main.js@a118c28:31, 34–35, 308–310
     apps/web/components/cinematic/cinematic.css@a118c28:19, 32

   Evidence:
     Desktop SHOTS contain the contracted strings. Mobile rendering replaces their descriptions:
       Scene 8: “ค่า NDVI ตัวอย่างต่างวันที่ · ข้อมูลจำลอง”
       Scene 9: “ค่า NDVI ลดลง แต่ข้อมูลดาวเทียมยังไม่บอกสาเหตุ”

     These retain the broad sample-data and causal-limitation meanings, but not the exact quoted statements required by the contract. Mobile CSS also hides .demo-label and the field panel’s .note, so those cannot be assumed to supply redundant visible disclosure.

   Impact:
     Literal disclaimer preservation is not established across responsive layouts. The contract should distinguish mandatory verbatim wording from acceptable semantic equivalents. Static fallback and the separate accessible narrative cannot be verified from the supplied files; their markup is outside this review scope.

4. MEDIUM — Current-main timeline tests cannot validate the recovery’s acceptance criteria.

   References:
     tests/cinematic/timeline.mjs:5–15, 28–39, 52–65
     docs/contracts/homepage-cinematic-v1.md:151
     evidence/baseline-main-20261116/timeline.log:1–4

   Evidence:
     The test explicitly requires five shots, their old copy/checkpoints, a fixed spacecraft pose, and late payload deployment. It does not import BEATS or test the ten-panel mapping, resize stability, or rendered disclaimers. Its continuity assertions cover position, target, and FOV, but not roll.

     I ran the baseline test successfully; its output matches the saved evidence.

   Impact:
     This is a recovery-validation gap, not a defect in the baseline test’s stated five-shot purpose. Its PASS result must not be used to certify the ten-panel contract.

Verified without defects

  • The contract’s SHOTS and BEATS excerpt matches source, ignoring formatting whitespace: exactly 10 panels and 19 beats.
  • All 17 camera-key rows match source exactly.
  • The four beats without exact camera keys are correctly identified: multispectral, regional-tile, field-approach, workspace.
  • Source uses shared Hermite interpolation for position, target, FOV, and roll, followed by aspect-aware adjustments. Numerical derivative checks at interior keys found no discontinuity at the tested precision.
  • Landing heights are correctly distinguished: 750svh desktop, 600svh mobile; lab heights are separate.
  • “28 position/focus/FOV boundaries” is correctly explained as repeated checkpoint coverage across four aspects, not a count of beats or unique keys.
  • Final narrative timing needs the same correction as defect 1: historical runtime starts panel 10 at .925, not the contracted .95. The camera continues interpolating toward its terminal key; “hold” should not be interpreted as a stationary camera.

The baseline logs establish a successful build, typecheck, and five-shot timeline run. They do not establish browser-level scroll behavior, physical iOS stability, or fallback/accessibility disclaimer coverage.

session_id: 20261117_135719_cc9467
