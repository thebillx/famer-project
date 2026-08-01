# Deployment

## Development

Use Docker Compose for PostgreSQL/PostGIS, Redis, and object storage. Application containers are added after the foundation slice is wired.

## Local API setup after dependency installation

```bash
docker compose up -d postgres redis minio
cd apps/api
alembic upgrade head
cd ../..
uvicorn apps.api.agriscope_api.main:app --reload
```

Validation commands:

```bash
python3 -m unittest discover -s tests/unit
python3 -m unittest discover -s tests/contract
docker compose config
```

Do not run production with `.env.example` secrets. Production must set strong secrets and `COOKIE_SECURE=true`.

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
