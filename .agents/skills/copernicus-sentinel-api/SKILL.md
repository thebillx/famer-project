---
name: copernicus-sentinel-api
description: Integrate AgriScope server-side Copernicus Sentinel APIs with OAuth, catalog/process/statistical calls, evalscript versioning, quality metadata, idempotency, provider mocks, numerical validation, and safe agronomic wording.
---

# copernicus-sentinel-api

## Purpose

Guide server-side satellite-provider integration for Copernicus Sentinel data in early AgriScope phases.

## When to use

- Planning or implementing Copernicus provider adapter behavior.
- Working with Catalog, Process, or Statistical APIs.
- Defining evalscripts, acquisition IDs, cache keys, or provider mocks.
- Reviewing safe language for satellite-derived observations.

## When not to use

- Bootstrap-only work where real API calls and product implementation are prohibited.
- Frontend browser integration.
- Non-Copernicus provider work unless adapting the same interface.

## Required inputs

- Task brief.
- Provider contract and mock contract.
- Geometry input contract.
- Time range and data-quality requirements.
- Evalscript version.
- Usage tracking requirements.

## Preconditions

- Integration is server-side only.
- Secrets are available only through approved secret management.
- Provider mock and contract fixtures exist before production flow is claimed complete.

## Procedure

1. Handle OAuth tokens server-side.
2. Cache tokens without logging token values.
3. Use Catalog API for acquisition discovery.
4. Use Process API for imagery products.
5. Use Statistical API for index summaries.
6. Track acquisition ID.
7. Validate geometry input.
8. Validate time range.
9. Capture cloud metadata.
10. Handle SCL, CLD, and dataMask.
11. Support NDVI, NDMI, NDWI, and True Color outputs when contract requires them.
12. Version evalscripts.
13. Set request timeout.
14. Use retry with exponential backoff for retryable failures.
15. Expose a circuit-breaker interface.
16. Enforce idempotency.
17. Track provider usage.
18. Define cache keys from provider, acquisition, geometry hash, evalscript version, time range, and processing options.
19. Provide provider mock fixtures.
20. Add contract fixtures.
21. Add numerical validation for index outputs.
22. Include data attribution.
23. Document known limitations.

## Expected outputs

- Provider adapter or contract plan.
- Mock and fixture definitions.
- Quality and cache behavior.
- Safe wording guidance.
- Handoff report.

## Validation

- No real API is called during bootstrap.
- Token values never appear in logs.
- Cache and idempotency behavior are testable.
- Numerical fixtures cover NoData and quality-threshold behavior.
- Output wording stays within allowed language.

## Failure handling

- On provider timeout, return recoverable provider error.
- On rate limit, back off and record usage state.
- On insufficient data quality, return `ข้อมูลไม่เพียงพอ` or equivalent contract value.
- On unknown provider response, fail closed and preserve diagnostic metadata without secrets.

## Security considerations

- Keep client ID and client secret server-side.
- Mask tokens and provider credentials.
- Enforce organization scope before processing tenant geometry.
- Avoid logging private geometries unless approved.
- Track usage to prevent uncontrolled provider cost.

## Handoff requirements

Report endpoints used, evalscript version, cache key, mock fixtures, numerical checks, data attribution, limitations, and any provider risks.

## Prohibited actions

- Do not call real Copernicus APIs during bootstrap.
- Do not expose provider credentials to the browser.
- Do not generate production alerts from insufficient-quality data.
- Do not claim causal agronomic diagnosis from satellite indexes.

## References

- `AGENTS.md`
- `.agents/workflows/contract-first.md`
- Sentinel Hub documentation, `sentinelhub-py`, and Sentinel Hub custom scripts as references.

## Allowed wording

- พบความเปลี่ยนแปลง
- พบสัญญาณที่ควรตรวจสอบ
- พบค่าความเขียวลดลง
- พบแนวโน้มปริมาณน้ำในพืชลดลง
- ข้อมูลไม่เพียงพอ
- ควรตรวจสอบภาคสนาม

## Prohibited wording

- เป็นโรคแน่นอน
- ขาดน้ำแน่นอน
- ขาดปุ๋ยแน่นอน
- พบแมลงชนิดใดชนิดหนึ่ง
- ต้องใช้สารเคมีชนิดใด
