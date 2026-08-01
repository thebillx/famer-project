# Architecture Decision Record

## ADR ID

ADR-0001

## Title

Contract-first monorepo foundation for AgriScope Thailand

## Status

Accepted

## Context

AgriScope needs a production-oriented SaaS foundation with web, API, worker, geospatial analysis, satellite provider integrations, and strict multi-tenant security.

## Decision

Use a monorepo with Next.js web, FastAPI API, separate worker, PostgreSQL/PostGIS, Redis, S3-compatible object storage, and provider adapters. Implementation proceeds by vertical slice with API/data contracts before feature code.

## Alternatives considered

- Single full-stack application: rejected because worker and satellite processing boundaries need operational isolation.
- Direct browser-to-provider integration: rejected because provider secrets must never reach the browser.
- Prototype-first UI: rejected because mocks cannot represent production completion.

## Consequences

The repo can grow into a SaaS product while preserving testability and ownership boundaries. Initial setup requires more contracts and docs before UI velocity.

## Security impact

Server-side provider integration, tenant-scope enforcement, and secret masking are mandatory.

## Operational impact

API, worker, database, Redis, and object storage need separate health and deployment controls.

## Migration or rollback plan

Initial migration creates the core multi-tenant schema. Rollback drops only newly created AgriScope tables in development; production rollback requires backup restore planning.
