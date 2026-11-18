# Homepage pilot narrative evidence

Status: IMPLEMENTED on 18 November 2026
Scope: one public, synthetic field-observation moment inside the scroll-led homepage journey

## Outcome path

The pilot moment presents one stable demonstration location (`FIELD A–204`, Suphan Buri) and lets the visitor:

1. read that the satellite signal uses reflected red and near-infrared light (`RED + NIR`);
2. see the same selected map point on two dates;
3. read NDVI, observation date, and image quality/context;
4. read the adjacent boundary that a changed signal does not establish a cause or diagnose disease; and
5. continue through the existing `/login` field-monitoring CTA.

The reduced-motion and renderer-failure fallback repeats the same meaning in readable text without requiring WebGL or audio.

## Values inferred for this pilot

These values are illustrative UI content, not provider data and not tenant data:

- Location label: `FIELD A–204` / `จ.สุพรรณบุรี`
- Area: `18.4 ไร่`
- Recent observation: `14 ก.พ. 2569`, NDVI `0.71`, quality `ดี`, cloud cover `3.2%`
- Comparison observation: `28 ม.ค. 2569`, NDVI `0.64`, quality `ดี`, cloud cover `2.1%`
- Signal labels: `RED + NIR`
- Comparison wording: `จุดเดิม · คนละวัน: 0.64 → 0.71`

No agronomic threshold, diagnosis, treatment, alert, live provider request, or authenticated field interpretation was inferred or added.

## Implementation decisions not specified by T1/T2

The following presentation and interaction values were selected for this pilot;
they are not product or agronomic policy:

- The pilot is revealed at the existing handoff progress (`p=0.88` to `p=0.95`)
  and remains available through the final hold at `p=1.0`; no new scroll
  checkpoint or audio timeline was introduced.
- The synthetic map card is `105px` high on wide layouts and uses a `44px`
  keyboard/touch target for the centered point. The point starts selected and
  toggles `aria-pressed` on activation; its selection does not change data.
- The two date controls use `36px` minimum height, start on `14 ก.พ. 2569`,
  and update the date, NDVI, and quality fields in place. The comparison note
  stays fixed so the same-location relationship remains visible after either
  date is selected.
- The field card uses the existing `350px` wide desktop panel and the existing
  mobile `7%` side margins; its mobile max-height is `calc(100svh - 242px)`
  with internal vertical scrolling. These values were chosen to keep the CTA
  reachable at the requested viewport sizes.
- The inferred visual treatment is the existing dark cinematic surface with
  gold signal/selection accents; no new asset, animation, sound, or provider
  request was added.
- Reduced motion, JavaScript-disabled markup, and module/render failure use the
  existing static fallback. The fallback repeats the three explanatory steps,
  synthetic sample disclosure, safety boundary, and `/login` CTA; it does not
  attempt to emulate the map interaction.
- The pilot deliberately has no audio element, autoplay behavior, mute control,
  or audio-dependent state. Scrolling and date selection are the only required
  interaction paths.

## Capture matrix

The requested evidence viewports are:

- `375 × 667` small mobile
- `390 × 844` mobile
- `1440 × 900` desktop

Browser evidence captured on 18 November 2026 from the local Next server with headless Chrome, SwiftShader WebGL, and the QA seek point `p=0.95` (field handoff state). The three PNGs are stored as task artifacts:

- `375x667.png` — SHA-256 `8d1600a5e340ef065227a85979ddb99722a93b4ea62e61aba8769ba05c4cbd44`
- `390x844.png` — SHA-256 `280e310ddb7cdfd6269ee793d7388045060416ff8c091e02d210ba0b704e6b80`
- `1440x900.png` — SHA-256 `9b53a0e7082aead6cd2f4bfbacbfe4498628327afc9791d86a88f9c356bd4441`

The capture exercised the WebGL runtime at all three viewports with no page or console errors. The repository Playwright Test runner remains unable to launch its bundled browser because the Playwright browser cache is absent; the capture used the installed Chrome channel directly.
