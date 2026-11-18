# Farmer homepage contract v2

Status: CONTRACT_READY
Date: 2026-11-18
Owner boundary: public homepage journey only

## Product job

The homepage gives a first-time farmer a truthful, memorable explanation of how
AgriScope uses satellite observations to help decide where to inspect first. It
must move the visitor from orbital imagery to a concrete field-monitoring start
without implying that imagery alone explains the cause of a change.

The journey is scroll-led and may use authored cinematic presentation. It has no
required audio track and must not depend on audio or a mute control. Scene or beat
count is an implementation detail, not an acceptance criterion.

EDOLUS is a reference for cinematography and pacing only. It supplies no copied
assets, brand language, interaction contract, or visual-equivalence requirement.

## Required user-understanding outcomes

After completing the journey, a visitor can explain all five statements below in
plain language:

1. Satellite observations read reflected red and infrared light from the Earth's
   surface. The homepage may simplify the explanation, but must not present the
   measurement as a photograph or direct diagnosis.
2. Looking at the same place on different dates lets the user see that the
   observed signal changed over time. The journey must establish same-place,
   different-date comparison rather than showing unrelated imagery.
3. The user can select a point or field on a map and read an NDVI value with its
   observation date and quality/context. The map interaction may hand off to the
   application, but the path from homepage to that workflow must be explicit.
4. A lower NDVI or other lower observed value does not establish the cause of the
   change. The experience must state this limitation near the interpretation or
   comparison moment, not hide it only in legal copy.
5. The next useful action is to start field monitoring. A visible CTA continues
   into the existing monitoring or registration flow; it must not claim that the
   homepage has diagnosed a problem.

## Contracted journey

The implementation may choose its own number of sections, checkpoints, and
transitions. It must provide these stages in an understandable order:

- Establish the satellite observation: red/infrared reflected light and the idea
  of a measured signal.
- Hold the location constant while dates or observations change, making change
  over time legible.
- Introduce a map and make point/field selection the user's first concrete
  interaction or an obvious continuation into the app.
- Show an NDVI reading with date and quality/context, using clearly labelled
  demonstration data when the public route is not backed by a live request.
- Explain the non-diagnosis boundary: a lower value indicates an observed change,
  not its cause and not a treatment recommendation.
- End with a field-monitoring CTA that preserves the existing auth and route
  behavior.

Forward scrolling, reverse scrolling, direct navigation, reduced-motion mode,
small screens, failed rendering, and JavaScript-disabled fallback must preserve
those meanings and the CTA. Decorative motion must not be required to understand
the product job.

## Implementation groups

These groups describe the implementation boundary and its observable guarantees.
They do not prescribe a scene count, a particular camera path, or a specific
rendering library beyond the existing local boundary.

### Choreography

- Derive visual and narrative state from normalized journey progress, not from
  one-way event history. Seeking, reverse scrolling, anchor navigation, reload
  entry, and viewport changes must converge on the same state for the same
  progress.
- Use deliberate holds and legible transitions so the five outcomes remain
  understandable without motion. The current runtime may expose five orbital
  checkpoints, but that is not a product requirement and may change.
- Keep the field handoff late enough that the observation explanation and
  non-diagnosis boundary are read before the CTA. The handoff must remain
  reachable by keyboard and direct anchor navigation.
- Keep decorative spacecraft, stars, clouds, and camera motion subordinate to
  the copy and field data. Do not use motion, audio, or hidden hover behavior as
  the only carrier of meaning.

### Renderer and lifecycle

- The public route owns one mounted cinematic instance at a time. The instance
  owns its listeners, animation frame, renderer, loaded resources, and cleanup;
  navigation or remount must release them.
- Runtime assets are local and static. The public journey makes no provider,
  tenant, observation, or authenticated API request and never exposes private
  field data.
- WebGL, module, asset, and context-loss failures transition to the same readable
  static explanation rather than leaving an empty stage or a broken CTA.
- Reduced-motion preference bypasses GPU creation or otherwise presents the
  static journey without requiring a canvas. A user-visible control may resume
  3D only if the static explanation and CTA remain complete.

### Scene state and interaction

- Scene state is a pure function of progress plus viewport dimensions; it must
  not encode a separate irreversible forward-only state machine.
- The first concrete interaction is a visible point/field selection path or an
  explicit handoff into the authenticated map workflow. The public sample may
  use a static field card and illustrative trend rather than a live map.
- Controls have semantic names and state: rail/checkpoint controls expose the
  current location, the sample trend exposes expanded/collapsed state, and the
  CTA is a real link.
- Demonstration values, dates, labels, and quality/context must stay visibly
  marked as illustrative. They are not user evidence and must not be sent to or
  read from the API.

### Thai copy and safety language

- Primary explanatory, fallback, and CTA copy is readable Thai. English may be
  used for technical labels such as Sentinel-2, NDVI, or an asset/debug label,
  but English-only copy is not an acceptable fallback.
- Copy must explain reflected red and near-infrared light, repeated observation
  of the same place, NDVI as an observed signal, and date/quality context in
  direct non-diagnostic language.
- Place the limitation beside the sample interpretation: a changed or lower
  value is an observed signal and does not identify disease, pests, nutrients,
  flooding, cause, treatment, or urgency. Never prescribe chemicals or a field
  action from the homepage.
- Keep the synthetic sample identity and disclosure together, for example
  `FIELD A–204 / ข้อมูลสาธิต`, with date, cloud/quality context, and the
  non-diagnostic note visible in the same reachable journey.

### CTA and handoff

- The primary terminal action is a visible field-monitoring CTA such as
  `เริ่มติดตามแปลงของคุณ`. It must be a normal navigable link and must remain
  available in WebGL, reduced-motion, renderer-failure, and no-JavaScript modes.
- The CTA hands off to the existing login/registration behavior. This slice does
  not add routes, alter authentication, or create an authenticated field.
- The CTA must not say that a field has been diagnosed, that an alert is certain,
  or that a cause has been found. Its promise is to continue into monitoring.
- Any secondary login or chapter navigation must not obscure, replace, or make
  the terminal CTA unreachable on a narrow viewport.

### Fallback and accessibility

- Server-rendered/static markup contains the journey explanation, sample values,
  safety disclosure, and CTA before JavaScript succeeds. JavaScript-disabled
  users must be able to read and follow it.
- `prefers-reduced-motion: reduce` presents the readable static mode without
  creating a WebGL canvas. Module failure, missing asset, and context loss use
  an announced reason while preserving the same content.
- Provide a skip link to the readable sample, landmarks/headings, named links,
  keyboard-operable controls, visible focus, and truthful `aria-current`,
  `aria-expanded`, or equivalent state. Decorative canvas and ornaments are
  hidden from assistive technology.
- Keep text and CTA within the viewport at desktop and narrow mobile sizes. No
  horizontal overflow, clipped safety copy, or focus target hidden behind the
  sticky stage is acceptable.

### Fixtures and validation hooks

- Static fixtures are synthetic and stable: the sample field identity, area,
  NDVI, dates, cloud/quality context, trend values, and Thai safety copy are
  checked as contract content. Fixtures must not be mistaken for backend data.
- Runtime diagnostics used by browser tests may expose readiness, mode, progress,
  viewport, and renderer health under an explicit QA path only; they must not
  expose tenant identifiers, credentials, or provider responses.
- Browser fixtures cover desktop and narrow mobile, forward and reverse seeks,
  direct hash/shot entry, reduced motion, module failure, context/fallback, and
  JavaScript-disabled markup. Contract checks also verify no public cinematic API
  requests and no inactive historical asset graph is loaded by the active route.
- Validation must include affected web typecheck/build plus real-browser checks
  for readable outcomes, CTA reachability, no overflow, and fallback parity.

### Asset provenance

- Every bundled visual asset has a source-bound record in
  `tools/cinematic/references/static-asset-board.json` and the applicable
  `apps/web/public/cinematic/CREDITS.md`, including local path, source identity,
  intended use, transformation, license/usage note, byte length where tracked,
  and SHA-256 where source verification is required.
- Runtime assets are original, generated, or appropriately licensed local inputs.
  EDOLUS screenshots and other third-party references remain review guidance
  only; their pixels are not incorporated into runtime or Blender assets.
- Asset loaders verify the recorded bytes before parsing source-bound payloads.
  An absent, changed, or unverified required asset must take the readable
  fallback path instead of silently substituting unrelated content.
- Historical authoring artifacts may remain in the repository for inspection,
  but the active public entry graph must load only the assets required by the
  current implementation and must not make their presence a product contract.

## Data and safety boundary

Public cinematic content must not make live provider requests, expose tenant data,
or imply that fictional values are a user's field evidence. If values are
illustrative, label them as demonstration content. Any real NDVI value shown in a
product workflow remains subject to the server-authoritative quality and
assessability rules.

The homepage must not diagnose disease, pests, nutrient deficiency, flooding, or
any other cause from satellite data. It must not prescribe chemicals or direct a
field action as if a cause were established. The map/NDVI handoff is educational
and navigational; authenticated product routes own permissions, tenant scope,
quality policy, and analysis semantics.

## Acceptance criteria

A reviewer can verify the following from the built public route and its fallback:

- All five required user-understanding outcomes are represented by readable copy,
  labels, or interaction evidence; each can be reached without audio.
- The same location is visibly or textually compared across at least two dates.
- A map point/field selection path and NDVI/date/quality readout are present or
  hand off clearly to the existing application workflow.
- The non-diagnosis statement is adjacent to the interpretation/comparison step.
- The final CTA starts the existing field-monitoring or registration journey.
- No fixed scene count, audio, mute control, copied EDOLUS asset, or visual
  equivalence claim is treated as a requirement.
- Choreography and scene state remain deterministic under forward/reverse and
  direct-entry navigation; renderer cleanup leaves no duplicate canvas or stale
  listeners after unmount.
- Thai copy, demo disclosures, safety language, landmarks, focus behavior, and
  fallback content remain readable and operable without WebGL or JavaScript.
- Desktop and mobile layouts retain readable content, no page overflow, and a
  reachable CTA. Reduced motion and renderer/module failure retain the same
  product explanation in a readable fallback.
- Fixtures are explicitly synthetic, active assets are source-bound, and asset
  provenance/credits are present for every bundled visual input.
- Existing authentication, tenant, API, and geospatial contracts are unchanged.

## Out of scope

- Replacing the authenticated map, observation, or NDVI workflows.
- Adding provider/API/database calls to the public cinematic route.
- Choosing a new agronomic threshold, diagnosis rule, treatment, or alert policy.
- Requiring a particular number of scenes, beats, camera moves, or authored asset
  formats.
- Reproducing EDOLUS or claiming artistic equivalence to it.
- Production deployment, credential changes, or merge to `main`.

## Validation receipt expected for delivery

The implementation handoff should name the exact changed paths and record:

- static/contract checks proving all five outcomes, Thai copy, CTA, and safety
  wording;
- production build or typecheck for affected web code;
- real-browser checks at desktop and narrow mobile sizes for forward/reverse or
  direct-entry behavior, reduced motion, fallback, and CTA reachability;
- fixture and renderer checks proving no duplicate canvas, stale listener, public
  API request, or inactive asset graph in the active route;
- asset-board/credits verification for changed or newly bundled visual inputs;
- confirmation that no backend, tenant, authentication, or geospatial contract
  changed.
