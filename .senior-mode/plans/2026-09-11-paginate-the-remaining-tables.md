# Paginate the remaining tables — Plan

Goal: ตาราง Projects / Scenarios / Test Groups / Test Cases แบ่งหน้าได้
เหมือน Audit Trail ไม่ให้แถวยาวไม่จำกัด

Current vs desired (Diff):
- now: มีแต่ Audit Trail ที่แบ่งหน้า อีก 4 ตาราง `findMany` ทั้งหมดแล้ว render ทุกแถว
- want: ทั้ง 4 ตารางมี Prev/Next + Rows per page (default 10) แบบเดียวกัน
  พร้อม `?page=` / `?pageSize=` ใน URL

Out of scope / do NOT touch (Fence):
- หน้า Audit Trail — ทำไปแล้ว
- API routes ทั้ง 4 ตัวที่เรียก list function เดิม ต้องได้ response shape เท่าเดิม
- ตัวเลือก Move (`listScenariosForProject` ใน test-groups page) และ action
  reorder (`listTestGroupsForScenario` แบบไม่แบ่งหน้า) — สองจุดนี้ต้องเห็น
  "ทั้งหมด" เสมอ ห้ามถูกตัดด้วย paging
- `Pagination` component — ใช้ซ้ำได้เลย ไม่ต้องแก้ (ยกเว้นคอมเมนต์ที่อ้าง
  `DEFAULT_PAGE_SIZE` ใน audit-log)

Risks & unknowns:
- **เปลี่ยน return shape = พังหลายที่**: list function ปัจจุบันคืน array และมี
  ผู้เรียก 10 จุด ถ้าเปลี่ยนเป็น `{items,total,…}` ต้องแก้ทุกจุดรวม API
  → เพิ่มฟังก์ชัน `…Page` แยก ให้ของเดิมคงสภาพ (แบบเดียวกับที่เคยทำกับ
  `listTestCasesWithStepsForTestGroup`)
- **Test Groups เรียงเอง (sequence) + มีปุ่ม ↑↓**: ย้ายแถวข้ามหน้าแล้วจะหายไป
  จากหน้าที่ดูอยู่ ต้องยอมรับ/บอกผู้ใช้ และ action reorder ต้องอ่านรายการเต็ม
- **หน้าหลุดช่วง**: กรองแล้วเหลือหน้าเดียวแต่ URL ยังค้าง `page=5` →
  `sanitizePositiveInt` + clamp `page` ไม่ให้เกิน `totalPages`
- ต้องนับ `total` เพิ่มอีก 1 query ต่อหน้า (ยิงคู่ขนานกับ findMany)

## Steps

1. **`src/lib/pagination.ts`** (ใหม่) — ย้าย `DEFAULT_PAGE_SIZE` (10),
   `MAX_PAGE_SIZE` (100), `sanitizePositiveInt` ออกจาก `audit-log.ts` มาไว้ที่
   เดียว แล้วให้ audit-log import กลับ
   verify: `tsc` + หน้า Audit Trail ยังแบ่งหน้าเหมือนเดิม

2. **`listProjectsForUserPage`** — files: `src/lib/projects.ts`
   แยก where-clause เดิมออกเป็น helper ให้ทั้งเวอร์ชัน array และ page ใช้ร่วม
   verify: `/api/projects` response เท่าเดิม (เทียบ key)

3. **`listScenariosForProjectPage`** — files: `src/lib/scenarios.ts` (เหมือนข้อ 2)

4. **`listTestGroupsForScenarioPage`** — files: `src/lib/test-groups.ts`
   ของเดิมยังต้องมีสำหรับ action reorder

5. **`listTestCasesWithStepsForTestGroupPage`** — files: `src/lib/test-cases.ts`

6. **ต่อ UI 4 หน้า** — เพิ่ม `page`/`pageSize` ใน searchParams, เรียกเวอร์ชัน
   page, วาง `<Pagination>` ใต้ตาราง
   verify: curl ดู `?page=2` ได้แถวคนละชุด, `?pageSize=` ทำงาน, filter + paging
   อยู่ร่วมกันได้, และเปลี่ยน filter แล้ว `page` หลุดออกจาก URL

7. **Verify รวม** — `tsc` + `eslint`, ทุกหน้า 200, API 4 ตัว shape เดิม,
   หน้าเกินช่วงถูก clamp, และ reorder ของ Test Group ยังสลับถูกตำแหน่ง
