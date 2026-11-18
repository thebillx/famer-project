# Homepage pilot audit

Date: 2026-11-18
Scope: the separate pilot field-observation slice only

## Contract supplied by T1/T2

The implementation carries forward these supplied outcome requirements:

- The public journey is scroll-led and has no audio dependency.
- The visitor is shown reflected red and near-infrared light (`RED + NIR`).
- The visitor can understand a stable selected point/field and compare that same point on two dates.
- The readout includes NDVI, observation date, and image-quality context.
- The copy explicitly says a changed satellite signal does not establish a cause and is not a disease diagnosis.
- The public journey hands off to the existing `/login` flow.
- Reduced-motion, JavaScript-disabled, and renderer-failure paths preserve the meaning in readable fallback content.
- The values are synthetic demonstration content, not provider or tenant data.

No backend, authentication, tenant, geospatial formula, alert, treatment, or production behavior is part of this pilot.

## Inferred content values

These values were selected for illustrative content because T1/T2 supplied the outcome, not a production dataset or a mandated sample record:

- Location label: `FIELD A–204` and `จ.สุพรรณบุรี`.
- Area: `18.4 ไร่`.
- Recent observation: `14 ก.พ. 2569`, NDVI `0.71`, quality `ดี`, cloud cover `3.2%`.
- Comparison observation: `28 ม.ค. 2569`, NDVI `0.64`, quality `ดี`, cloud cover `2.1%`.
- Comparison sentence: `จุดเดิม · คนละวัน: 0.64 → 0.71`.
- Signal labels: `RED + NIR`, `แสงสะท้อนที่อ่านได้`.
- Synthetic trend bars: `0.58`, `0.64`, `0.71`.
- Thai headings, labels, fallback prose, and CTA wording used to express the supplied outcome in the existing visual language.

No agronomic threshold or interpretation was inferred from these numbers.

## Inferred presentation values

The following are implementation choices, not product policy or agronomic claims:

- Existing handoff timing is used: the panel begins at progress `0.88`, reaches full opacity at `0.95`, and remains through the final hold at `1.0`.
- No new scroll checkpoint, camera beat, audio timeline, autoplay, mute control, or audio state was introduced.
- Desktop field panel width is `350px`, with `26px` padding, `right: 7%`, and `top: 23%`.
- Mobile field panel uses `7%` left/right margins, `top: 184px`, `20px` padding, and `max-height: calc(100svh - 242px)`; short mobile uses `16px` padding and reduced metric padding.
- Tall tablet/portrait desktop uses `330px` width and `right: 6%`; short desktop uses `top: 115px` and `max-height: calc(100svh - 185px)`.
- The synthetic map card is `105px` high, with `12px` vertical margin and a one-pixel border.
- The map point is centered at `50%`/`48%`, has a `44px` activation target, and toggles only `aria-pressed`; selection does not change data.
- The map field shape is positioned at `left: 28%`, `top: 18%`, `width: 42%`, `height: 62%`, rotated `-12deg`; these are purely decorative geometry values.
- Date controls have `36px` minimum height, `4px 7px` padding, and start on `14 ก.พ. 2569`; selecting a date updates date, NDVI, quality, and `aria-pressed` in place.
- The comparison note remains fixed after date selection so the same-location relationship is always visible.
- The trend control and map point use `44px` minimum/activation targets to preserve keyboard and touch access.
- The field handoff uses `14px 16px` padding, `14px` vertical margin, and a `44px` minimum height.
- The panel uses the existing dark cinematic surface and gold signal/selection treatment. Pilot-specific colors include the synthetic map gradients, gold point, and muted borders; no new asset was added.
- The fallback repeats the three explanatory steps, synthetic sample, safety boundary, and `/login` handoff but intentionally does not emulate map interaction.

## Behavior and fallback audit

- Date selection is local DOM state only; it makes no network request.
- Map-point activation is local accessibility state only; it does not imply a different field or observation.
- The existing trend disclosure remains available and was expanded during validation.
- The implementation contains no `audio` or `video` element and does not require sound for comprehension.
- The journey remains scroll-driven; the handoff is reached by scrolling/QA seeking, not by a timer.
- Reduced-motion, static, and renderer/module failure paths retain the outcome meaning in text.
- The safety boundary is adjacent to the metric readout and is repeated in fallback copy.

## Evidence and limitations

Validation record: `docs/product/homepage-pilot-validation.md`.

Captured screenshots, exact viewport sizes, and hashes:

- `test-results/cinematic/pilot-scene-375x667.png` — 375×667 — SHA-256 `8d1600a5e340ef065227a85979ddb99722a93b4ea62e61aba8769ba05c4cbd44`
- `test-results/cinematic/pilot-scene-390x844.png` — 390×844 — SHA-256 `280e310ddb7cdfd6269ee793d7388045060416ff8c091e02d210ba0b704e6b80`
- `test-results/cinematic/pilot-scene-1440x900.png` — 1440×900 — SHA-256 `9b53a0e7082aead6cd2f4bfbacbfe4498628327afc9791d86a88f9c356bd4441`

Live validation found matching viewport width, no horizontal overflow, no audio/video elements, the field handoff, the required readout, and successful trend expansion at all three viewports. It used the dependency-equipped pilot worktree's local Next server, headless Chrome, and SwiftShader WebGL because this audit worktree has no `node_modules`; the repository Playwright browser cache was also absent. No source fix was needed during validation.

## Scope boundary

Only the pilot implementation, its focused test changes, audit/evidence records, validation record, and the three screenshots belong in this branch. No main merge has occurred. This branch must not be merged until the owner approves the separate PR and its CI/review gates.
