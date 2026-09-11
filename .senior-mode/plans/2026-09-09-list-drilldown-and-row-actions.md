# List drill-down + per-row Edit/Detail icons — Plan

Goal: คลิกชื่อในตารางให้ลงไปหา "ลูก" ทันที และย้ายทางเข้าแก้ไข/ดูรายละเอียดไปเป็น
2 icon ท้ายแถว เพื่อลดจำนวนคลิก

Current vs desired (Diff):
- now: ชื่อ Scenario → หน้า Scenario detail → กด "View Test Groups" (2 คลิกถึงลูก)
  ชื่อ Test Group → หน้า Test Group detail → "View Test Cases" (2 คลิก)
- want: ชื่อ Scenario → Test Groups list ทันที (1 คลิก)
  ชื่อ Test Group → Test Cases list ทันที (1 คลิก)
  ท้ายแถวทั้ง 3 ตาราง: [✎ Edit modal ในหน้า list] + [→ ไปหน้า Detail]
- ชื่อ Test Case ยังไป detail ของตัวเอง (ไม่มีลูก) แต่ได้ 2 icon เหมือนกัน

Out of scope / do NOT touch (Fence):
- หน้า Detail ทั้ง 3 ระดับ: การ์ด Manage (Move/Duplicate/Archive/Delete), ปุ่ม Edit
  ในหัวข้อ, ปุ่ม "View Test Groups"/"View Test Cases" — คงไว้ทั้งหมด
- `/projects` (ตาราง Project) — ผู้ใช้ไม่ได้ขอ
- Breadcrumb, FilterForm, Pagination, ตรรกะ RBAC ใน lib
- `/api/test-groups/[id]/test-cases` — response shape ต้องไม่เปลี่ยน

Risks & unknowns:
- **หลาย modal ในหน้าเดียว**: ตอนนี้ `?error=` + `openOnMount` มีสมมติฐานว่ามี modal
  เดียวต่อหน้า ถ้าไม่แยกว่าเป็นแถวไหน error จาก validation จะเปิด modal ทุกแถวพร้อมกัน
  → ต้องมี `?editId=<id>` ประกอบ
- **TestCase edit ต้องมี steps**: `listTestCasesForTestGroup` ไม่ include `steps` แต่
  `TestCaseForm` ต้องใช้ทำ `TestStepEditor` และ API route ก็เรียกฟังก์ชันเดียวกันอยู่
  → เพิ่ม opt-in argument ไม่แก้ default
- **สัดส่วน colgroup**: เพิ่มคอลัมน์ actions ต้องหั่น % ใหม่ให้รวม 100 (เพิ่งจัดไปรอบก่อน)
- ยังไม่มี icon-only link button ในระบบ (`IconButton` เป็น `<button>`)
- ตาราง Test Groups มีคอลัมน์ Reorder (ปุ่ม ↑↓ ที่ submit form) อยู่ท้ายแถวแล้ว —
  actions ใหม่ต้องไปต่อท้ายมัน ไม่ปนกัน

## Steps

1. **`IconLinkButton`** — files: `src/components/ui/Button.tsx`
   เพิ่ม export ใหม่: `Link` + `ICON_BUTTON_BASE_CLASS` + `VARIANT_CLASS` (แบบเดียวกับที่
   `LinkButton` ทำกับ `BASE_CLASS`) สำหรับ icon "→ ไปหน้า Detail"
   verify: `tsc` ผ่าน + หน้า list render `<a class="... size-9 ...">`

2. **`listTestCasesForTestGroup` opt-in steps** — files: `src/lib/test-cases.ts`
   เพิ่ม arg ตัวที่สอง `options: { includeSteps?: boolean } = {}`; ถ้า true ให้
   `include: { steps: { orderBy: { sequence: "asc" } } }`
   verify: API route ที่เรียกแบบเดิมยัง response เท่าเดิม (curl เทียบ field keys)

3. **Scenarios list** — files: `src/app/projects/[id]/scenarios/page.tsx`
   - ชื่อ → `/projects/{p}/scenarios/{s}/test-groups`
   - `searchParams` เพิ่ม `editId?: string`
   - server action `update(scenarioId)` แบบ closure ต่อแถว (ล้อ action ในหน้า detail
     ทุกฟิลด์ + tags) error → redirect กลับ list พร้อม `error` + `editId`
   - modal สร้างใหม่: `openOnMount={(!!error && !editId) || openNew === "1"}`
   - `<th>Actions</th>` + `<col>`; colgroup 54/23/23 → 46/20/20/14
   verify: curl หน้า list เจอ 2 ปุ่มต่อแถว, col รวม 100%, ชื่อ link ชี้ test-groups

4. **Test Groups list** — files: `.../test-groups/page.tsx`
   เหมือนข้อ 3 (ชื่อ → `.../test-groups/{g}/test-cases`, update action, editId)
   colgroup 12/46/21/21 → 10/38/18/20/14
   verify: เหมือนข้อ 3

5. **Test Cases list** — files: `.../test-cases/page.tsx`
   ชื่อคงไป detail; เพิ่ม 2 icon + update action (ใช้ `parseStepsJson`) ;
   เรียก `listTestCasesForTestGroup(testGroupId, { includeSteps: true })`
   colgroup 40/20/20/20 → 34/18/17/17/14
   verify: เหมือนข้อ 3 + แก้ไข test case ที่มี steps แล้ว steps ไม่หาย

6. **Verify รวม** — dev server + curl ทั้ง 3 หน้า: ตรวจ href ของชื่อ, จำนวน `<col>` = `<th>`,
   % รวม 100, `editId` เปิด modal ถูกแถว (ยิง `?error=x&editId=<id>` แล้วนับ
   `open` dialog), และ round-trip แก้ไขจริง 1 รายการต่อระดับแล้ว query DB ยืนยัน
   ปิดท้ายด้วย `tsc --noEmit` + `eslint src`
   หมายเหตุ: หน้าตาจริง (ขนาด/ระยะ icon) ต้องให้ผู้ใช้ดูใน browser
