# Task Brief

## Task ID

WEB-SEC-CONTRACT-001

## Status

IN_PROGRESS

## Title

Browser security contracts for cookie auth, mutations, rate limits, and honest satellite initial state

## Business goal

Before the farm/field V1 enables production mutation flows, the current browser client and API must agree on access/refresh cookie semantics, protect every cookie-authenticated unsafe request from CSRF, bound authentication and provider-search abuse, preserve typed safe errors through one refresh/retry path, and represent the absence of any persisted satellite acquisition honestly as `not_searched` rather than fabricating a completed no-result search.

## Current behavior

- OpenAPI names only `agriscope_refresh` as `cookieSession`, while protected runtime routes authenticate with `agriscope_access`.
- Cookie-authenticated unsafe product requests have no CSRF bootstrap or enforcement despite `docs/security.md` requiring it before product mutation exposure.
- OpenAPI advertises rate-limit classes without an enforcement implementation.
- The central web API client loses status/code/request ID and has no bounded refresh/retry cycle.
- Satellite latest synthesizes `no_data` and a current `searched_at` when no persisted acquisition exists, incorrectly implying a completed search result is stored.

## Expected behavior

- Before any intentional WEB-SEC contract change, phase A mechanically converts the clean tracked `docs/api/openapi.yaml` baseline to deterministic strict RFC 8259 JSON at the same path and atomically replaces the substring-only contract test with stdlib semantic JSON assertions. JSON is also valid YAML 1.2/OpenAPI serialization; this phase changes representation only, not the decoded OpenAPI model.
- OpenAPI and runtime distinguish access, refresh, CSRF cookie, and CSRF header schemes accurately.
- OpenAPI and runtime also document the already-supported bearer access-token alternative accurately; bearer-only requests are never silently treated as cookie sessions.
- A public CSRF bootstrap returns an opaque double-submit token; unsafe cookie-authenticated requests fail before side effects when token or permitted Origin is invalid.
- Auth, mutation, and provider-search operations enforce bounded, configurable, principal-aware limits and return safe 429 responses with `Retry-After`.
- The centralized browser client single-flights CSRF bootstrap and eligible access-session refreshes, retries within exact endpoint/error budgets, preserves typed API errors, and never loops or exposes auth tokens to JavaScript storage.
- Satellite latest and its current web consumer land atomically: GET returns `not_searched` with null acquisition/search time before any persisted acquisition, while the search response retains `no_data`, `temporarily_unavailable`, or `available` semantics.

## Scope

- A separately evidenced, representation-only OpenAPI YAML-to-JSON phase and semantic contract-test conversion that land before the intended WEB-SEC schema/operation changes.
- OpenAPI cookie/CSRF/error/rate-limit/satellite-state contract accuracy.
- Runtime CSRF middleware/helper, safe rate limiter for the current single-process release, auth bootstrap/logout cookie behavior, configuration, log redaction, satellite initial state, centralized web client support, and the minimal typed/card consumer adaptation required for atomic `not_searched` delivery.
- Semantic contract, unit, integration, and focused browser-security tests.

## Out of scope

- Page styling or route behavior beyond the minimal `SatelliteStatusCard` state adaptation, map provider/CSP policy, package/lockfile changes, migrations, provider implementation, raster/index/analysis/alert/report features, distributed rate limiting, audit log, password reset, account verification, CAPTCHA, persisted negative satellite attempts, or multi-instance deployment readiness.

## Dependencies

- `docs/security.md`
- `docs/api/openapi.yaml`
- Existing auth/farm/field/satellite runtime and tenant-isolation tests.
- APP-UI-001 is `VERIFIED` and its implementation owner is released. The orchestrator explicitly adopts the pre-existing dirty additions in `apps/web/lib/types.ts` (`User`/`Member` types) and `apps/web/components/SatelliteStatusCard.tsx` (latest-query error handling) as this task's starting baseline and hands both paths exclusively to this task's single implementation owner; no other task may own or edit them concurrently.
- WEB-PYTHON-ENV-001 has an independently native/security-approved durable 12-root/no-YAML validation environment at `/Users/bill/Library/Caches/AgriScope/WEB-PYTHON-ENV-001/agriscope-py312.GzKMSU`; it remains `IMPLEMENTED` and transfers exclusive read/execute consumer authority to this task with all package mutation forbidden. Phase A is frozen at the exact hashes below.
- Phase A was implemented and approved by native/security review before the temporary evidence root was cleared by the operating system. The durable repository result is frozen at `docs/api/openapi.yaml` SHA-256 `e71bea8058e4436be5c2b22c695616a6d14036c4069c4b24a10cb64ce647787a` and `tests/contract/test_foundation_contract.py` SHA-256 `db271e520ccc3d1aef273cbca50fb9528306ecd3ce4ac6ead2a65e0dae4f6b63`; the original tracked YAML remains available through Git for read-only semantic comparison. Phase A is not rerun.

## Frozen Phase A recovery evidence

- Phase A is complete and is not rerun. Its original tracked baseline is immutable Git commit `d51408cd89d29654eff494dfff52d872a7dcfb23`: `docs/api/openapi.yaml` SHA-256 `4badbaec22a64f200af79163aa399a213fa0a117069e5166fde8eca093051600` and `tests/contract/test_foundation_contract.py` SHA-256 `2bc01b8262e8c3d6e28785d5c03294d2c4b0d1ae6eb4fe244eba0257b885ee00`.
- The approved durable result is the current two-file state: deterministic strict JSON OpenAPI SHA-256 `e71bea8058e4436be5c2b22c695616a6d14036c4069c4b24a10cb64ce647787a` and stdlib semantic contract test SHA-256 `db271e520ccc3d1aef273cbca50fb9528306ecd3ce4ac6ead2a65e0dae4f6b63`.
- Prior native and security decisions are accepted only for those exact baseline/result bytes. The temporary converter, receipts, and environments were cleared by the operating system before consumer authority transferred; this recovery contract does not claim they remain live or reproducible evidence and never recreates their old literal paths.
- The current contract test is the durable verification boundary: strict stdlib JSON parsing rejects duplicate keys and non-finite values, requires canonical two-space UTF-8 bytes with one final LF and OpenAPI `3.1.0`, and structurally checks components, security schemes, schemas, paths, methods, operation extensions, security alternatives, responses, and error references without substring/block-offset logic or YAML import.
- Fresh Python provisioning and every later validation batch revalidate the two exact current hashes before execution. Any drift returns the task to contract review. Later intentional WEB-SEC OpenAPI changes receive a structural operation/schema before/after report against this frozen JSON baseline so representation noise cannot conceal a semantic contract change.

## Contracts

### Cookie and CSRF schemes

- `accessCookie`: `agriscope_access`; protects `/auth/me` and organization/farm/field/satellite reads and mutations.
- `bearerAuth`: HTTP bearer access token; an OR alternative to `accessCookie` for access-protected operations already supported by runtime.
- `refreshCookie`: `agriscope_refresh`; used only by `/auth/refresh` and `/auth/logout`.
- `csrfCookie`: `agriscope_csrf` cookie.
- `csrfHeader`: `X-CSRF-Token` header.
- Access-protected reads use the OpenAPI OR alternatives `{accessCookie: []}` or `{bearerAuth: []}`.
- Unsafe product operations use the OpenAPI OR alternatives `{accessCookie: [], csrfCookie: [], csrfHeader: []}` or `{bearerAuth: []}`. The bearer-only alternative applies only when neither `agriscope_access` nor `agriscope_refresh` is present; if either auth cookie is present, matching CSRF cookie/header and permitted Origin are mandatory even when an Authorization header is also present.
- Register/login require one AND security requirement containing `csrfCookie` + `csrfHeader`; neither endpoint is access-refresh eligible.
- Refresh requires one AND requirement containing `refreshCookie` + `csrfCookie` + `csrfHeader`.
- Logout is idempotent cleanup: it requires `csrfCookie` + `csrfHeader`, treats `refreshCookie` as optional revocation input, always deletes all three cookies and returns 204 after valid CSRF/Origin even when the refresh cookie is missing, malformed, expired, or already revoked, and never exposes an account/session-existence signal. Logout is not access-refresh eligible.
- `/auth/csrf` is public and has no automatic recovery. `/auth/me` is access protected and may use access cookie or bearer; only an `authentication_required` response from `/auth/me` is access-refresh eligible.
- Access and refresh cookies are host-only (no `Domain`), `HttpOnly`, use the configured exact `SameSite` policy (default `Lax`; `None` remains invalid without `Secure`), set `Secure` when configured, and use paths `/` and `${API_V1_PREFIX}/auth` respectively. Their bounded lifetimes remain the configured access-token minutes and refresh-token days, and a successful refresh rotates the refresh token/session.
- The CSRF cookie is host-only, intentionally not `HttpOnly`, uses the same configured `SameSite`/`Secure` policy, path `/`, and a bounded 15-minute lifetime. Set/delete operations use matching name/path/domain-absence/Secure/SameSite/HttpOnly attributes so logout reliably clears every cookie.

### `GET /api/v1/auth/csrf`

- Public, rate-limited, `200 application/json` response: `{ "csrf_token": "<opaque random token>" }`.
- Sets the matching bounded, host-only `agriscope_csrf` cookie using the exact attributes above.
- Adds `Cache-Control: no-store` and `Vary: Origin`.
- Missing/mismatched tokens or disallowed browser Origin return standard `403 ErrorResponse` code `csrf_failed` before side effects.
- A cookie-bearing unsafe browser request must send exactly the normalized configured `APP_URL` origin, including scheme, host, and effective port. Missing, `null`, malformed, multiple, or mismatched `Origin` is rejected. Bearer-only requests with no auth cookies may omit `Origin`.
- Tokens use cryptographic randomness and constant-time comparison and never appear in logs/errors/metrics.
- Logout deletes access, refresh, and CSRF cookies. Refresh may retain the current CSRF token for this slice.

### Central web client

- For unsafe cookie-authenticated requests, fetch/cache CSRF when absent and send `X-CSRF-Token`, with `credentials: include`. Concurrent callers share one in-flight CSRF-bootstrap promise; failure clears the promise/cache for a later explicit attempt.
- One top-level request owns a CSRF-renewal budget of one and an access-refresh budget of one. Its original endpoint is attempted at most three times across a mixed CSRF-then-401 or 401-then-CSRF path; each budget can be consumed only once.
- A `403 csrf_failed` may trigger one CSRF bootstrap and replay for unsafe auth or product endpoints. Bootstrap and refresh calls use an internal non-recursive request path; they never invoke the public recovery state machine themselves.
- Access refresh is eligible only when an access-protected original request returns HTTP 401 with exact API code `authentication_required`. Eligible paths are `/auth/me` and organization/farm/field/satellite product operations. It never runs for `/auth/csrf`, `/auth/register`, `/auth/login`, `/auth/refresh`, or `/auth/logout`, and never runs for `invalid_credentials`, `invalid_refresh_token`, network errors, 403 role errors, 404, 422, 429, or 5xx.
- Concurrent eligible 401 callers share one in-flight refresh promise. A successful refresh lets each waiter replay its own original request once. A failed refresh clears the promise and never recurses or replays: exact `invalid_refresh_token` yields the typed 401 to all waiters; exhausted `csrf_failed` yields typed 403; 429, 5xx, and other HTTP failures retain their status/code/request ID/public message; and a network failure becomes a typed `network_error` with null HTTP status/request ID and a generic safe public message.
- If the internal refresh itself receives `csrf_failed` and the top-level CSRF budget remains, the client single-flights one CSRF renewal and retries refresh once before either replaying the original or terminating. No internal call gains a new budget.
- Throw a typed safe error that retains HTTP status, API code, request ID, and public message.
- Never expose access/refresh tokens to browser storage or JavaScript.

### Rate limits

- Every 429 uses `ErrorResponse` code `rate_limited` and numeric `Retry-After`; no account-existence signal.
- The implementation uses a concurrency-safe fixed-window counter. Window duration defaults to 900 seconds. On rejection, `Retry-After = max(1, ceil(window_end_monotonic - now_monotonic))`.
- Independent buckets are checked together and the request is rejected when any applicable bucket is exhausted:
  - CSRF bootstrap: trusted-client-IP aggregate 60 / window.
  - Register: trusted-client-IP aggregate 25 / window and HMAC(normalized email) 5 / window.
  - Login: trusted-client-IP aggregate 50 / window and HMAC(normalized email) 10 / window.
  - Refresh: trusted-client-IP aggregate 60 / window and valid signed session subject 30 / window. Missing/invalid subject uses the IP aggregate plus HMAC(raw token) 10 / window when a token exists; a missing token is bounded by the IP bucket alone. Raw tokens are never retained.
  - Logout is deliberately exempt from rate limiting so a CSRF-valid user can always revoke when possible, clear all three browser cookies, and receive 204. It remains protected by exact Origin and double-submit CSRF; invalid/missing refresh state is idempotent and does not touch a session row unnecessarily.
  - Organization/farm/field mutations: trusted-client-IP aggregate 300 / window and authenticated subject 60 / window.
  - Satellite search: authenticated subject-wide 20 / window and subject + HMAC(field ID) 10 / window, preventing field rotation from multiplying provider calls without bound.
- Config names/defaults are `RATE_LIMIT_WINDOW_SECONDS=900`, `RATE_LIMIT_MAX_ENTRIES=10000`, `RATE_LIMIT_CSRF_IP=60`, `RATE_LIMIT_REGISTER_IP=25`, `RATE_LIMIT_REGISTER_EMAIL=5`, `RATE_LIMIT_LOGIN_IP=50`, `RATE_LIMIT_LOGIN_EMAIL=10`, `RATE_LIMIT_SESSION_IP=60`, `RATE_LIMIT_SESSION_SUBJECT=30`, `RATE_LIMIT_SESSION_TOKEN=10`, `RATE_LIMIT_MUTATION_IP=300`, `RATE_LIMIT_MUTATION_SUBJECT=60`, `RATE_LIMIT_SATELLITE_SUBJECT=20`, `RATE_LIMIT_SATELLITE_FIELD=10`, and `TRUSTED_PROXY_CIDRS=`. Window validates within 60–86400 seconds, maximum entries within 100–100000, counters within 1–10000, and proxy values as valid IP networks.
- The immediate socket peer is the client IP unless it belongs to `TRUSTED_PROXY_CIDRS`. Only then may exactly one syntactically valid IP value in `X-Forwarded-For` replace it; missing, malformed, comma-separated/multiple, or untrusted forwarded values are ignored rather than trusted.
- HMAC identifiers use domain-separated `HMAC-SHA256(session_secret, "rate-limit:v1:<bucket-kind>:<normalized-value>")`; stored keys contain only bucket kind and digest and never raw email, subject, cookie/token, tenant ID, or field ID.
- Before inserting a new key the limiter removes expired entries. If storage still equals `RATE_LIMIT_MAX_ENTRIES`, it fails closed with 429 and a window-bounded `Retry-After`; it does not evict an active key to admit a new one.
- This slice enforces only the exact auth/bootstrap/session/mutation/satellite buckets above. Unsupported `x-rate-limit` claims on health or read-only operations are removed from OpenAPI rather than left advertised; read/health limiting is later work.
- A bounded in-process limiter is allowed only while deployment remains single-process; distributed enforcement is required before multi-worker/multi-instance operation.

### Satellite state

- Runtime, OpenAPI, and TypeScript use a status-discriminated response union, not a loose optional object:
  - `available`: non-null acquisition and non-null `searched_at`.
  - `not_searched`: null acquisition and null `searched_at`.
  - `no_data | temporarily_unavailable`: null acquisition and non-null `searched_at` for the current POST attempt.
- `apps/api/agriscope_api/api/v1/satellite.py` owns the response-model union and rejects invariant-breaking shapes during validation rather than returning an ambiguous object.
- Latest GET with no persisted acquisition returns `not_searched`, `acquisition: null`, `searched_at: null`, and neutral Thai copy meaning no saved search result yet.
- Search POST returns non-null attempt time with `no_data` or `temporarily_unavailable`, or `available` with acquisition metadata.
- Negative/unavailable attempts are not persisted in this slice; after reload with no acquisition, latest GET returns `not_searched` and UI must not imply history exists.

### Runtime integration and ordering

- CSRF and rate limiting are explicit route/service integration, not an implicit global mutation middleware. `application.py` initializes the single shared limiter; `auth.py`, `organizations.py`, `farms.py`, and `satellite.py` call the shared helpers at their exact decision points. Existing `get_current_user` and membership/service authorization remain the only authentication/tenant-role authorities; the limiter never invents a parallel authorization decision.
- Unsafe access-protected organization/farm/field operations order: authenticate active user → validate CSRF/Origin when cookie-authenticated (bearer-only/no-auth-cookie skips CSRF) → resolve tenant/resource and role, preserving safe 404/403 → check all applicable rate-limit buckets → invoke repository/idempotency/mutation side effect.
- Satellite search order: authenticate → CSRF when required → resolve the tenant-scoped field (safe 404) → check subject-wide and subject+field buckets → call provider/idempotent persistence. `SatelliteService` may accept the already-authorized field or an explicit post-authorization limiter callback so provider work never precedes the limiter and tenant lookup is not bypassed.
- Register/login order: CSRF/Origin → IP and email buckets → authentication/registration side effect. Refresh order: validate CSRF/Origin → derive valid subject or privacy-safe fallback key → session buckets → rotate. Logout order: validate CSRF/Origin → best-effort revoke a valid session → delete all three cookies → 204, with no rate-limit decision; logout remains idempotent.
- CSRF rejection never increments limiter state and never touches tenant/resource repositories, idempotency state, or providers. Authentication/tenant/role failures never invoke mutation/provider work. Rate-limit rejection occurs after required authorization but before idempotency/repository/provider side effects.

### Standard errors

- Protected operations document 401.
- Cookie-authenticated unsafe operations document 403 CSRF; role failures remain 403.
- Scoped foreign/deleted resources remain indistinguishable 404.
- Invalid UUID/payload/geometry document 422.
- Rate-limited operations document 429 with `Retry-After`.

## Agent owners

- Orchestrator: `/root`
- Implementation: `/root/implementation` after APP-UI-001 handoff
- Ponytail local native review: `/root/code_review`; it is code review only and is
  the terminal automated review stage

## File ownership

- Orchestrator only:
  - `.agents/tasks/WEB-SEC-CONTRACT-001-task-brief.md`
- Single sequential implementation owner:
  - `docs/api/openapi.yaml`
  - `docs/security.md`
  - `apps/api/agriscope_api/application.py`
  - `apps/api/agriscope_api/api/v1/auth.py`
  - `apps/api/agriscope_api/api/v1/organizations.py`
  - `apps/api/agriscope_api/api/v1/farms.py`
  - `apps/api/agriscope_api/api/v1/satellite.py`
  - `apps/api/agriscope_api/core/config.py`
  - `apps/api/agriscope_api/core/logging.py`
  - `apps/api/agriscope_api/core/csrf.py`
  - `apps/api/agriscope_api/core/rate_limit.py`
  - `apps/api/agriscope_api/services/satellite.py`
  - `apps/web/lib/api.ts`
  - `apps/web/lib/types.ts`
  - `apps/web/components/SatelliteStatusCard.tsx`
  - `tests/contract/test_foundation_contract.py`
  - `tests/unit/test_csrf.py`
  - `tests/unit/test_rate_limit.py`
  - `tests/integration/test_foundation_api.py`
  - `tests/e2e/web-security.spec.ts`
- After the PostgreSQL isolation correction reaches contract approval, the same single sequential implementation owner exclusively owns the exact external bundle root `/Users/bill/Library/Caches/AgriScope/WEB-PYTHON-ENV-001/agriscope-py312.GzKMSU/runs/WEB-SEC-CONTRACT-001/integration-validation-v1` and its manifest-pinned provisioner, bootstrap SQL, schema-contract JSON, collection/execution helpers, network guard, receipts, and teardown evidence. No other external path is authorized.
- The implementation owner is the sole bootstrap, test-run, and teardown executor, but those are three separately authorized serialized high-impact phases with distinct immutable receipts. “Separate teardown” means a separately authorized teardown phase by this same exclusive owner, not a second owner. It owns only Docker resources with the exact recorded `agriscope-web-sec-int-v1-<suffix>` prefix and must resolve every literal container/resource identity before mutation. The orchestrator owns phase authorization and may not execute or edit the bundle. This execution authorization is not a pre-push code-security review.
- Image acquisition is not included in file ownership or execution authority. If the exact pinned image is absent, the integration slice stops for a separate acquisition contract rather than pulling implicitly.
- All page, other component/type, map, provider, migration, package, lockfile, existing UI/field/landing E2E, and unrelated dirty/untracked files are read-only.

## Security requirements

- CSRF rejection precedes every side effect and provider call.
- Cookie-bearing unsafe browser Origin must equal normalized configured `APP_URL` scheme/host/effective-port exactly; missing, `null`, malformed, multiple, or mismatched Origin fails closed. Bearer-only requests without auth cookies may omit Origin.
- Rate-limit keys and logs never retain raw identity, tenant/resource IDs, cookies, authorization, passwords, or CSRF tokens.
- Frontend retries are bounded to one CSRF renewal and one session refresh/replay.
- Access refresh is exact-code/path eligible and single-flight; invalid login/refresh/logout traffic never triggers recursive or unrelated refresh calls.
- Tenant enforcement remains server authoritative; foreign/random/deleted scoped resources retain safe 404 behavior.
- Viewer farm/field mutations remain denied; viewer satellite search follows the existing contract.
- Satellite wording stays metadata-only and never diagnoses, scores health/risk, alerts, prescribes, or converts missing data into an all-clear.

## Test requirements

### PostgreSQL integration isolation correction (CONTRACT_READY for implementation only)

- The current hard-coded `localhost:5432/agriscope` integration target is not authorized for execution because it is also the documented development database and the suite truncates application tables. The 32 collected integration nodes remain withheld until this correction receives explicit orchestrator authorization under the high-impact-operation rule and the updated test source is frozen in a new final profile.
- The only database artifact allowed is the existing project family `postgis/postgis:16-3.4`, pinned as `postgis/postgis@sha256:44126d872ac91993766c341e369c539e8196614321765d36a6f1bab0419a5fa5` for exact `linux/arm64`. The provisioner uses `--pull=never` and fails if that digest/platform is not already present and independently inspected; image acquisition, if needed, is a separate reviewed network action and never occurs in the runner. Existing `docker-compose.yml` is forbidden because it uses a mutable tag, fixed public port, development identity, and unrelated services.
- Integration validation uses one fresh literal container whose name has the exact `agriscope-web-sec-int-v1-<recorded-random-suffix>` form, no restart policy, no repository bind mount, no persistent/named volume, and a bounded tmpfs data directory. It publishes only container port 5432 to `127.0.0.1` on one newly allocated recorded host port. The container is the sole member of one fresh exact-prefix Docker bridge network created with `--internal`; Docker inspection must prove `Internal=true`, zero default/external network attachment, one container member, no host/default route from the container, and an effective negative egress probe before bootstrap and immediately before the child. Docker inspection must also prove the exact image digest/platform, container identity, tmpfs/no-volume state, one loopback port mapping, and absence of other published ports.
- Privileged bootstrap is a separate reviewed phase using a generated password file mounted from the private external evidence root, never an environment value or receipt field. It installs exact PostGIS, exact application schema, and exact Alembic state from a manifest-pinned external bootstrap SQL artifact reviewed against migration head `20260801_0003` and migration SHA-256 values `0cc69edd37f876116a5145b1a04d7877e3fa0f454b44ddde4945261c34be7ded`, `a6f54a1d854d3d374dff1c5f540ff983ee64afb8e0e4e0f7802a46f3ca98804a`, and `5ad45f05c26e8b0537564da65e5f5c2673cf96d334e57f349b00e7b14c338afa`. Before test-child launch, bootstrap credentials are deleted, the bootstrap login is set `NOLOGIN`, the child environment/`PATH` exposes no Docker command, and inspection proves the test role has no inherited memberships, object ownership, or effective privilege beyond the contract below.
- The database and role names are generated task-specific single identifiers and may not equal `agriscope`, `postgres`, any configured application identity, or each other. The sole secret source is one runner-supplied SQLAlchemy URL with exact grammar `postgresql+psycopg://<task-user>:<percent-encoded-password>@127.0.0.1:<recorded-port>/<task-database>` and no query, fragment, alternate/multiple host, socket, service, passfile, options, or second URL. Application settings consume it directly. The direct psycopg fixture strictly parses that same value and passes derived `host`, `port`, `dbname`, `user`, and `password` parameters to `psycopg.connect`; it may not construct or read a second DSN. Both representations and the connected session identity are cryptographically bound, but evidence records only the URL digest and non-secret address/port/database/role classification.
- Before `create_app`, fixture cleanup, or any test body, the outer guard separately proves the strict URL and Docker mapping `127.0.0.1:<recorded-host-port>` to the exact container ID/IP at container port 5432. The SQL session proves `inet_server_addr()` equals that exact Docker-inspected container IP, `inet_server_port()=5432`, and the exact database/current user; both proofs are bound to the same container/network inspection. SQL also proves PostgreSQL major 16, reviewed PostGIS 3.4 extension identity, and exact Alembic head. It proves the test role is `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`, has zero role memberships, owns no database/schema/table/sequence/extension/sentinel object, and lacks database/schema/role/extension/migration creation authority.
- The admin-owned `agriscope_test_guard.run_sentinel` table contains exactly one row with `run_id`, task-contract SHA-256, image digest, and schema-contract SHA-256. The guard schema/table/row are outside the destructive allowlist. The test role receives only schema `USAGE` and row `SELECT`; it has no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/ownership/grant option. The fixture compares every expected value and digest before destructive SQL and again in the same cleanup transaction.
- The seven destructive application tables are exactly `field_acquisitions`, `fields`, `farms`, `refresh_sessions`, `memberships`, `organizations`, and `users`. `alembic_version`, `spatial_ref_sys`, every PostGIS extension-owned object, and the sentinel are authenticated but never cleaned. The external `integration-schema-contract-v1.json` defines the expected canonical catalog records for the seven tables plus `alembic_version`: NFC names; ordered columns with ordinal/type/UDT/nullability/canonical default; table owner and RLS flags; sorted constraints with `pg_get_constraintdef`; sorted indexes with uniqueness/primary flags and `pg_get_indexdef`; Alembic head; PostGIS extension/version; role flags/memberships/ownership; and database/schema/table/sentinel ACLs. Arrays sort by UTF-8 path/key bytes, compact UTF-8 JSON uses separators `,`/`:`, one final LF, and SHA-256. The manifest pins its exact digest; runtime catalog output must be byte-identical. PostGIS extension-owned catalog internals are excluded except the exact extension/version and required `spatial_ref_sys` ownership/ACL identity.
- The integration role receives only database CONNECT; schema USAGE on `public` and `agriscope_test_guard`; SELECT/INSERT/UPDATE/DELETE/TRUNCATE on the seven exact application tables; SELECT on `alembic_version`; and SELECT on the sentinel. `CREATE` on both schemas is revoked from PUBLIC and absent from the role. No sequence privilege is granted unless the reviewed schema contract proves an exact application sequence is required. `RESTART IDENTITY` is removed from cleanup and remains forbidden without a later contract review.
- Function execution follows one explicit fresh-database model: default PUBLIC EXECUTE is allowed only for `pg_catalog` built-ins and functions owned by the exact PostGIS extension, with no role-specific function grant, no non-extension user-defined function, and no untrusted/procedural-language function. The schema contract authenticates extension ownership and the complete non-`pg_catalog` function/ACL inventory; runtime evidence additionally proves the application-used `gen_random_uuid`, `ST_GeomFromGeoJSON`, `ST_SetSRID`, `ST_Area`, and `ST_AsGeoJSON` resolve only to the approved built-in/extension identities. “No effective privilege beyond the contract” includes these exact default function privileges and the object ACLs listed above, and nothing else.
- Cleanup runs before each node and after the complete batch, reauthenticates the sentinel and schema in the same transaction, truncates only the seven exact tables, then proves all seven contain zero rows, the sentinel/schema/Alembic/PostGIS identities remain intact, and no other test-role session survives after the runner's final inspection. Cleanup outcome is recorded even when a test fails; no automatic rerun is permitted.
- The historical collection anchors are v25 receipt SHA-256 `90b23b9aa7607a3b9707f499be85453959cd41d656a3216644bfd86592d26eb7` and result SHA-256 `5af961b275561895f9443a7e0534ebb82978f5388f2771b77dad8cd2872c1f93`. Because the integration test source must change, a fresh final profile and fresh collect-only successor must match the historical ordered 32 integration node IDs exactly, with no added/removed/reordered node, before execution authority can be reviewed. The execution bundle pins that successor receipt/result and runs those exact 32 nodes serially without discovery.
- Network authority is only the one recorded `127.0.0.1:<database-port>`. A manifest-pinned pre-import guard installs both a Python audit hook and immutable socket/http client guards that reject every other Python network attempt and verifies their identities before/after pytest; the only native-library exception is libpq using the strictly parsed approved database parameters. The same audit boundary rejects all subprocess/process-spawn/system/exec/posix-spawn events after the exact private Python child starts, rejects AF_UNIX sockets, rejects reads/opens of every Docker socket path and Docker configuration path, and has no Docker executable in its exact PATH. The container never mounts a Docker socket. Before the production batch, separately classified guard self-probes prove non-loopback, wrong-port, AF_UNIX/Docker-socket, and process-spawn operations are rejected by policy before transport/process creation; these blocked probes are not test traffic. Container-side negative evidence separately proves the internal network has no outbound route. During the actual 32-node batch, require zero unauthorized transport, zero successful or unblocked non-loopback/wrong-port connection, and zero guard violation. Redis, MinIO, live/default CDSE provider construction/search, package/index access, migrations, and repository writes remain forbidden. The client fixture installs a fail-closed default satellite provider; exact reviewed node-local fakes may replace it, and evidence records their expected per-node fake calls while requiring zero live-provider transport.
- The sanitized child environment removes `HOME`, `PYTHONPATH`, proxy variables, PostgreSQL service/passfile variables, loader injection, and SSL key-log/certificate overrides. Raw database/session/encryption secrets never appear in argv, stdout, stderr, receipts, or logs; evidence records only approved presence/classification and cryptographic digests.
- PASS requires all exact 32 nodes collected, executed, and passed in order; zero skip/fail/error/xfail/xpass; exact loopback-only database evidence; zero live-provider/non-loopback calls; exact approved fake-call evidence; final empty tables; intact sentinel/schema; zero surviving test sessions; and unchanged source, TCB, interpreter, repository hygiene, and sealed environment trees. Every other outcome seals FAIL/REJECTED with first-error preservation and cleanup status.
- The immutable execution receipt is sealed before infrastructure removal. In a mandatory separately authorized teardown phase, the same exclusive implementation owner authenticates it, proves no child/open database session remains, removes only the literal recorded container and internal network, and proves literal-container/network absence, closed recorded port, zero Docker volume/mount/network residue for the run, deleted bootstrap/test credential files, and unchanged repository/environment state. It writes a distinct immutable teardown receipt outside removed paths. Integration acceptance requires both receipts even after FAIL; absence or failure of teardown evidence blocks the task and never authorizes rerun.
- This clause changes validation isolation only. It does not authorize a product API, schema, migration, dependency, or deployment change. Contract approval authorizes only the named integration test and external bundle implementation; image acquisition, database bootstrap, fresh collection, test execution, and teardown each remain separately authorized serialized phases. Unit/contract validation does not depend on this correction.

- Phase A strict-parser tests reject duplicate keys and `NaN`/`Infinity`, require the deterministic two-space/final-LF encoding, and structurally assert the unchanged baseline top-level object, OpenAPI version, components/security schemes/schemas, every required path+method, operation extensions, security alternatives, responses, and standard error schema. No YAML/PyYAML import, product dependency, package manifest, or lockfile change is permitted.
- Parse the final OpenAPI semantically with stdlib `json.loads` and assert operation-level security schemes and 401/403/404/422/429 responses; substring/block-offset checks are forbidden.
- Cookie/CSRF unit/integration matrix: random matching bootstrap token/cookie, flags/headers/lifetimes/host-only attributes, rotation; exact configured-origin acceptance; missing, `null`, malformed, multiple, and scheme/host/effective-port mismatch rejection; allowed register/login/refresh/idempotent logout/organization/farm/field/satellite mutation; bearer-only no-cookie Origin exemption; cookie-present enforcement; matching set/delete attributes for all cookies; refresh rotation; and no side effects on rejection.
- Rate-limit tests: fixed-window exact boundary and deterministic `Retry-After` rounding, independent-bucket rejection, email/field rotation resistance, valid refresh subject and missing/malformed/expired refresh fallback, principal isolation, expiry, active-key saturation failure, expired-key eviction, concurrency, trusted-proxy allowlist/single-IP behavior, config range/CIDR validation, absence of raw key material, and proof that logout neither consumes nor returns a limiter response.
- Route/service ordering tests use spies/fakes to prove: CSRF rejection does not increment limiter/repository/idempotency/provider state; foreign/deleted lookup remains safe 404 before limiter/provider; role failure precedes limiter/mutation; and a 429 after successful authorization precedes repository mutation, idempotency, and provider work.
- Browser-client E2E: single-flight CSRF bootstrap and single-flight refresh under concurrent callers; one CSRF retry; one eligible `authentication_required` refresh/replay; invalid login produces no refresh; invalid refresh terminates all waiters with typed 401 and no recursion; exhausted refresh CSRF propagates typed 403; refresh 429/5xx retain their typed failure; refresh network failure yields typed `network_error`; mixed CSRF+401 paths consume each budget once with at most three original attempts; ineligible error/status matrix does not replay; and no token storage.
- Tenant/regression tests: foreign/deleted safe 404, disabled memberships, viewer mutation denial, provider not called after authorization/CSRF/rate-limit failure, and existing geometry/idempotency behavior.
- Satellite tests: Python and OpenAPI/TypeScript discriminated-union invariants; exact `not_searched/null/null` before persisted acquisition; safe POST no-data/unavailable with non-null attempt time; unchanged available/idempotent response; response validation rejects impossible status/acquisition/time combinations; and a visible neutral `SatelliteStatusCard` initial state with no blank, diagnosis, risk, alert, prescription, or false all-clear rendering.
- Logging/redaction tests cover cookies, authorization, CSRF token/header, passwords, and rate-limit keys.
- Validation commands:
  - Python unit suite.
  - Python contract suite.
  - PostgreSQL integration suite for auth, tenant mutation, and satellite search.
  - Web typecheck and production build.
  - Focused `web-security.spec.ts` Playwright.
  - Scoped secret/log scan and `git diff --check`.

## Acceptance criteria

- The frozen Phase A baseline/result Git identities and exact current hashes above remain unchanged; the strict stdlib structural test passes in the newly approved environment before intentional WEB-SEC edits begin. No deleted temporary receipt is required or claimed.
- `docs/api/openapi.yaml` remains at the same path, is canonical pretty strict JSON, and is parsed only with the Python standard library by contract tests; repository runtime/test code has no YAML/PyYAML dependency or import.
- Runtime and OpenAPI agree on access-cookie/bearer alternatives, refresh, CSRF cookie/header semantics, idempotent logout, and exact cookie set/delete attributes.
- Every unsafe cookie-authenticated operation rejects missing/mismatched CSRF before side effects, while allowed bearer-only API requests remain usable.
- Auth/mutation/provider-search abuse is bounded by independent aggregate/principal buckets, fixed storage/window limits, and safe 429 responses.
- The browser client single-flights concurrent recovery, completes at most one safe CSRF renewal and one eligible access-session refresh, attempts the original endpoint at most three times, and exposes typed errors without token storage.
- Satellite latest initial state is the enforced `not_searched` union member with null acquisition/search time, and the typed/card consumer renders neutral Thai copy atomically.
- Existing tenant isolation, role enforcement, geometry validation, satellite idempotency, safe logging, and provider mocks remain passing.
- No UI page or component other than the minimal typed `SatelliteStatusCard` state adaptation, provider, migration, package, or lockfile change occurs. The three added API route files change only security integration/response typing required by this contract.

## Definition of done

- The frozen Phase A hashes and Git baseline identity are revalidated before fresh provisioning and before intentional WEB-SEC edits; deleted temporary roots/evidence are never recreated.
- All required automated tests and scoped scans pass with evidence.
- Ponytail local native code review returns an approved or changes-required
  decision, then the automated lifecycle creates the owner handoff and stops.
- No page/shared-UI file other than the explicitly owned `SatelliteStatusCard.tsx` and `types.ts` compatibility adaptation is changed.
- Review findings are not auto-fixed. The owner decides corrections, additional
  validation, security review, staging, commit, push, PR, CI, deployment, and merge.
- Ownership is handed off before a frontend page slice consumes typed errors or expands the `not_searched` presentation.

## Risks

- CSRF enforcement must land atomically with `apps/web/lib/api.ts` support or existing browser mutations will fail.
- In-process rate limits are not safe for multi-worker/multi-instance deployment; the release must stay single-process until distributed enforcement lands.
- Negative/unavailable attempts are intentionally not persisted; after reload with no acquisition the product returns to `not_searched` and must not imply search history exists.
- Origin/proxy misconfiguration can cause either blocked valid requests or unsafe client-IP trust; configuration tests are mandatory.
