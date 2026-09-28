# AgriScope Local Demo

AgriScope has two local demo paths:

1. **Real cached Sentinel-2 (recommended)** — real CDSE observations and real NDVI are prefetched once and stored before the presentation.
2. **Synthetic fallback** — deterministic data labelled **ข้อมูลสาธิต** for offline/failure fallback and edge-case demonstrations.

The core presentation should use the real cached path when it has been prefetched successfully.

## Demo identity

Local demo only:

- Email: `demo@agriscope.local`
- Password: `DemoPass12345`
- Organization: `AgriScope Demo`

Demo seed and prefetch commands refuse `APP_ENV=production`.

## Privacy-safe real demo area

The real demo does not use a named private farmer, customer record, title deed, or cadastral parcel.

The target is a small rectangular **analysis window** around a publicly documented agricultural research location in the Mae Hia agricultural research/demonstration area in Chiang Mai.

User-facing names:

- Farm: **พื้นที่สาธิตแม่เหียะ · Sentinel-2 จริง**
- Field: **หน้าต่างวิเคราะห์แม่เหียะ A · ไม่ใช่ขอบเขตกรรมสิทธิ์**

The polygon is intentionally not presented as a legal parcel or ownership boundary. Do not add a natural-person owner name, phone number, house address, title-deed number, parcel identifier, customer ID, or another identifier that could link the geometry to an individual.

Public context used to choose the area:

- Chiang Mai University describes the Mae Hia agricultural research/demonstration centre as a research, teaching, training, and agricultural technology-transfer facility:
  https://www.cmu.ac.th/th/faculty/agriculture/service
- Published research has documented agricultural study locations inside the Mae Hia research centre. The built-in AOI is a bounded analysis window around a published research-site coordinate, not a copied parcel boundary.

This convention reduces privacy risk for the demo; it is not a legal determination about a specific dataset.

## One-time real Sentinel-2 prefetch

Prerequisites:

- Docker with Compose support is running;
- Python 3.12 environment and repository dependencies are already installed;
- `CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET` are configured in the shell;
- internet access to Copernicus Data Space Ecosystem.

The prefetch command starts local PostGIS, waits for it to become ready, and applies
Alembic migrations before calling CDSE.

Run:

```bash
npm run demo:prefetch-real
```

Optional bounded parameters can be forwarded:

```bash
npm run demo:prefetch-real -- --days 180 --count 3
```

The command:

1. creates or refreshes the privacy-safe Mae Hia analysis window;
2. searches a bounded Sentinel-2 Level-2A history through CDSE STAC;
3. attempts real NDVI analysis for usable distinct observations;
4. caches up to the requested count of successful real analyses;
5. marks only successfully cached observations as demo-cached real evidence;
6. verifies at least two cached acquisition times and computes a comparison;
7. prints dates/status but never prints CDSE credentials.

The provider remains `cdse_stac`. Cached observations are shown as **Sentinel-2 · เก็บไว้ล่วงหน้า**.

True-colour imagery is not cached in this slice, so the core real-cached demo does not request it. The reliable demo path is:

**real Sentinel-2 history → cached real NDVI → cached raster → change comparison → farm prioritization**

## Start the demo

After dependencies are installed:

```bash
npm run demo
```

The launcher:

- starts local PostGIS;
- applies migrations;
- refreshes the synthetic fallback dataset;
- preserves real data already prefetched in the database;
- starts FastAPI on port 8000;
- starts Next.js on port 3000.

Open:

```text
http://localhost:3000/login
```

Press Ctrl-C in the launcher terminal to stop API and web processes.

## Recommended walkthrough

When real cached data has been prefetched:

1. Sign in with the local demo account.
2. Open **พื้นที่สาธิตแม่เหียะ · Sentinel-2 จริง**.
3. Point out that the polygon is an analysis window and not an ownership boundary.
4. Open **หน้าต่างวิเคราะห์แม่เหียะ A · ไม่ใช่ขอบเขตกรรมสิทธิ์**.
5. Show the observation history labelled **Sentinel-2 · เก็บไว้ล่วงหน้า**.
6. Show cached NDVI for two or more real acquisition dates.
7. Switch to change comparison and explain the common-support/quality guardrails.
8. Return to the farm view and show the resulting inspection-priority state.
9. Optionally create a new field using map drawing or WGS84 coordinates.

Do not promise that the real data will always produce a “ควรตรวจ” result. The correct real outcome may instead be “มีผลเปรียบเทียบ” or “ข้อมูลยังไม่พอ”.

## Synthetic fallback

The deterministic fallback farm remains:

**สวนสาธิตเชียงใหม่ · ข้อมูลจำลอง**

It demonstrates:

- **ควรตรวจ**
- **มีผลเปรียบเทียบ**
- **ข้อมูลยังไม่พอ**
- **รอข้อมูล**

Synthetic acquisitions use provider `agriscope-demo`, are labelled **ข้อมูลสาธิต**, and never present a fake true-colour image as real Sentinel-2.

Use this fallback if CDSE prefetch has not been completed or when you need a guaranteed edge-case state.

## Live provider use

Ordinary non-demo fields retain the existing live CDSE behavior when credentials are configured.

A live search during a presentation should be treated as an optional bonus, not the main demo path.

The local demo is not a production-readiness, legal-compliance, or security-certification claim.
