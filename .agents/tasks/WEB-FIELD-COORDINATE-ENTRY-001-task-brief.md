# Task Brief

## Task ID

WEB-FIELD-COORDINATE-ENTRY-001

## Status

VERIFIED

## Title

เพิ่มจุดขอบเขตแปลงด้วยละติจูดและลองจิจูด

## Business goal

ผู้ใช้ที่มีพิกัดจากเอกสารสิทธิ์สามารถสร้างขอบเขตแปลงโดยกรอกพิกัดทีละจุด
ได้ โดยไม่ต้องกะตำแหน่งจากหมุดบนแผนที่เพียงอย่างเดียว

## User

- เจ้าของฟาร์มและผู้จัดการแปลงที่มีรายการพิกัดละติจูด/ลองจิจูด
- ผู้ใช้มือถือหรือผู้ใช้ที่ลากหมุดบนแผนที่ได้ไม่แม่นยำ

## Current behavior

- `FieldMap` เพิ่มจุดได้จากการคลิกแผนที่และปรับด้วยการลาก marker เท่านั้น
- การบันทึกส่ง GeoJSON Polygon ไปยัง API เดิม และ backend ตรวจ geometry กับ
  คำนวณพื้นที่จริง

## Expected behavior

- ใน editable `FieldMap` มีแผง `เพิ่มจุดด้วยพิกัด` ที่ใช้คีย์บอร์ดได้
- ผู้ใช้กรอกละติจูดก่อนและลองจิจูดหลัง แล้วเพิ่มจุดตามลำดับรอบขอบเขต
- ระบบตรวจค่าจำนวนจริง ช่วงละติจูด `-90..90` ช่วงลองจิจูด `-180..180`
  และไม่รับพิกัดที่ซ้ำกับจุดเดิม
- จุดถูกเก็บใน GeoJSON order `[longitude, latitude]`, marker และ vertex count
  อัปเดตทันที และแผนที่เลื่อนไปยังจุดที่เพิ่ม
- รายการพิกัดเรียงตามลำดับช่วยให้ตรวจทานได้; Undo และ Delete polygon เดิมยังทำงาน
- เมื่อมีอย่างน้อย 3 จุด ระบบปิดวงแหวนให้เฉพาะ payload; backend ยังคงเป็นแหล่งจริง
  สำหรับความถูกต้องของ polygon และพื้นที่
- การคลิกและลาก marker เดิมไม่เปลี่ยนพฤติกรรม

## Scope

- เพิ่ม coordinate-entry UI และ validation ใน editable `FieldMap`
- เพิ่ม focused browser evidence ใน journey สร้างแปลงเดิม

## Out of scope

- UTM, DMS, cadastral conversion, CSV/file import, geocoding, GPS-device import
- Backend/API/OpenAPI/migration/type changes
- Browser-authoritative area or geometry acceptance
- Field edit flow, satellite behavior, basemap/provider changes, new dependencies

## Dependencies

- Existing `GeoJsonPolygon` and `POST /api/v1/farms/{farm_id}/fields` contract
- Existing MapLibre map, markers, server geometry validation, and area calculation
- UI-V1 umbrella has no concurrent writer; ownership of the exact paths below is
  transferred to this bounded slice only

## Contracts

- UI labels use `ละติจูด` and `ลองจิจูด`; helper copy explains boundary order
- Input accepts decimal degrees only
- Validation errors are local, actionable, and do not clear valid existing points
- API payload remains exactly `{ name, geometry }`
- Organization permission and backend tenant scope remain unchanged

## Agent owners

- Lifecycle orchestrator and implementation: `/root`
- LOCAL_NATIVE code review: Ponytail / `code_review`

## File ownership

- `.agents/tasks/WEB-FIELD-COORDINATE-ENTRY-001-task-brief.md`
- `apps/web/components/FieldMap.tsx`
- `tests/e2e/field-001.spec.ts`
- Every other path is read-only; the existing WEB-SEC three-file owner work is
  unrelated and must remain untouched

## Security requirements

- Treat coordinate strings as untrusted input and reject invalid ranges before use
- No organization ID, token, credential, raw backend detail, or browser storage
- No client-only geometry or area becomes authoritative
- No external request is introduced by coordinate entry

## Test requirements

- TypeScript typecheck
- Production build
- Focused field E2E proves map-click behavior remains and coordinate entry creates
  an ordered four-point polygon that persists through the real API
- Invalid/duplicate coordinate feedback and keyboard submission are covered
- `git diff --check`

## Acceptance criteria

- A user can add at least three boundary points without clicking the map
- Latitude/longitude are visibly labelled and serialized in correct GeoJSON order
- Invalid, out-of-range, and duplicate points do not change geometry
- Existing click, drag, undo, delete, save, reload, tenant, and backend-area behavior
  does not regress
- No dependency, backend, API, migration, or unrelated owner-work change

## Definition of done

- Exact owned diff passes focused validation
- Ponytail returns `REVIEW_DECISION: APPROVED`
- Working tree is preserved for the lifecycle owner after LOCAL_NATIVE review

## Validation evidence

- TypeScript typecheck: PASS
- Next.js production build: PASS
- Focused real browser/API/PostGIS field journey: PASS, 1/1
- The journey proves the original map-click path, custom range and duplicate
  validation, keyboard submission, exact `[longitude, latitude]` serialization,
  backend persistence, authoritative area response, satellite metadata request,
  and reload persistence
- `git diff --check`: PASS
- No backend, API, migration, dependency, lockfile, or existing WEB-SEC owner-work
  byte changed by this slice

## Risks

- Users must enter points in boundary order; arbitrary ordering can still create an
  invalid/self-intersecting polygon that the backend will reject
- Decimal degrees are not equivalent to UTM or DMS coordinates printed on some
  land-title documents; those formats remain a later explicit product decision
