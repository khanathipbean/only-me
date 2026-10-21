# กำหนดเวลาแก้ไข และการเด้งกลับเมื่อยังพัง — Plan

Goal: งานที่ส่งให้ Dev มีกำหนดส่งตามระดับความสำคัญ เลยกำหนดแล้วเห็นชัด
และงานที่ทดสอบซ้ำแล้วยังพังกลับไปหาคนเดิมเองโดยไม่ต้องรอใครจำ

Current vs desired (Diff):
- ตอนนี้ `TestCase.workState` ไม่มีกำหนดเวลาเลย → ต้องมี `dueAt` ที่ตั้งตอน assign
- ตอนนี้ผลใหม่ทุกค่า (ยกเว้น NOT_RUN) ปิดวงจรเหมือนกันหมด รวมทั้ง FAILED
  → FAILED ต้องเด้งกลับหา Dev คนเดิมพร้อมกำหนดส่งใหม่

## สิ่งที่ผู้ใช้ตัดสินใจแล้ว

  วันทำการ (จันทร์–ศุกร์) ไม่มีปฏิทินวันหยุด
  CRITICAL 1 · HIGH 3 · MEDIUM 5 · LOW 7
  นับจากตอน assign
  เลยกำหนด → การ์ดขึ้นสีแดง + ดันขึ้นบนสุด
  ทดสอบซ้ำแล้วยัง Fail → เด้งกลับหา Dev คนเดิม

## เก็บ ไม่ใช่คำนวณสด

`Project.endDate` กับ `TestRun.endsOn` เก็บวันที่ไว้จริงแล้วค่อยเทียบกับวันนี้
(`src/lib/deadlines.ts`) อันนี้ทำแบบเดียวกัน เพราะกำหนดส่งคือสัญญาที่ให้ไว้ ณ
วันที่รับงาน — แก้ตาราง SLA ทีหลังไม่ควรย้อนไปขยับกำหนดส่งของงานที่รับไปแล้ว
และต่อเวลาเฉพาะ case ได้

  TestCase.dueAt  DateTime?   null = ไม่มีงานค้าง

ตั้งเมื่อไหร่ ล้างเมื่อไหร่:

  assign ให้คนใหม่        ตั้งใหม่เต็มช่วงตามระดับ ณ ตอนนั้น
  save คนเดิมซ้ำ          ไม่ขยับ — ไม่อย่างนั้นกดซ้ำคือต่อเวลา
  เปลี่ยน priority ทีหลัง  ไม่ขยับ — สัญญาให้ไว้แล้ว
  ถอนงานคืน / ปิดวงจร     null
  เด้งกลับเพราะยัง Fail     ตั้งใหม่ นับจากตอนที่ทดสอบซ้ำ

## วันทำการ

`addWorkingDays(from, days)` ใน `src/lib/deadlines.ts` — ที่เดียวกับ
`isProjectOverdue`/`isTestRunOverdue` เพราะเป็นเรื่องกำหนดเวลาเหมือนกัน

  เดินทีละวัน ข้ามเสาร์อาทิตย์ เก็บเวลาในวันไว้เท่าเดิม
  ศุกร์ 16:00 + 1 วันทำการ = จันทร์ 16:00
  เสาร์ + 1 วันทำการ = จันทร์ (เริ่มนับจากวันทำการถัดไป)

ไม่มีปฏิทินวันหยุด และเขียนไว้ในคอมเมนต์ว่าเป็นการตัดสินใจ ไม่ใช่ลืม

## เด้งกลับเมื่อยังพัง

`clearWorkStateOps` วันนี้ไม่รู้ว่าผลที่บันทึกคืออะไร — มันถูกเรียกเมื่อ
"ไม่ใช่ NOT_RUN" เท่านั้น เปลี่ยนเป็น `workOpsForResult(client, before,
actorId, testResult)` คืนสองอย่าง:

  ops        คิวรีที่เตรียมไว้ ให้เข้า transaction เดียวกับผล
  bouncedTo  id ของคนที่ต้องแจ้ง หรือ null

  FAILED ขณะ READY_TO_RETEST  → ASSIGNED, dueAt ใหม่, WorkEvent, bouncedTo
  FAILED ขณะ ASSIGNED/IN_PROGRESS → ไม่ทำอะไรเลย
  อื่น ๆ                          → workState = null, dueAt = null, WorkEvent null

"FAILED = เด้งกลับ" เฉย ๆ ไม่พอ และบั๊กที่เจอจริงพิสูจน์แล้ว: คนทำงานจริง
assign ก่อน แล้วค่อยบันทึกผล Fail ในรอบ (audit log ห่างกัน 5 วินาที) ถ้าทุก
FAILED เด้งกลับ การบันทึกความพังอันเดิมจะรีเซ็ตกำหนดส่งและแจ้งเตือนซ้ำ

เด้งกลับเฉพาะตอนที่ Dev บอกว่าแก้เสร็จแล้ว (READY_TO_RETEST) เท่านั้น เพราะ
นั่นคือครั้งเดียวที่ "ยังพังอยู่" เป็นข่าวใหม่ ส่วน ASSIGNED/IN_PROGRESS แปลว่า
ยังไม่มีใครอ้างว่าแก้เสร็จ ผล Fail จึงไม่ได้บอกอะไรที่ยังไม่รู้

BLOCKED/SKIPPED ถือว่าปิด: ทั้งคู่แปลว่า "ยังไม่ได้คำตอบ" ซึ่งไม่ใช่
"ยังพังอยู่" และการยัดงานกลับให้ Dev เพราะทดสอบไม่ได้คือการโยนผิดคน

แจ้งเตือนส่งหลัง transaction ไม่ใช่ในนั้น — `$transaction([...])` รับคิวรีที่
เตรียมไว้เท่านั้น และการเขียน notification สำเร็จแต่ transaction ล้มจะได้
แจ้งเตือนถึงงานที่ไม่มีอยู่

Out of scope / do NOT touch (Fence):
- ไม่แตะ production schema จนกว่าจะได้รับอนุญาตอีกครั้ง (ยังค้าง 3 migration เดิม)
- ไม่เพิ่ม scheduler / netlify.toml — แจ้งเตือนอัตโนมัติตอนเลยกำหนดต้องมีตัวรัน
  ตามเวลา ซึ่งโปรเจกต์นี้ยังไม่มี และเป็นการเพิ่ม architecture
- ไม่แตะ `EDITOR_ROLES` หรือหน้าอื่นที่ไม่เกี่ยว

Risks & unknowns:
- `orderBy dueAt` ต้องจัดการ null — Prisma `{ sort: "asc", nulls: "last" }`
- งานที่ assign ไว้ก่อนหน้านี้จะมี `dueAt` เป็น null ตลอดไป ไม่ย้อนตั้งให้
  (ไม่มีทางรู้ว่า assign ตอนไหนถ้าไม่มี WorkEvent — ที่จริงมี แต่การย้อนตั้ง
  กำหนดส่งให้งานเก่าคือการออกสัญญาแทนคนอื่นย้อนหลัง)

## Steps (เสร็จทั้งหมด)

1. `addWorkingDays` + `WORK_DAYS_BY_PRIORITY` + `isWorkOverdue` —
   files: src/lib/deadlines.ts — verify: unit test รวมเคสศุกร์/เสาร์/ข้ามสัปดาห์
2. `TestCase.dueAt` + migration — files: prisma/schema.prisma,
   prisma/migrations/<ts>_work_due — verify: `migrate deploy` บน test + dev
3. ตั้ง/ล้าง `dueAt` ใน `assignCase` / `assignCases` —
   files: src/lib/work.ts — verify: unit test ทั้งสี่ระดับ + กดซ้ำไม่ขยับ
4. `workOpsForResult` แทน `clearWorkStateOps` + แจ้งเตือนหลัง transaction —
   files: src/lib/work.ts, src/lib/test-runs.ts, src/lib/test-cases.ts —
   verify: unit test — Fail เด้งกลับ, Pass ปิด, BLOCKED ปิด, รอบเก่าไม่แตะ
5. การ์ด My Work: ป้ายกำหนดส่ง สีแดงเมื่อเลย + เรียง dueAt ขึ้นก่อน —
   files: src/lib/work.ts (listMyWork orderBy), src/app/.../my-work/page.tsx —
   verify: browser test — งานเลยกำหนดอยู่บนสุดและขึ้นสีแดง
6. แสดงกำหนดส่งใต้ชื่อคนในคอลัมน์ Assigned to ของหน้า Test Run —
   files: src/app/.../runs/[runId]/page.tsx — verify: browser test เดิมยังผ่าน
7. ทั้งชุด: vitest + playwright + lint + build

## เพิ่มระหว่างทาง

การ์ด My Work ย่อไว้เป็นค่าเริ่มต้น ด้วย `<details>` แบบเดียวกับประวัติการส่งต่อ
เปิดมาเห็นชื่อ ที่อยู่ ระดับ กำหนดส่ง บรรทัดเดียวว่าพังยังไง และตัวควบคุมสถานะ
— ส่วนที่เหลือพับไว้ เพราะเคสที่มีขั้นตอนยาวกินทั้งจอทีละใบ

ตัวควบคุมสถานะอยู่นอกส่วนที่พับ ตั้งใจ: เป็นสิ่งเดียวที่ Dev เข้ามาทำ

## ตรวจแล้ว

  vitest     354 ผ่าน (31 ไฟล์)
  playwright  39 ผ่าน
  lint        สะอาด
  next build  ผ่าน

## ยังไม่ได้ลง production

  20261021030000_work_due   ADD COLUMN "dueAt" + index
