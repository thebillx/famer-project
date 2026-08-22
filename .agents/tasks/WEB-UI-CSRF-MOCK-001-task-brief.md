# Task Brief

## Task ID

WEB-UI-CSRF-MOCK-001

## Status

IN_REVIEW

## Title

Align the existing login UI regression mock with the verified CSRF bootstrap flow

## Business goal

Keep the existing login pending, duplicate-submit, accessibility, and safe-error UI regression meaningful after WEB-SEC requires every unsafe browser request to bootstrap CSRF first, without changing product behavior or weakening the browser-security contract.

## Dependency and activation gate

- The WEB-SEC browser client bytes are stable on merged `main`: PR #2 delivered the
  CSRF bootstrap flow and PR #3 fixed the shared-refresh race at merge commit
  `7fcef1f9d487dac05758b7f03cb340615c271692`.
- Current focused browser-security validation and REAL-STACK-001 validation pass
  against those merged bytes. This task consumes that fixed request sequence only;
  it does not change or reinterpret it.
- `apps/web/lib/api.ts` and `tests/e2e/web-security.spec.ts` remain read-only, so
  their legacy task ownership need not transfer for this exact one-file mock
  correction. Any required edit to either path stops and returns to WEB-SEC.

## Expected behavior

- Before a valid login submission, the UI sends no API request.
- One login submission sends exactly `GET /api/v1/auth/csrf`, then exactly one `POST /api/v1/auth/login` carrying the fixed mocked `X-CSRF-Token` value.
- A forced duplicate submit while the first request is pending sends neither another CSRF request nor another login request.
- An `invalid_credentials` response does not trigger refresh, replay, or any other request.
- The existing loading, disabled, `aria-busy`, generic Thai error, sensitive-message non-rendering, and mode-change clearing assertions remain intact.

## Validation outcome

- The focused pending/duplicate-submit login test passes 1/1.
- The complete `ui-system.spec.ts` suite passes 13/13.
- The combined serialized `ui-system.spec.ts` and `web-security.spec.ts` suites pass
  29/29, including all shared-refresh and recovery-budget cases.
- TypeScript validation and `git diff --check` pass.
- The first full UI run exposed a test-only scheduling race: the assertion could
  read `loginCalls` after CSRF completed but before the pending login reached the
  route handler. Waiting for the first POST to become pending before forcing the
  duplicate submit made the intended invariant deterministic without changing
  product behavior.

## Contracts

- Production endpoint behavior: unchanged.
- Test-owned CSRF response: `{ "csrf_token": "csrf-ui-fixture" }` or another fixed non-secret fixture value.
- Login request assertion: exact `POST` method and exact fixture token in `X-CSRF-Token`.
- Unexpected request behavior: preserve fail-closed mock response.
- API, schema, permission, organization scope, idempotency, and product UI behavior: unchanged.

## File ownership

- Orchestrator only:
  - `.agents/tasks/WEB-UI-CSRF-MOCK-001-task-brief.md`
- Single implementation owner after activation:
  - `tests/e2e/ui-system.spec.ts`
- Read-only and byte-stable:
  - `apps/web/lib/api.ts`
  - `apps/web/app/login/page.tsx`
  - `tests/e2e/web-security.spec.ts`
  - `apps/web/playwright.config.ts`
  - `.agents/tasks/WEB-SEC-CONTRACT-001-task-brief.md`
- All backend, OpenAPI, product source, package, lockfile, and unrelated test files are out of scope.

## Test requirements

- Focused login pending/error test in `ui-system.spec.ts`.
- Complete `ui-system.spec.ts`.
- Combined serialized `ui-system.spec.ts` and `web-security.spec.ts` against the
  exact stable merged WEB-SEC bytes, with one worker and no concurrent server or
  `.next` writer.
- Web TypeScript check.
- `git diff --check` and exact one-file contribution review.
- Use only the orchestrator-approved private Node/Playwright environment and serialized server/`.next` boundary; no dependency installation.

## Acceptance criteria

- The request sequence is exactly CSRF bootstrap then login.
- Exactly one CSRF call and one login call occur during the pending duplicate-submit scenario.
- Login carries the exact fixed mocked CSRF token.
- No refresh or replay follows `invalid_credentials`.
- Existing pending accessibility and generic safe-error assertions are preserved.
- `web-security.spec.ts` and all product source remain byte-identical.

## Definition of done

- The exact merged WEB-SEC request sequence above remains byte-stable throughout
  implementation and validation.
- The exact one-file test contribution passes the required focused, complete, and combined validations.
- Ponytail local native review returns an approved or changes-required decision,
  then the automated lifecycle creates the owner handoff and stops.
- Review findings are not auto-fixed. The owner decides corrections, additional
  validation, security review, staging, commit, push, PR, CI, deployment, and merge.

## Risks

- Starting before WEB-SEC ownership release would validate against moving client behavior.
- A permissive wildcard mock could conceal an unintended refresh or replay; the unexpected-request fallback must remain fail closed.
- This task must not become a vehicle for changing production authentication behavior.
