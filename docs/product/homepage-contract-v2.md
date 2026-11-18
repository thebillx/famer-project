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
- Desktop and mobile layouts retain readable content, no page overflow, and a
  reachable CTA. Reduced motion and renderer/module failure retain the same
  product explanation in a readable fallback.
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

- static/contract checks proving all five outcomes and the safety wording;
- production build or typecheck for affected web code;
- real-browser checks at desktop and narrow mobile sizes for forward/reverse or
  direct-entry behavior, reduced motion, fallback, and CTA reachability;
- confirmation that no backend, tenant, authentication, or geospatial contract
  changed.
