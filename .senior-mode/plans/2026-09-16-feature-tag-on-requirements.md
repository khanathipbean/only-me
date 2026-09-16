# Feature tag on Requirements — Plan

Goal: บอกได้ว่า Requirement หนึ่งเป็นของ Feature ย่อยไหนภายใน Module
(เช่น Module `Policy` มี Policy Center / Policy Template / Metric)

Current vs desired (Diff):
- now: `Requirement` มีแค่ `module` เป็นชั้นเหนือ ไม่มีที่บอก feature ย่อย
  โมดูลอย่าง `Policy` ที่มี 7 requirement คนละ feature จึงดูแยกไม่ออก
- want: ช่อง Feature (ไม่บังคับ) ต่อ Requirement + แสดงเป็น badge ในหน้า
  Requirements และใน Hierarchy ของ Dashboard + กรองด้วย Feature ได้ทั้งสองหน้า

Out of scope / do NOT touch (Fence):
- **ไม่เพิ่มชั้นใน URL และไม่เพิ่มชั้นใน tree ของ Dashboard** — Feature เป็น
  ป้ายกำกับ ไม่ใช่ระดับของลำดับชั้น (ต่างจาก Module/Requirement)
- `Scenario.tags` ที่มีอยู่ — คนละเรื่อง ไม่แตะ
- Test Group / Test Case / RBAC / Audit Trail — โครงไม่เปลี่ยน
- CSV import — ยังไม่เพิ่มคอลัมน์ Feature ในรอบนี้

Risks & unknowns:
- **ข้อความอิสระย่อมเพี้ยน**: "Policy Center" กับ "policy center" จะกลายเป็น
  คนละกลุ่ม — เหตุผลเดียวกับที่โปรเจกต์นี้เคยเลิกใช้ `ProjectFile.module`
  แบบข้อความอิสระ จึงต้อง normalize: trim แล้วถ้าชนกับค่าเดิมใน module
  เดียวกันแบบไม่สนตัวพิมพ์ ให้ใช้ตัวสะกดเดิม
- **แก้ schema บนฐานข้อมูลจริง**: เพิ่มคอลัมน์ nullable ไม่ทำข้อมูลหาย แต่
  Prisma 7 จัด `db push` เป็นคำสั่งอันตรายและต้องขอความยินยอมจากผู้ใช้ก่อน
- `DashboardFilters` เพิ่มคีย์ใหม่ = payload กับ `tests/dashboard.test.ts`
  ขยับตาม (ตอนนี้เทสต์รันได้แล้ว จึงพิสูจน์ได้จริง)

## การตัดสินใจที่ตกลงแล้ว

1. **ค่าเดียวต่อ Requirement** เก็บเป็น `feature String?` ไม่สร้างตารางใหม่
   ฟอร์มใช้ `<input list>` + `<datalist>` เสนอค่าที่เคยพิมพ์ใน module นั้น
   แต่พิมพ์ค่าใหม่ได้ (ยังไม่คุ้มที่จะทำเป็น entity เต็มรูป)
2. **Dashboard แสดงเป็น badge ข้างชื่อ Requirement** ไม่เพิ่มชั้นใน tree
3. **กรองด้วย Feature ได้ทั้งหน้า Requirements และ Dashboard**
4. Module ที่ไม่มี feature ย่อยก็ปล่อยว่างไว้ได้ ไม่บังคับ

## Steps

1. **schema** — `Requirement.feature String?` + `@@index([moduleId, feature])`
   verify: `db push` ผ่าน (ขอความยินยอมก่อน), ข้อมูลเดิมครบเท่าเดิม

2. **`src/lib/requirements.ts`** — `feature` ใน input/filters,
   `normalizeFeature` (ชนกับค่าเดิมแบบไม่สนตัวพิมพ์ → ใช้ตัวสะกดเดิม),
   `listFeaturesForModule` (distinct ของ module นั้น)
   verify: สร้าง 2 requirement ด้วย "Policy Center" กับ "policy center"
   แล้วต้องได้ feature เดียวกัน

3. **ฟอร์ม + หน้า Requirements** — `RequirementForm` เพิ่มช่อง Feature
   (datalist), ตารางเพิ่ม badge ใต้/ข้างชื่อ, filter bar เพิ่ม Feature
   verify: สร้าง/แก้/กรองจริงผ่านฟอร์ม แล้วเช็ค DB

4. **Dashboard** — `DashboardFilters.feature`, tree ส่ง `feature` มากับ
   requirement node, `DashboardView` แสดง badge + ตัวกรอง Feature
   (ผูก cascade ต่อจาก Module เหมือนตัวอื่น)
   verify: ยิง API จริงทั้งกรองและไม่กรอง เทียบตัวเลขกับ DB

5. **Verify รวม** — `tsc`, `eslint`, `npm test` (114 เทสต์ต้องยังผ่าน),
   `npm run build`, ยิงทุกหน้า 200 แล้วเก็บกวาดข้อมูลทดสอบ
