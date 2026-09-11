# Module as the navigation root — Plan

Goal: แท็บ **Module** แทน Requirement โดยไล่ลงชั้นได้เหมือนแท็บ Scenario เดิม
`Modules → Requirements → Scenarios → Test Groups → Test Cases`

Current vs desired (Diff):
- now: แท็บ `Requirements` (แบน ทั้ง project) + แท็บ `Scenarios` (แบน) แล้วค่อยซ้อน
  `/scenarios/[scenarioId]/test-groups/...` — Module เป็นแค่คำศัพท์ควบคุม
  (`Requirement.moduleId` nullable) ไม่ใช่ชั้นใน URL
- want: แท็บเดียวคือ `Modules` เป็นประตูเข้า แล้ว URL ซ้อนเต็มรูป
  `/projects/[id]/modules/[moduleId]/requirements/[reqId]/scenarios/[scenarioId]/test-groups/[tgId]/test-cases/[tcId]`

> หมายเหตุ: แผนนี้ **กลับข้อตกลงข้อ 4** ของ `2026-09-11-requirement-level.md`
> ("Module = entity ไม่ใช่ชั้นใน URL") ตามที่ผู้ใช้สั่งใหม่ และกินงานเฟส 2
> ข้อ 6 (ย้าย route) กับข้อ 8 (ทำ requirementId เป็น required) เข้ามาด้วย

Out of scope / do NOT touch (Fence):
- **API routes ทั้งหมด** — เป็น `/api/...` แบนอยู่แล้ว ไม่ได้อิง path ของหน้า
  (`/api/scenarios/[id]/...`, `/api/test-groups/...`) ห้ามแตะ shape
- **`Scenario.projectId`** — ยังเก็บไว้ ไม่ตัดในรอบนี้ (เฟส 2 ข้อ 5 แยกต่างหาก)
  URL ซ้อนพา projectId มาให้อยู่แล้ว การตัดคอลัมน์เป็นความเสี่ยงคนละก้อน
- Test Group / Test Case / TestStep / Attachment — โครงข้อมูลไม่เปลี่ยน
- RBAC — ยังคุมที่ระดับ Project เหมือนเดิม
- แท็บ Overview / Dashboard / Audit Trail / Files / Import

Risks & unknowns:
- **ลิงก์เดิมพังหมด** — href ของชั้นล่างต้องมี `moduleId` + `requirementId`
  เพิ่ม แปลว่า `search.ts` (3 จุด) และ `dashboard.ts` / `DashboardView.tsx`
  (4 จุด) ต้อง select ความสัมพันธ์ขึ้นไปถึง Module ด้วย ไม่งั้นสร้าง URL ไม่ได้
- **บุ๊กมาร์กเดิมของผู้ใช้จะ 404** — `/projects/[id]/scenarios/...` หายทั้งชุด
- **ทำ `moduleId` / `requirementId` เป็น required** ต้อง backfill ก่อน
  ตอนนี้มี requirement 1 แถว ("Unassigned") ที่ยังไม่มี module
- **รันเทสต์ไม่ได้** — Application Control Policy บล็อก `schema-engine-windows.exe`
  เทสต์ 8 ไฟล์ที่อ้าง Scenario จะพิสูจน์ไม่ได้ว่าผ่าน (ความเสี่ยงเดิมของงานนี้)
- ระดับซ้อน 5 ชั้นทำให้ breadcrumb ยาว — ใช้ pattern เดิมที่ชื่อ entity เป็น
  segment และชี้ไปลิสต์ของลูก (ไม่มี segment ซ้ำ URL เดียวกัน)

## การตัดสินใจที่ตกลงแล้ว

1. **Requirement ต้องมี Module เสมอ** — `moduleId` เป็น required
   (สร้าง module ก่อนถึงจะสร้าง requirement ได้)
2. **URL ซ้อนใต้ module เต็มรูป**
3. **ลบแท็บ Scenarios** — เหลือ Modules เป็นทางเข้าทางเดียว
   การค้นข้ามโมดูลใช้ Search บน header ที่มีอยู่แล้ว

## Steps

1. **Backfill + schema** — files: `prisma/schema.prisma`,
   `scripts/backfill-module-required.ts` (ใหม่)
   สร้าง Module ตั้งต้นต่อ project ให้ requirement ที่ยังไม่มี แล้วทำ
   `Requirement.moduleId` + `Scenario.requirementId` เป็น required
   verify: `db push` ผ่าน, query ยืนยันไม่เหลือแถว null, ข้อมูลเดิมครบ
   (1 project / 4 modules / 1 requirement / 5 scenarios / 23 TG / 69 TC)

2. **`lib/modules.ts`** — เพิ่ม `listModulesForProjectPage` พร้อมจำนวน
   requirement (นับเฉพาะ `deletedAt: null` เหมือนที่แก้ให้ requirement แล้ว)
   verify: เรียกจริงแล้วตัวเลขตรงกับ DB

3. **`lib/breadcrumb.ts`** — เขียน chain ใหม่ให้เริ่มที่ Modules
   verify: ทุกหน้าชั้นล่างมี breadcrumb ที่คลิกขึ้นไปได้ครบทุกชั้น

4. **ย้าย route** — files: สร้าง `/projects/[id]/modules/page.tsx` (ลิสต์ module
   + จัดการ module ที่ตอนนี้อยู่ใน modal), ย้ายหน้า requirements ไป
   `/modules/[moduleId]/requirements/page.tsx`, ย้าย 4 ไฟล์ใต้ `/scenarios`
   ไปอยู่ใต้ `/requirements/[requirementId]/` แล้วลบ tree เดิมทั้งสอง
   verify: ทุก path ใหม่ 200, path เดิม 404, ไม่มีฟอร์ม `javascript:throw`

5. **ตัวสร้างลิงก์** — files: `src/lib/search.ts`, `src/lib/dashboard.ts`,
   `src/components/DashboardView.tsx`, `src/components/ProjectTabs.tsx`
   select relation ขึ้นไปถึง module แล้วประกอบ URL ใหม่; แท็บเหลือ `Modules`
   verify: คลิกผลลัพธ์จาก Search และจาก Dashboard tree แล้วไปถึงหน้าที่ถูก

6. **Verify รวม** — `tsc` + `eslint`, ทุกหน้า 200, ไล่คลิกจาก Modules ลงถึง
   Test Case จริง, archive/restore ยังทำงาน, แล้วเก็บกวาดข้อมูลทดสอบ
   — และ**แจ้งชัดว่าเทสต์ 8 ไฟล์รันไม่ได้**จนกว่า IT จะปลดบล็อก
