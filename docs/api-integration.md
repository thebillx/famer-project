# API Integration

## Provider adapter

Provider integration is server-side only. Browser code never receives provider credentials.

Required modules:

- `CopernicusAuthClient`
- `CopernicusCatalogClient`
- `CopernicusProcessClient`
- `CopernicusStatisticalClient`
- `Sentinel1AnalysisService`
- `Sentinel2AnalysisService`
- `DemAnalysisService`
- `LandsatAnalysisService`
- `QuotaManagementService`
- `SatelliteArtifactService`

## Resilience requirements

- OAuth token caching and refresh before expiry.
- Timeout on every request.
- Retry only retryable failures.
- Exponential backoff with jitter.
- Circuit breaker interface.
- Idempotency key for each analysis job.
- Request correlation ID.
- Structured logs with token and secret masking.
- Usage tracking by provider, organization, date, request count, success, failure, processing units, and bytes.

## Cache key

```text
provider
collection
external acquisition id
geometry hash
algorithm version
resolution
time range
processing options
```

## Quota

Free quota amounts are not hardcoded. Admin sets soft and hard limits through environment variables or Admin Console. New processing stops at hard limit. Admin is notified before soft limit.
