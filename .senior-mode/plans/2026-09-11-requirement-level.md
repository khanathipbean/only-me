# Requirement as a hierarchy level — Plan

Goal: Project → **Requirement** → Scenario → Test Group → Test Case
(สรุปจาก Feature docs มาเป็น Requirement แล้ว Requirement ครอบ Scenario)

Current vs desired (Diff):
- now: 4 ระดับ `Project → Scenario → Test Group → Test Case` โดย
  `Scenario.projectId` เป็น FK ตรงไปยัง Project (บังคับ ไม่ null)
- want: 5 ระดับ โดย Scenario สังกัด Requirement และ Requirement สังกัด Project

Out of scope / do NOT touch (Fence):
- Test Group / Test Case / TestStep / Attachment — โครงไม่เปลี่ยน
- RBAC: ยังคุมสิทธิ์ที่ระดับ Project เหมือนเดิม
- Audit Trail: ยังผูกกับ `projectId` เหมือนเดิม (แค่มี entityType ใหม่)

Risks & unknowns:
- **ขอบเขตกว้าง: 45 ไฟล์อ้างถึง Scenario** รวม 8 ไฟล์เทสต์, 11 route ใต้
  `/scenarios`, import parser/service, dashboard, search, breadcrumb
- **รันเทสต์ไม่ได้**: Application Control Policy บล็อก
  `schema-engine-windows.exe` → เทสต์ 8 ไฟล์ที่ต้องแก้จะพิสูจน์ไม่ได้ว่าผ่าน
  นี่คือความเสี่ยงที่ใหญ่ที่สุดของงานนี้
- **ข้อมูลจริงมีอยู่แล้ว**: 5 scenarios / 23 test groups / 69 test cases
  ทำ FK เป็น required ทันทีไม่ได้ ต้อง backfill ก่อน และ repo นี้ใช้
  `prisma db push` ไม่มี migrations ให้ย้อน → ต้องมีสคริปต์ backfill ของตัวเอง
- **`Scenario.projectId` จะซ้ำซ้อน** ถ้าเก็บไว้คู่กับ `requirementId`
  ย้าย Requirement ข้าม Project เมื่อไหร่ scenario จะชี้ผิดทันที

## การตัดสินใจที่ตกลงแล้ว

1. **ตัด `Scenario.projectId` ทิ้ง** แล้วหา projectId ผ่าน Requirement
   (โค้ดมี pattern นี้อยู่แล้วใน `getTestGroupWithProjectId` /
   `getTestCaseWithProjectId`) — แหล่งความจริงมีที่เดียว
2. **URL ซ้อนเต็มรูปแบบ**
   `/projects/[id]/requirements/[reqId]/scenarios/[scenarioId]/test-groups/[tgId]/test-cases/[tcId]`
3. **แบ่ง 2 เฟส** — เฟส 1 ใช้งานได้จริงโดยยังไม่รื้อ URL
4. **Module = entity ไม่ใช่ชั้นใน URL** — เป็น "เมนูหนึ่งเมนูของระบบที่ทดสอบ"
   (Dashboard, Workflow, Sprints …) เป็นคำศัพท์ควบคุมที่ใช้ร่วมกัน:
   Requirement สังกัด Module และ ProjectFile ก็ชี้ Module เดียวกัน แทนช่อง
   ข้อความอิสระที่ใช้อยู่ตอนนี้ (พิมพ์ "Dashboard" กับ "dashboard" จะแยกกลุ่ม)

## เฟส 1 — โครงสร้างข้อมูล + จัดการ Module/Requirement

1. schema: `model Module` (projectId, name, ลำดับ, deletedAt) +
   `model Requirement` (projectId, moduleId, code?, name, description,
   priority?, status, deletedAt) + `Scenario.requirementId` **nullable ก่อน**
   + `ProjectFile.moduleId` (ควบคู่ `module` เดิมไว้ก่อน)
   verify: `db push` ผ่าน ข้อมูลเดิมไม่หาย
2. สคริปต์ backfill: สร้าง Module จากค่า `ProjectFile.module` ที่มีอยู่ +
   Module/Requirement ตั้งต้นต่อ project แล้วผูก scenario เดิม
   verify: query ยืนยันว่าไม่เหลือ scenario ที่ `requirementId` เป็น null
   และไฟล์ทุกไฟล์มี `moduleId`
3. `lib/modules.ts` + `lib/requirements.ts`
4. หน้า `/projects/[id]/requirements` — จัดกลุ่มตาม Module + จัดการ Module
   verify: create/edit/archive/restore/delete จริงแล้วเช็ค DB
5. ช่อง Requirement ในฟอร์ม Scenario + ตัวกรองในหน้า Scenarios;
   หน้า Files เปลี่ยนช่อง Module เป็น dropdown
   verify: สร้าง scenario แล้วผูก requirement ได้จริง

## เฟส 2 — ให้ลำดับชั้นสะท้อนทุกที่

5. ตัด `Scenario.projectId`, เปลี่ยน RBAC ให้ resolve ผ่าน Requirement
6. ย้าย route ให้ซ้อน + breadcrumb + search + Dashboard tree + ProjectTabs
7. CSV import: เพิ่มคอลัมน์ Requirement + find-or-create ใน service
8. ทำ `Scenario.requirementId` เป็น required
9. แก้เทสต์ 8 ไฟล์ — **แจ้งชัดว่ารันไม่ได้จนกว่า IT จะปลดบล็อก**
