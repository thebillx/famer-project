# Deployment

## Development

Use Docker Compose for PostgreSQL/PostGIS, Redis, and object storage. Application containers are added after the foundation slice is wired.

## Production requirements

- Production container images.
- Reverse proxy with TLS and security headers.
- Database migrations before API rollout.
- Health, readiness, and dependency endpoints.
- Worker health checks.
- Scheduled backup scripts.
- Restore runbook.
- Dependency and image scanning.
- Centralized JSON logs and metrics.

## Backup

Back up PostgreSQL, object storage metadata, and generated report artifacts. Test restore before claiming production readiness.
