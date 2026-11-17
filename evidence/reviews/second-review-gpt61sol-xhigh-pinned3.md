Verdict: Changes required against the contract. Read-only static review; no files modified or tests executed.

Defects

1. High — Panels advance before their contracted boundaries.
   main.js:180 selects panels using s.p − .025, not s.p. At flyby (.095), panel 2 is already active although the contract assigns that beat to panel 1. Panel 4 begins around .335 rather than .36, and workspace begins at .925 rather than .95. This affects narrative, chapter labels, and rail state.
   References: main.js:180,304-317; docs/contracts/homepage-cinematic-v1.md:54,62-68,128.

2. High — Resize can change progress and visibly jump the journey.
   Progress depends on offsetHeight − innerHeight, but the resize handler immediately recomputes it and assigns progress = target. There is no pre-resize progress snapshot, debounce, or scroll re-anchoring. Address-bar height changes can therefore change camera/panel state without intentional scrolling.
   References: main.js:43-45,340-344,370; docs/contracts/homepage-cinematic-v1.md:124.

3. Medium — The 760px breakpoint disagrees between CSS and JavaScript.
   CSS applies mobile layout at ≤760px; JavaScript uses <760px. At exactly 760px, compact narrative is not enabled and chapter-cta stays hidden, while the mobile rule hides field-handoff. The later desktop field-handoff rule has lower specificity and does not restore it.
   References: main.js:179,265-269; cinematic.css:24-32,40.

Other checks and evidence limits

Camera: The shared Hermite tangents support C1 position/target/FOV/roll interpolation by inspection; non-key beats are legitimately interpolated. No interpolation defect identified. The test does not assert roll continuity.
References: timeline.js:62-85; timeline-test.mjs:20-28.

Disclaimers: Ordinary desktop/mobile narrative contains the required meanings. Insufficient-data overrides replace the scene 8/9 narrative disclosures; duplicate disclosures elsewhere, static fallback, and accessible markup cannot be verified from the supplied files.
References: timeline.js:8,11-12; main.js:31-41,304-310; cinematic.css:32.

Validation terminology: The contract correctly separates 10 panels, 19 beats, and 17 camera keys. Baseline “28 boundaries” is five-shot baseline evidence, not recovery coverage. The exported test enumerates 64 boundary/aspect cases; that is not an execution result.
References: docs/contracts/homepage-cinematic-v1.md:82,151; evidence/baseline-main-20261116/timeline.log:1-3; timeline-test.mjs:8,20-31.

session_id: 20261117_143806_0225ab
