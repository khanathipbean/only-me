# Inline detail accordion on the list rows — Plan

Goal: กดปุ่ม `>` ท้ายแถวแล้ว slide เปิดแผง Detail ใต้แถวนั้นในหน้าเดิม แทนการ
redirect ไปหน้า Detail

Current vs desired (Diff):
- now: `>` เป็น `IconLinkButton` → navigate ไปหน้า Detail (เพิ่งทำใน 5f29c36)
- want: `>` เป็นปุ่ม toggle, chevron หมุน 90°, แผงข้อมูลสไลด์ลงมาใต้แถว
  ยังต้องมีทางไปหน้า Detail เต็ม (ที่มีการ์ด Manage) → ปุ่มในแผง

Out of scope / do NOT touch (Fence):
- ชื่อรายการยัง drill-down ลงลูกเหมือนเดิม (Scenario→Test Groups, Test Group→Test Cases)
- ปุ่ม ✎ Edit modal + `?editId=` — ไม่แตะ
- หน้า Detail ทั้ง 3 ระดับ, การ์ด Manage, คอลัมน์ Reorder
- data layer: ไม่เพิ่ม query ใหม่ — ใช้ฟิลด์ที่ list ดึงมาอยู่แล้ว
  (Scenario/TestGroup = ทั้ง row, TestCase = ทั้ง row + steps ที่เพิ่ง include ไป)

Risks & unknowns:
- `<tr>` animate height ไม่ได้ → ต้องใส่ wrapper ใน `<td colSpan>` แล้ว transition
  `grid-template-rows: 0fr → 1fr` (วิธีมาตรฐานปัจจุบัน) + `overflow-hidden`
- แผงตอนปิดยังอยู่ใน DOM (จำเป็นสำหรับ animation) → screen reader/Tab ยังเข้าถึงได้
  ถ้าไม่กัน → ใส่ `inert` + `aria-hidden` ตอนปิด
- เส้น border ซ้อนกันระหว่างแถว summary กับแถวแผง → เอา border ออกจาก td ของแผง
- animation จริงตรวจด้วย curl ไม่ได้ ต้องให้ผู้ใช้ดูใน browser
- ไม่มี `<Link>` แล้ว = เสีย prefetch ของหน้า Detail (ยอมรับได้ มีปุ่มในแผงแทน)

## Steps

1. **`ExpandableRow` + `DetailField`** — files: `src/components/ui/ExpandableRow.tsx` (ใหม่)
   client component: render `<tr>` summary (cells + ช่อง actions ที่รับ `actions`
   slot สำหรับ Edit modal + ปุ่ม chevron toggle) และ `<tr>` แผงที่ slide
   `aria-expanded` / `aria-controls` / `inert` ตอนปิด
   verify: `tsc` + หน้า list render 2 `<tr>` ต่อ 1 รายการ, `aria-expanded="false"`

2. **Scenarios list** — files: `src/app/projects/[id]/scenarios/page.tsx`
   ห่อแถวด้วย `ExpandableRow` (colSpan 4); แผงแสดง Expected Result, Description,
   Preconditions, Test Data, Steps, Tags + ปุ่ม "Open full page"
   verify: curl เจอ `aria-controls` ตรงกับ id ของแผง, ยังมีปุ่ม ✎ ครบ

3. **Test Groups list** — files: `.../test-groups/page.tsx`
   colSpan 5; แผงแสดง Description, Test Objective, Sequence
   verify: เหมือนข้อ 2

4. **Test Cases list** — files: `.../test-cases/page.tsx`
   colSpan 5; แผงแสดง Condition, Preconditions, Test Data, Expected Result,
   Test Result, Assignee + Test Steps (เรียงเลข)
   verify: เหมือนข้อ 2 + steps โผล่ในแผงจริง

5. **Verify รวม** — dev server + curl ทั้ง 3 หน้า, `tsc --noEmit`, `eslint src`
   หมายเหตุ: การสไลด์/หมุน chevron ต้องให้ผู้ใช้ดูใน browser
