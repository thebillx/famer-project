# AgriScope Thailand Product Requirement v1

## Product goal

Build a Thai-first SaaS platform that helps farmers, farm owners, agricultural companies, cooperatives, buyers, and agencies identify field changes from satellite data and prioritize field inspection.

## Core question

> แปลงของฉันมีการเปลี่ยนแปลงผิดปกติหรือไม่ เกิดขึ้นตรงบริเวณไหน และควรไปตรวจตรงไหนก่อน

## Non-diagnosis policy

The product must never diagnose crop disease, specific pests, fertilizer deficiency, or prescribe chemicals from satellite imagery alone.

## Phase order

1. Architecture
2. Foundation
3. Farm Management
4. Satellite Integration
5. Analysis
6. Product UX
7. Production Hardening

## Definition of Done

The first production-ready release must satisfy the 30-point Definition of Done from the product prompt, including authentication, organization creation, field drawing, PostGIS geometry storage, real Copernicus OAuth/catalog/statistical/process integration, cloud/no-data filtering, explainable anomaly detection, alerts, reports, scheduler idempotency, quota protection, multi-tenant isolation, audit log, automated tests, Docker Compose, deployment guide, demo mode, attribution, disclaimer, and Thai mobile/desktop UI.
