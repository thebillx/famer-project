# AgriScope Thailand

AgriScope Thailand is a production-oriented SaaS foundation for monitoring agricultural fields with free satellite data. It helps users answer:

> แปลงของฉันมีการเปลี่ยนแปลงผิดปกติหรือไม่ เกิดขึ้นตรงบริเวณไหน และควรไปตรวจตรงไหนก่อน

The system uses satellite observations to prioritize field inspection. It does not diagnose crop disease, pests, fertilizer deficiency, or prescribe chemicals.

## Current status

This repository has started Phase 1 and the first foundation slice:

- Architecture, data flow, ER model, API contract, security model, quota strategy, and roadmap are documented.
- Core remote-sensing index formulas and quality gates are implemented in a dependency-light Python package.
- Unit tests cover NDVI, EVI, SAVI, NDMI, NDWI, NDRE, NBR, BSI, division-by-zero behavior, cloud quality gates, and safe wording policy.
- No live Copernicus API calls are made by tests.

## Run local validation

```bash
python3 -m unittest discover -s tests/unit
```

## Repository map

```text
apps/api/                  FastAPI service skeleton and migration contracts
apps/worker/               Background worker package placeholder for later phases
packages/geospatial/       Remote-sensing formulas and quality policy
packages/config/           Branding and runtime configuration contracts
packages/shared-types/     API schemas and OpenAPI contract artifacts
packages/satellite-evalscripts/ Evalscript version registry
docs/                      Architecture, API, security, methodology, deployment, limitations
tests/                     Unit, contract, integration, and E2E test roots
infrastructure/            Docker, nginx, monitoring, and scripts roots
```

## Safety language

Allowed phrasing includes:

- พบความเปลี่ยนแปลง
- พบพื้นที่ที่ควรตรวจสอบ
- พบแนวโน้มความชื้นลดลง
- พบค่าความเขียวลดลง
- ข้อมูลยังไม่เพียงพอ
- ควรตรวจสอบภาคสนาม

Prohibited phrasing includes claims that a crop is definitely diseased, lacks fertilizer, has a specific pest, or requires a specific chemical.
