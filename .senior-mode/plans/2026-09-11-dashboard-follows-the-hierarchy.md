# Dashboard follows the new hierarchy — Plan

Goal: Dashboard สะท้อนลำดับชั้น 5 ระดับ หลังจาก Module/Requirement กลายเป็น
ชั้นจริงใน commit `e3e1a2d`

Current vs desired (Diff):
- now: การ์ด "Hierarchy" เริ่มที่ Scenario (3 จาก 5 ชั้น) — scenario จากทุก
  module มากองรวมกันโดยไม่บอกว่าอยู่ module ไหน; Overview นับแค่ Scenarios /
  Test Groups / Test Cases; ตัวกรองมีแต่ช่องพิมพ์ "Scenario ID" / "Test Group
  ID" ด้วยมือ ไม่มี Module/Requirement เลย
- want: tree 5 ชั้น `Module > Requirement > Scenario > Test Group > Test Case`,
  Overview นับ Modules/Requirements ด้วย, และตัวกรองทั้ง 4 ชั้นเป็น dropdown
  ที่ผูกกันแบบ cascade

Out of scope / do NOT touch (Fence):
- ตัวเลข/สูตรที่มีอยู่ — Test Progress, breakdown ตาม result/priority/assignee
  คิดจาก Test Case เหมือนเดิม ห้ามเปลี่ยนความหมาย
- Preview modal และ `PREVIEW_ENDPOINT` — Module/Requirement ไม่มี API
  รายตัว จึงไม่มี preview (คลิกได้แค่ขยาย/ยุบ)
- ตัวกรองอื่น (result/priority/status/assignee/tags/วันที่) และหน้าอื่นทั้งหมด

Risks & unknowns:
- **ตัวเลือกใน dropdown ต้องไม่ถูกกรอง**: ถ้าเอารายการจาก tree ที่กรองแล้ว
  พอเลือก module หนึ่ง ตัวเลือกที่เหลือจะหายจนสลับไป module อื่นไม่ได้ →
  ต้องส่งรายการแบบไม่กรองมาต่างหาก
- **payload โตขึ้น**: เพิ่ม options 4 ชุด (ตอนนี้ 5 modules / 1 requirement /
  5 scenarios / 23 test groups) เล็กพอ แต่ต้องส่งแค่ id+name+parentId
- **เปลี่ยนรูป `tree`** จาก `DashboardScenarioNode[]` เป็น
  `DashboardModuleNode[]` → `tests/dashboard.test.ts` ที่ assert `result.tree`
  ต้องแก้ และ **ยังรันไม่ได้** (Application Control Policy บล็อก
  `prisma db push` ใน global setup) — ต้องพิสูจน์ด้วยการยิง API จริงแทน
- คนที่บุ๊กมาร์ก dashboard พร้อม `?scenarioId=` เดิมยังใช้ได้ (คีย์ไม่เปลี่ยน)

## Steps

1. **`src/lib/dashboard.ts`** — `DashboardFilters` เพิ่ม `moduleId` /
   `requirementId`; tree ซ้อนเป็น Module > Requirement > Scenario;
   `counts` เพิ่ม `modules` / `requirements`; เพิ่ม `options` (4 ชุด
   ไม่กรอง) ในผลลัพธ์
   verify: เรียก `getProjectDashboard` จริงแล้วตัวเลขตรงกับ DB

2. **`src/app/api/projects/[id]/dashboard/route.ts`** — รับ `moduleId` /
   `requirementId` จาก query
   verify: `?moduleId=` แล้ว tree เหลือ module เดียว

3. **`src/components/DashboardView.tsx`** — วาด tree 5 ชั้น (Module/
   Requirement ไม่มี preview), Overview เพิ่ม 2 ตัวเลข, และเปลี่ยนช่อง
   Scenario ID / Test Group ID เป็น dropdown พร้อมเพิ่ม Module / Requirement
   โดยเลือกตัวบนแล้วตัวล่างกรองตาม และล้างค่าที่ไม่เข้าพวก
   verify: ยิงหน้า dashboard จริง คลิกครบทุกชั้น ลิงก์ยังพาไป URL ซ้อนถูก

4. **`tests/dashboard.test.ts`** — ปรับ assertion ให้ตรงรูป tree ใหม่
   verify: `tsc` + `eslint` ผ่าน — **แจ้งชัดว่ารันเทสต์ไม่ได้**

5. **Verify รวม** — `tsc`, `eslint`, `npm run build`, ยิง dashboard API
   ทั้งแบบไม่กรองและกรองทีละชั้น เทียบตัวเลขกับ DB แล้วเก็บกวาดข้อมูลทดสอบ
