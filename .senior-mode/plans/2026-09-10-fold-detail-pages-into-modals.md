# Fold the detail pages into the Create/Edit modals — Plan

Goal: ทุกอย่างที่ทำได้ในหน้า Detail ย้ายเข้า Modal แล้วลบหน้า Detail ทิ้ง
(Scenario / Test Group / Test Case)

Current vs desired (Diff):
- now: Modal แก้ได้แค่ฟิลด์ ส่วน Move / Duplicate / Archive / Delete และ
  (Test Case) Test Result / Assignee / Attachments อยู่แต่ในหน้า Detail
- want: Modal Edit ทำได้ครบ → ปุ่ม "Open full page" หายไป → ลบหน้า Detail ทั้ง 3

Out of scope / do NOT touch (Fence):
- หน้า Project detail (`/projects/[id]`) — ผู้ใช้ระบุแค่ 3 ระดับล่าง
- lib layer (`scenarios.ts` / `test-groups.ts` / `test-cases.ts` / `attachments.ts`)
  — ย้าย UI อย่างเดียว ไม่แตะ business logic หรือ audit log
- RBAC: ต้องคงพฤติกรรมเดิม รวมถึง `canEditFully` (ADMIN/QA_LEAD) ที่ปิด
  Manage ของ Test Case และ TESTER ที่แก้ Test Result ได้
- ตาราง/colgroup/accordion ที่เพิ่งทำ

Risks & unknowns:
- **ห้าม nest `<form>`**: `ConfirmForm` เป็น `<form>` ถ้าเอาไปวางในฟอร์ม Edit
  จะเป็น HTML ที่ผิดและ browser จะตัดทิ้งเงียบๆ → Manage ต้องเป็น sibling
  ของฟอร์ม ไม่ใช่ลูก
- **Deep link หาย**: ตอนนี้ทุก entity มี URL ของตัวเอง ถ้าลบหน้า Detail แล้ว
  breadcrumb / search / dashboard preview จะชี้ 404 — ต้องแก้ทั้งหมด
- **Attachment ใน modal**: upload แล้ว server action redirect → modal ปิด
  ผู้ใช้ต้องเปิดใหม่ถึงเห็นไฟล์ที่เพิ่งแนบ (ยอมรับได้ แต่ต้องบอก)
- Modal ของ Test Case จะยาวมาก (ฟอร์ม + steps + result + assignee +
  attachments + manage) — มี `max-h-[85vh] overflow-y-auto` รองรับอยู่แล้ว
- Modal Create ไม่ควรมี Manage (ยังไม่มีของให้ move/delete)

## Steps

1. **`EntityManageSection`** — files: `src/components/EntityManageSection.tsx` (ใหม่)
   ส่วน Manage ที่ใช้ร่วมกัน: ช่อง Move (Select + ปุ่ม) + Duplicate +
   Archive/Restore + Delete รับ action เป็น props ทั้งหมด
   วางเป็น sibling ใต้ `</form>` ใน children ของ Modal
   verify: `tsc` + ไม่มี `<form>` ซ้อนใน HTML ที่ render (นับ `<form` เทียบ `</form`)

2. **Scenario** — files: `src/app/projects/[id]/scenarios/page.tsx`
   ย้าย `move` / `duplicate` / `archive` / `restore` / `removeForever` จากหน้า
   detail มาเป็น action factory ต่อแถว; ส่ง `listProjectsForUserWithRole` มาทำ
   ตัวเลือก Move; redirect ทั้งหมดกลับ list
   verify: curl เห็นปุ่มครบในทุกแถว + ทดสอบ duplicate/archive จริงแล้วเช็ค DB

3. **Test Group** — files: `.../test-groups/page.tsx`
   เหมือนข้อ 2 (Move ใช้ `listScenariosForProject`)

4. **Test Case** — files: `.../test-cases/page.tsx`
   เหมือนข้อ 2 + `updateResult` (TESTER แก้ได้) + `changeAssignee` +
   attachments (list + upload, `encType="multipart/form-data"`)
   ต้องคง `canEditFully` gate; ต้องดึง attachments มาด้วย (ตอนนี้ list ดึงแค่ steps)

5. **ตัดทางเข้าเดิม** — files: 3 หน้า list, `DashboardView.tsx`,
   `src/lib/search.ts`, `src/lib/breadcrumb.ts`
   - ลบปุ่ม "Open full page" ทั้ง 3 จุด
   - dashboard preview "View full page" → ชี้หน้า list แทน
   - search result href → หน้า list แทน
   - `scenarioBreadcrumb` / `testGroupBreadcrumb` / `testCaseBreadcrumb`:
     ตัด segment สุดท้ายที่เป็นลิงก์ detail (เหลือเป็น text หรือชี้ list)
   verify: `git grep` ต้องไม่เหลือ href ที่ชี้ route ที่ถูกลบ

6. **ลบหน้า** — 3 detail pages + 6 หน้า new/edit เดี่ยวที่กำพร้าอยู่แล้ว
   verify: curl route เดิมต้องได้ 404; `tsc` + `eslint` + build ผ่าน;
   `git grep` ไม่เหลือ import ค้าง

7. **Verify รวม** — dev server: create / edit / move / duplicate / archive /
   restore / delete ครบทั้ง 3 ระดับ ยิงจริงแล้ว query DB ยืนยัน + เก็บกวาด
   ข้อมูลทดสอบ; ตรวจ RBAC ว่า TESTER ยังแก้ Test Result ได้และไม่เห็น Manage
