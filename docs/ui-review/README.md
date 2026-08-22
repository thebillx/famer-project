# AgriScope UI Review Package

This folder contains visual evidence for the `feature/ui-system-001` frontend redesign. It is intended for external design review before the branch is approved or merged.

## Screens

Screenshots are generated from the running application with Playwright and deterministic test data:

- Login and register
- Farm list
- Create farm
- Farm detail with saved field
- Draw field
- Satellite metadata card
- Empty state
- Loading state
- Error state
- Mobile login
- Mobile farm list
- Mobile farm detail
- Mobile draw field

## Viewport Sizes

- Desktop: `1920x1080`
- Tablet: `1024x768`
- Mobile: `390x844`

Screens are captured with these viewport sizes. Longer pages may produce taller full-page PNGs so reviewers can inspect content below the fold.

## Theme

The current screenshots cover the light theme. Dark mode is intentionally disabled until every component and state has dedicated contrast coverage and a user-facing theme switcher is part of the product surface.

## Interaction States

The package captures:

- Initial authentication states
- Empty farm list state
- Loading state
- Error state
- Farm creation flow
- Field drawing state
- Persisted field display
- Satellite acquisition metadata state
- Mobile responsive layouts

The loading and error screenshots are deterministic component-state captures rendered with the application CSS tokens. They are included for visual review of state design and do not add routes or product functionality.

## Review Checklist

For every reviewed page, inspect:

- Spacing
- Typography
- Visual hierarchy
- Color use
- Card structure
- Button hierarchy
- Loading state
- Empty state
- Error state
- Responsive behavior
- Accessibility cues

## Screenshot Files

All generated screenshots are stored in `docs/ui-review/screenshots/`.
