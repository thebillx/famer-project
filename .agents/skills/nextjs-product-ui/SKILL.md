---
name: nextjs-product-ui
description: Build AgriScope frontend slices with Next.js, React, TypeScript strict mode, accessible UX states, contract-first API integration, and no frontend secrets.
---

# nextjs-product-ui

## Purpose

Guide frontend product implementation for assigned AgriScope vertical slices.

## When to use

- Creating or changing frontend screens, components, forms, or API integration.
- Defining frontend behavior for loading, empty, error, permission, stale-data, or partial-data states.
- Writing frontend tests for assigned slices.

## When not to use

- Backend-only, database-only, or satellite-provider tasks.
- Bootstrap-only tasks where application code is prohibited.
- Contract definition that has no frontend surface yet.

## Required inputs

- Task brief.
- API contract.
- UX copy requirements in Thai and English when relevant.
- File ownership assignment.

## Preconditions

- Contract status is `CONTRACT_READY`.
- File ownership is assigned.
- Existing app architecture, routing, tokens, and test setup have been inspected.

## Procedure

1. Follow existing Next.js architecture and routing.
2. Keep TypeScript strict-compatible and avoid `any` unless justified.
3. Respect Server Component and Client Component boundaries.
4. Put browser-only state, form handlers, and MapLibre usage behind client boundaries.
5. Use typed API clients generated from or aligned with the contract.
6. Use TanStack Query patterns for server state when available.
7. Use React Hook Form and Zod patterns when available.
8. Build accessible components with labels, focus states, keyboard behavior, and ARIA only where needed.
9. Use design tokens rather than raw one-off visual values.
10. Support internationalization for user-visible copy where the project requires it.
11. Implement responsive mobile-first layouts.
12. Implement loading, empty, error, permission, partial-data, and stale-data states.
13. Add or update component, integration, and E2E tests required by the task brief.
14. Produce a handoff report.

## Expected outputs

- Frontend implementation matching contract.
- UI state coverage.
- Updated tests.
- Handoff report.

## Validation

- Type check passes.
- Relevant frontend tests pass.
- Keyboard navigation works.
- Status is not communicated by color alone.
- API errors render useful recovery paths.
- No backend data or organization IDs are hardcoded.

## Failure handling

- If the backend contract is incomplete, stop and return to orchestrator.
- If design tokens or component primitives are missing, propose minimal additions.
- If tests cannot run, record the command and failure reason.

## Security considerations

- Never store secrets in frontend code.
- Never call Copernicus or other secret-bearing services directly from browser code.
- Do not store long-lived tokens in `localStorage`.
- Treat all route params and form inputs as untrusted.

## Handoff requirements

Report files changed, commands executed, tests, UI states covered, accessibility checks, assumptions, risks, and next agent.

## Prohibited actions

- Do not install packages during bootstrap.
- Do not create a Next.js app during bootstrap.
- Do not change backend contracts silently.
- Do not report mock API integration as production complete.

## References

- `AGENTS.md`
- `.agents/workflows/delivery.md`
- `.agents/templates/handoff-report.md`
- Next.js, React, TanStack Query, React Hook Form, Zod, and WCAG documentation as project references.
