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
- Logout revokes the current refresh session and deletes the cookie.
- Generic login failure messages prevent account enumeration.

Cookie behavior:

- Access token cookie: HttpOnly, short-lived, path `/`.
- Refresh token cookie: HttpOnly, path `/api/v1/auth`, rotated on refresh.
- Production settings require Secure cookies.
- Logout revokes the current refresh session and deletes both cookies.

CSRF implications: browser cookie authentication requires CSRF protection before unsafe product endpoints are exposed beyond this foundation. FOUNDATION-001 scopes refresh cookies to auth routes and does not add cross-site flows. A later CSRF slice must add token or double-submit protection for state-changing browser requests.

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
