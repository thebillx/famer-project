# Security Model

## Authentication

- Argon2id password hashing.
- HttpOnly, Secure, SameSite cookies.
- CSRF protection for cookie-authenticated unsafe methods.
- Login rate limiting with safe account-lockout behavior.
- Single-use password reset tokens.
- Session expiration and refresh-token rotation.
- Email verification.

## FOUNDATION-001 session strategy

The selected browser session strategy is database-backed refresh sessions plus short-lived access tokens:

- Access tokens carry `typ=access` and expire quickly.
- Refresh tokens carry `typ=refresh`, are stored only as hashes in `refresh_sessions`, and are delivered through HttpOnly cookies.
- Refresh rotates the session and revokes the previous row.
- Logout best-effort revokes a valid current refresh session and deletes all browser auth/CSRF cookies.
- Generic login failure messages prevent account enumeration.

Cookie behavior:

- Access token cookie: HttpOnly, short-lived, path `/`.
- Refresh token cookie: HttpOnly, path `/api/v1/auth`, rotated on refresh.
- Production settings require Secure cookies.
- Logout is idempotent and deletes access, refresh, and CSRF cookies with matching attributes.

WEB-SEC-001 adds explicit double-submit CSRF protection. `GET /api/v1/auth/csrf` issues a
15-minute, host-only `agriscope_csrf` cookie and returns the opaque value for the browser to
send in `X-CSRF-Token`. Cookie-authenticated unsafe requests require a constant-time token
match and one exact normalized `Origin` equal to `APP_URL`. Bearer-only requests with neither
authentication cookie remain exempt. Access, refresh, and CSRF cookies share the configured
Secure/SameSite policy; logout clears all three with matching attributes.

The browser client keeps only the CSRF value in memory. It never exposes access or refresh
tokens to JavaScript storage. CSRF bootstrap and access refresh are single-flight operations;
each top-level request has one CSRF-renewal budget, one eligible refresh budget, and at most
three original endpoint attempts.

## WEB-SEC-001 bounded abuse controls

Authentication, CSRF bootstrap, tenant mutations, and satellite searches use independent,
privacy-safe fixed-window buckets. Bucket identifiers are domain-separated HMAC-SHA256
digests; raw email addresses, subjects, cookies, tokens, tenant IDs, and field IDs are not
retained. Expired entries are removed before insertion, active entries are never evicted to
admit a new identity, and saturation fails closed with `429 rate_limited` and `Retry-After`.

The immediate socket peer is authoritative unless it belongs to `TRUSTED_PROXY_CIDRS`; only
then may one syntactically valid `X-Forwarded-For` address replace it. Multiple or malformed
forwarded values are ignored. Logout is deliberately not rate-limited so valid CSRF cleanup
always remains available.

This limiter is intentionally in-process and safe only for the current single-process release.
Distributed enforcement is required before enabling multiple workers or instances.

## Authorization

- RBAC roles: Platform Super Admin, Organization Owner, Organization Admin, Agronomist, Field Manager, Viewer.
- Every tenant-owned query must enforce organization scope.
- Knowing a record ID must never grant cross-organization access.
- Disabled memberships cannot authorize.
- Foreign organization existence should return 404 rather than disclose tenant boundaries.

## Application security

- Input validation at schema and service boundaries.
- GeoJSON validation before persistence or analysis.
- File upload validation and antivirus hook for future imports.
- SQL injection protection through parameterized SQLAlchemy queries.
- XSS protection, CSP, and security headers.
- Audit logging for tenant-sensitive changes.
- Secret rotation support.
- Encryption at rest for secrets.
- No secret in frontend.
- No token in logs.
- Dependency and container image scanning in CI/CD.

## Privacy features

- Export user data.
- Delete account request.
- Delete organization request.
- Consent log.
- Data retention settings.
- Audit trail.

## Legal/security disclaimer

The project must not claim legal compliance or security certification until reviewed by legal counsel and a qualified security audit.
