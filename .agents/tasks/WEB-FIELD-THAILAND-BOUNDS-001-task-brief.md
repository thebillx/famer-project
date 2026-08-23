# Task Brief

## Task ID

WEB-FIELD-THAILAND-BOUNDS-001

## Status

VERIFIED

## Title

จำกัดการสร้างขอบเขตแปลงให้อยู่ในกรอบพื้นที่ให้บริการประเทศไทย

## Business goal

ลดการปักหรือกรอกพิกัดผิดประเทศในช่วงที่ AgriScope เปิดให้บริการเฉพาะประเทศไทย
โดยยังไม่กล่าวอ้างว่าเป็นการตรวจเขตแดนหรือโฉนดทางกฎหมาย

## User

- เจ้าของฟาร์มและผู้จัดการแปลงในประเทศไทย
- ผู้ใช้ที่เพิ่มจุดจากแผนที่ พิกัดทศนิยม หรือตำแหน่งปัจจุบัน

## Confirmed research

- MapLibre รองรับ `maxBounds` เพื่อจำกัดการเลื่อนแผนที่ และใช้ลำดับ
  `[[west, south], [east, north]]`
- ข้อมูลภูมิศาสตร์ภาครัฐระบุช่วงประเทศไทยประมาณ 5°37′–20°27′ N และ
  97°22′–105°37′ E
- MVP ใช้กรอบ WGS84 ที่ปัดออกด้านนอกเป็น
  `west=97.34`, `south=5.61`, `east=105.64`, `north=20.47`
- กรอบสี่เหลี่ยมนี้ครอบคลุมพื้นที่ประเทศเพื่อนบ้านและทะเลบางส่วน จึงเป็นเพียง
  “กรอบพื้นที่ให้บริการประเทศไทยโดยประมาณ” ไม่ใช่เส้นเขตแดนทางกฎหมาย
- แหล่งอ้างอิง:
  - https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/
  - https://maplibre.org/maplibre-gl-js/docs/examples/restrict-map-panning-to-an-area/
  - https://thailand.go.th/issue-focus-detail/009_141
  - https://data.go.th/dataset/0205_12_0702

## Current behavior

- editable `FieldMap` เริ่มที่ประเทศไทย แต่ยังเลื่อน คลิก ลาก marker กรอกพิกัด
  และใช้ตำแหน่งปัจจุบันนอกประเทศไทยได้
- backend ตรวจชนิด/ring/range/self-intersection/area แต่ยอมรับ geometry ทั่วโลก
- read-only map แสดง geometry ที่มีอยู่โดยไม่จำกัดขอบเขต

## Expected behavior

- editable map จำกัดการเลื่อนด้วยกรอบประเทศไทยโดยประมาณ
- การคลิกแผนที่ กรอกพิกัด ลาก marker และใช้ตำแหน่งปัจจุบัน ใช้ predicate
  inclusive ชุดเดียวกัน
- พิกัดนอกกรอบแสดงข้อความภาษาไทย ไม่เพิ่ม/เปลี่ยนจุด และไม่เลื่อนแผนที่
- การลาก marker ออกนอกกรอบย้อนกลับไปจุดเดิม
- coordinate inputs แสดงช่วงที่รับได้และอธิบายว่าเป็น WGS84 decimal degrees
- backend ปฏิเสธ create/update ที่มีตำแหน่งใดอยู่นอกกรอบเดียวกันด้วย
  `422 invalid_geometry`
- read-only map ไม่ถูกจำกัด เพื่อไม่ซ่อนข้อมูลเดิมที่อาจมีอยู่

## Scope

- กรอบประเทศไทยโดยประมาณใน editable `FieldMap`
- server-authoritative bounding-box validation ใน geometry helper เดิม
- อัปเดต OpenAPI create/update validation text
- focused unit/browser evidence สำหรับ accepted/rejected boundary behavior

## Out of scope

- เส้นเขตแดนประเทศไทยแบบ MultiPolygon หรือการรับรองเขตทางกฎหมาย
- การตรวจสอบรูปแปลงกับโฉนด ตำบล อำเภอ จังหวัด หรือแนวเขตปกครอง
- DMS/UTM conversion, reverse geocoding, address search, file import
- การเพิ่ม dependency, migration, endpoint, shared codegen หรือ data asset
- satellite preview/NDVI/analysis และ production deployment
- `tests/integration/test_foundation_api.py` ซึ่งเป็น owner work ของ WEB-SEC

## Dependencies

- Ponytail-approved `WEB-FIELD-COORDINATE-ENTRY-001` implementation
- Existing MapLibre `maxBounds`, GeoJSON `[longitude, latitude]`, farm service,
  and backend-authoritative geometry/area flow
- Ownership of `FieldMap.tsx` and `field-001.spec.ts` transfers from the completed
  coordinate-entry slice to this successor; no concurrent writer is active

## Contracts

- Canonical bounds are inclusive WGS84 decimal degrees:
  `97.34 <= longitude <= 105.64` and `5.61 <= latitude <= 20.47`
- UI copy uses “กรอบพื้นที่ให้บริการประเทศไทยโดยประมาณ” and never claims exact,
  legal, cadastral, title-deed, or administrative-boundary validation
- API request and response shapes remain unchanged
- Backend remains authoritative for geometry acceptance and area calculation
- Existing tenant/role/CSRF/error contracts remain unchanged

## Agent owners

- Lifecycle orchestrator and implementation: `/root`
- Read-only bounds research: `/root/thailand_bounds_research`
- LOCAL_NATIVE code review: Ponytail / `code_review`

## File ownership

- `.agents/tasks/WEB-FIELD-THAILAND-BOUNDS-001-task-brief.md`
- `apps/web/components/FieldMap.tsx`
- `packages/geospatial/agriscope_geospatial/field_geometry.py`
- `tests/unit/test_field_geometry.py`
- `tests/e2e/field-001.spec.ts`
- `docs/api/openapi.yaml`
- Every other path is read-only; preserve the unrelated WEB-SEC three-file owner work

## Security requirements

- Server rejects out-of-bounds geometry even when the browser is bypassed
- No organization ID, token, credential, raw backend detail, or external request
- Browser checks are usability controls and never replace backend enforcement
- Existing tenant scope and indistinguishable foreign-resource behavior remain intact

## Test requirements

- Geometry unit tests cover valid Chiang Mai, inclusive edges, and one point just
  outside west/east/south/north
- Focused browser journey covers Thailand-specific coordinate rejection with no
  vertex mutation, valid coordinate order, save/reload, and existing click behavior
- Python contract suite parses the updated OpenAPI
- TypeScript typecheck and production build
- `git diff --check`

## Acceptance criteria

- Editable maps cannot intentionally add or retain a point outside the configured
  service rectangle through click, form, marker drag, or geolocation
- Backend create/update cannot persist a polygon with an out-of-bounds position
- Edge values are accepted inclusively; existing Chiang Mai fixture persists and
  its server-calculated area remains authoritative
- Read-only geometry remains visible
- No dependency, migration, endpoint, unrelated owner-work, or legal-boundary claim

## Definition of done

- Exact owned diff passes focused validation
- Ponytail returns `REVIEW_DECISION: APPROVED`
- Working tree is preserved for the lifecycle owner after LOCAL_NATIVE review

## Validation evidence

- Read-only research compared MapLibre's official `maxBounds` contract, Thai
  government extent metadata, and exact-boundary alternatives: PASS
- Python unit and contract suites: PASS, 76/76
- TypeScript typecheck: PASS
- Next.js production build: PASS
- Focused real browser -> FastAPI -> PostGIS journey: PASS, 1/1
  - four UI inputs just outside west/east/south/north are rejected without mutation
  - accepted numeric ranges are visible and the shared bounds alert remains visible
    while the coordinate-entry panel is closed
  - direct authenticated API bypass outside the west bound returns
    `422 invalid_geometry` and persists zero fields
  - valid Chiang Mai points retain `[longitude, latitude]`, persist, reload, and
    return server-authoritative area plus deterministic satellite metadata
- `git diff --check`: PASS
- Unrelated WEB-SEC owner bytes were preserved and excluded from this validation

## Risks

- A rectangle cannot prove a point is geographically inside Thailand; an exact
  national-boundary feature requires a separately licensed/versioned authoritative
  polygon, provenance policy, and server `covers` semantics
- Near-border coordinates may still fall inside this approximate service rectangle
  while physically lying in a neighboring country or water
