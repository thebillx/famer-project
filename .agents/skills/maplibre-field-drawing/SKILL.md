---
name: maplibre-field-drawing
description: Implement AgriScope field-boundary drawing UX with MapLibre, polygon editing, GeoJSON serialization, validation feedback, mobile behavior, and backend source-of-truth geometry validation.
---

# maplibre-field-drawing

## Purpose

Guide map-based field drawing and editing flows without moving authoritative geospatial validation into the browser.

## When to use

- Drawing, editing, deleting, previewing, or serializing farm-field polygons.
- Implementing map loading, offline, or error states.
- Designing mobile and keyboard interaction for map drawing.

## When not to use

- Backend-only geometry validation.
- Satellite processing.
- Bootstrap-only work where application code is prohibited.

## Required inputs

- Task brief.
- Backend geometry contract.
- Basemap provider constraints.
- File ownership.

## Preconditions

- API contract defines GeoJSON schema, validation errors, and area response.
- Backend is source of truth for geometry validation and area.
- Map assets and provider keys are handled through approved configuration.

## Procedure

1. Initialize MapLibre only in client-side code.
2. Use a basemap provider abstraction rather than hardcoded provider calls.
3. Support draw polygon.
4. Support edit vertices.
5. Support delete polygon.
6. Support undo and redo for drawing actions.
7. Show geometry preview before save.
8. Serialize geometry as GeoJSON with correct coordinate order.
9. Display polygon validation feedback from frontend checks and backend response.
10. Display self-intersection feedback.
11. Display area from backend response; browser area is preview only.
12. Support mobile gestures without trapping scroll unexpectedly.
13. Provide keyboard-accessible alternatives for critical actions.
14. Show map loading, offline, and provider error states.
15. Add tests required by the task brief.

## Expected outputs

- Field drawing UI behavior.
- GeoJSON payload aligned with backend contract.
- Validation and area display states.
- Handoff report.

## Validation

- Polygon save uses backend validation.
- Invalid geometries produce actionable feedback.
- Area shown as authoritative only after backend response.
- Mobile and keyboard paths are covered.
- No secrets are exposed in map client code.

## Failure handling

- If basemap fails, show recoverable offline/error state.
- If backend rejects geometry, preserve user edits and show field-level feedback.
- If browser lacks required APIs, degrade to non-destructive error state.

## Security considerations

- Do not expose provider secrets.
- Do not trust browser-computed geometry for authorization or billing.
- Do not bypass organization scope in save requests.

## Handoff requirements

Report geometry schema used, validation behavior, UI states, accessibility checks, and backend contract dependencies.

## Prohibited actions

- Do not calculate authoritative area only in the browser.
- Do not save geometry without backend validation.
- Do not hardcode organization IDs.
- Do not install map dependencies during bootstrap.

## References

- `AGENTS.md`
- `.agents/skills/postgis-field-geometry/SKILL.md`
- `.agents/workflows/contract-first.md`
- MapLibre GL JS documentation as reference.
