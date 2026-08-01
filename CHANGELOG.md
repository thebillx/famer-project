# Changelog

## 0.1.0-alpha

### ARCH-001

- Added AgriScope architecture, data flow, ER model, API contract seed, security model, remote-sensing methodology, deployment notes, and limitations.
- Added initial agent governance and workflow files.
- Added dependency-light geospatial formulas, quality policy, and safe-language tests.

### FOUNDATION-001

- Added FastAPI foundation structure, typed settings, standard error shape, request ID middleware, structured logging helpers, and security headers.
- Added SQLAlchemy/Alembic foundation for users, organizations, memberships, and refresh sessions.
- Added authentication, refresh-session, RBAC, and tenant-scope foundation code and tests.
- Added review infrastructure, CODEOWNERS, pull request template, issue templates, and minimal CI.

### Known Limitations

- External CTO review is still required before merge.
- Runtime API execution, Alembic upgrade/downgrade, and full integration tests require installing locked Python dependencies.
- Farm/Field CRUD, Copernicus integration, satellite analysis, worker, scheduler, dashboard, alerts, reports, and frontend are not implemented.
