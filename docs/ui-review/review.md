# AgriScope Design Review

## Design Language

AgriScope now uses a premium, calm SaaS design language inspired by Apple, Linear, Stripe, Vercel and modern map-first AgriTech products. The interface emphasizes confidence, quiet density, intentional whitespace, soft elevation, and map-first spatial context.

The design goal is commercial trust: a farmer or farm operator should understand that saved fields, map boundaries, and satellite metadata are part of one polished product rather than a plain CRUD interface.

## Color Tokens

The frontend defines AgriScope tokens in `apps/web/app/globals.css`:

- Primary: deep forest green for navigation, primary buttons, and product identity.
- Secondary: natural green for active surfaces and field geometry.
- Satellite: blue for imagery and acquisition metadata.
- Map: muted teal for geographic surfaces.
- Surface: warm off-white and elevated whites for layered UI.
- Border: soft green-gray borders.
- Success, warning, and danger: semantic status colors with soft background pairs.
- Typography: slate/forest ink tokens for strong contrast.

Light mode is fully represented in this package. Dark-mode CSS tokens exist through system preference support, but no product theme switcher is available yet.

## Typography

The hierarchy uses:

- Display: commercial first-impression messaging on authentication.
- Heading: page-level context such as farm detail and workspace titles.
- Title: card and section headings.
- Body: readable operational copy.
- Caption: metadata and helper text.
- Button: bold, concise actions.
- Number/metric: high-confidence quantitative values such as area and cloud cover.

Thai and English text are kept direct and readable. Satellite wording avoids crop-health diagnosis.

## Spacing

The visual system uses a predictable spacing scale:

- `4`
- `8`
- `12`
- `16`
- `24`
- `32`
- `48`
- `64`
- `96`

Dense operational surfaces use smaller gaps; page headers and major sections use wider spacing.

## Component List

Created or redesigned reusable components:

- Button
- Card
- Badge
- MetricCard
- EmptyState
- LoadingBlock
- FormInput
- PageShell
- FieldMap
- SatelliteStatusCard

These components provide the foundation for consistent form, map, metric, and status presentation across the existing FIELD-001 and SATELLITE-001 workflows.

## Responsive Notes

Desktop uses a persistent left navigation rail and spacious content canvas. Mobile uses a compact top navigation and stacked content sections. Forms, metric cards, satellite metadata, and map controls are constrained to avoid overflow on a `390x844` viewport.

Screenshots were generated with desktop `1920x1080`, tablet `1024x768`, and mobile `390x844` viewports. Some PNGs are taller than the viewport because full-page capture is used for long screens.

## Accessibility Notes

The redesign preserves labels on form inputs, visible focus rings, readable contrast, minimum touch targets, text-based state descriptions, and reduced-motion support. Status is not communicated by color alone.

## Known Compromises

- Screenshots cover light theme only because no user-facing theme switcher exists.
- The map uses the existing MapLibre/OpenFreeMap configuration and does not add new map providers.
- This package does not introduce NDVI, overlays, dashboards, alerts, or new product functionality.
- Satellite screenshots use deterministic mocked provider data through the existing E2E boundary, not live Copernicus calls.
- Loading and error screenshots are deterministic component-state captures rendered with the app CSS tokens because those states are intentionally transient in the live local flow.

## Screenshot Inventory

- `screenshots/01-login.png`
- `screenshots/02-register.png`
- `screenshots/03-farm-list.png`
- `screenshots/04-create-farm.png`
- `screenshots/05-farm-detail.png`
- `screenshots/06-draw-field.png`
- `screenshots/07-satellite-card.png`
- `screenshots/08-empty-state.png`
- `screenshots/09-loading.png`
- `screenshots/10-error-state.png`
- `screenshots/11-mobile-login.png`
- `screenshots/12-mobile-farm-list.png`
- `screenshots/13-mobile-farm-detail.png`
- `screenshots/14-mobile-draw-field.png`

## Design Checklist

| Page | Spacing | Typography | Hierarchy | Color | Cards | Buttons | Loading | Empty | Error | Responsive | Accessibility |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Login/Register | PASS | PASS | PASS | PASS | PASS | PASS | N/A | N/A | PASS | PASS | PASS |
| Farm List | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | N/A | PASS | PASS |
| Create Farm | PASS | PASS | PASS | PASS | PASS | PASS | N/A | N/A | PASS | PASS | PASS |
| Farm Detail | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Draw Field | PASS | PASS | PASS | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS |
| Satellite Card | PASS | PASS | PASS | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS |

## Review Decision

This package is ready for external visual review. It does not imply product approval or merge approval by itself.
