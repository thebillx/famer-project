# AgriScope Local Demo

Local walkthrough instructions for the deterministic demo dataset.
## Goal

The local demo proves the product flow without requiring live satellite-provider availability:

- sign in to a real local account;
- open a seeded farm with four saved field boundaries;
- see farm-level states for inspection, measurable comparison, insufficient data, and first observation;
- inspect cached observation history;
- view cached NDVI and spatial comparison;
- create another field by drawing on the map or entering WGS84 coordinates.

Seeded satellite evidence is synthetic and is labelled **ข้อมูลสาธิต**. It is not presented as a real Sentinel-2 preview.

## Start

Prerequisites:

- Docker with Compose support.
- Node.js and npm versions required by the repository.
- JavaScript dependencies already installed.
- Python 3.12 with the repository API/test dependencies.

From the repository root:

```bash
npm run demo
```

The launcher starts local PostGIS, applies migrations, refreshes the deterministic
demo data, starts FastAPI on port 8000, and starts Next.js on port 3000.

Open `http://localhost:3000/login`. The launcher prints the local demo sign-in
details. Press Ctrl-C in that terminal to stop the API and web processes.

## Suggested walkthrough

1. Open **สวนสาธิตเชียงใหม่ · ข้อมูลจำลอง**.
2. Show **แปลงเหนือ · ควรตรวจ (สาธิต)** as the priority field.
3. Open that field and switch between NDVI and the NDVI-decrease area.
4. Show **แปลงกลาง · มีผลเปรียบเทียบ (สาธิต)**.
5. Show **แปลงใต้ · ข้อมูลยังไม่พอ (สาธิต)**.
6. Show **แปลงใหม่ · รอข้อมูล (สาธิต)**.
7. Create a new farm and demonstrate map drawing or coordinate entry.

The demo observation source is shown as **ข้อมูลสาธิต** and does not request a
live true-colour preview. Cached NDVI and change evidence use the same application
contracts as normal observations.

## Re-running

The seed is idempotent. Running `npm run demo` again refreshes the known local demo
identity, farm, fields, and cached analyses rather than creating another copy.

## Optional live provider use

The seeded demo does not require live CDSE credentials. When valid provider
credentials are supplied separately, newly searched real fields keep their existing
live-provider behavior.

The local demo is not a production-readiness or security-certification claim.
