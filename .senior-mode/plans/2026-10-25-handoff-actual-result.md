# Actual Result บนแถว "To fix" ในประวัติ hand-off — Plan

Goal: ให้แต่ละแถว `To fix` ในประวัติบอกได้ว่ารอบนั้นถูกส่งต่อเพราะเห็นอะไรผิด
โดยอ่าน Actual Result (`TestResultEvent.notes`) ที่บันทึกไว้แล้ว ไม่เก็บซ้ำ

Current vs desired (Diff):
- ตอนนี้: แถว `To fix` แสดงได้แค่ `WorkEvent.note` ซึ่งส่วนใหญ่ว่าง (2 ใน 3 ของ
  TC-DSD-001) หรือเป็นประโยคที่ระบบเขียนเอง ("Retested — still failing")
- ต้องการ: ใต้แถว `To fix` แสดง Actual Result ของผล FAILED ที่เป็นเหตุ พร้อมลิงก์
  ไปรอบที่บันทึกผลนั้น

กติกาจับคู่ (เคาะกับผู้ใช้แล้ว):
1. ไล่ hand-off จากเก่าไปใหม่ แต่ละอันหยิบผล FAILED ที่ "ใหม่ที่สุดที่ยังไม่ถูกหยิบ
   และ recordedAt <= occurredAt" — ผลหนึ่งครั้งอธิบายการส่งต่อครั้งเดียว
2. hand-off ที่ไม่มีผล FAILED เหลือให้หยิบ → ไม่วาดบรรทัดเพิ่ม
3. ผล FAILED ที่ไม่มีข้อความ (notes ว่าง) → ไม่วาดบรรทัดเพิ่มเช่นกัน
4. แสดงชื่อ run เป็นลิงก์ไป `/projects/<id>/runs/<runId>`; ผลที่บันทึกนอกรอบไม่มีลิงก์

Out of scope / do NOT touch (Fence):
- schema / migration — ข้อมูลมีครบแล้ว ห้ามแตะ production DB
- `workOpsForResult` และข้อความ "Retested — still failing" ที่ระบบเขียน
- กติกา `worthShowing` / `startsHandOff` / เส้นแบ่งรอบ ที่เพิ่งแก้ไป
- การ์ด Tab Open ส่วน `whatHappened` ซึ่งแสดง Actual Result ปัจจุบันอยู่แล้ว

Risks & unknowns:
- timestamp ของผลกับของ work event ห่างกันระดับมิลลิวินาทีและสลับกันได้ (A1 ถูก
  assign ก่อนผล FAILED ถูกบันทึก 3 วินาที) — กติกา "ใหม่ที่สุดที่ <= " รับมือได้
  แต่ hand-off ที่เกิดก่อนผลจะไม่มีบรรทัด ซึ่งถูกต้องตามที่เคาะไว้
- `listMyWork` ดึงผล FAILED แค่ 1 รายการ ต้องขยายโดยไม่ทำให้ `resultEvents[0]`
  (ผู้รายงาน บนการ์ด) เปลี่ยนความหมาย

## Steps
1. `src/lib/work.ts` — เพิ่ม `HandOffCause` + helper `withCauses(moves, failures)`
   ตามกติกาข้อ 1–2 — verify: unit test ใน `tests/work.test.ts`
2. `src/lib/work.ts` — `listFinishedWork`: เพิ่ม `notes` ใน select ของ `answers`
   แล้วส่ง `history` ผ่าน `withCauses` — verify: unit test
3. `src/lib/work.ts` — `listMyWork`: ขยาย `resultEvents` เป็น take 10 + ข้อมูล run
   แล้วส่ง `workEvents` ผ่าน `withCauses` — verify: unit test
4. `src/app/projects/[id]/my-work/page.tsx` — วาดบรรทัดใน `HandOffHistory` และใน
   "How it got here" พร้อมลิงก์ run — verify: screenshot จาก e2e fixture
5. ขยาย `scripts/seed-e2e.ts` ให้ fixture มี Actual Result ต่างกันแต่ละรอบ แล้ว
   เพิ่ม browser test — verify: `npx playwright test`
6. พิสูจน์ว่าเทสต์แดงเมื่อถอด `withCauses` ออก แล้วรันทั้ง vitest + playwright
