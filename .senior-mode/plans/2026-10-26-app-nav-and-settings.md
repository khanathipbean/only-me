# Navbar ระดับแอป + หน้า Settings — Plan

Goal: หน้าที่อยู่นอก Project มีแถบเมนูของตัวเองแบบเดียวกับตอนเข้า Project
โดยมี Projects กับ Settings และ Settings เป็นหน้ารวมการ์ด ใบแรกคือ Users

Current vs desired (Diff):
- ตอนนี้: แถบเมนูมีเฉพาะใต้ `/projects/[id]` (`ProjectTabs` ใน
  `src/app/projects/[id]/layout.tsx`) หน้า `/projects`, `/members`,
  `/profile` ไม่มีแถบอะไรเลย เข้า Members ได้ทางไอคอนบน header เท่านั้น
- ต้องการ: แถบเมนูระดับแอปใต้ header ทุกหน้าที่ไม่ได้อยู่ใต้ Project
  มี Projects และ Settings (Settings เห็นเฉพาะ ADMIN) และ `/settings`
  เป็นหน้ารวมการ์ด ใบแรกพาไป Members

เคาะกับผู้ใช้แล้ว:
1. สิทธิ์ Settings = `isAdminAnywhere` (ADMIN ใน Project ใดก็ได้) ตัวเดียวกับ
   ที่คุม Members และ + New Project วันนี้ ไม่เพิ่ม role ใหม่ ไม่แตะ schema
2. Members ย้ายไป `/settings/members` และ `/members` เดิมทำเป็น redirect ถาวร

Out of scope / do NOT touch (Fence):
- `ProjectTabs` และ layout ของ Project — แถบใหม่ต้องไม่โผล่ซ้อนในนั้น
- เนื้อหาหน้า Members เอง (ตาราง สิทธิ์ แท็บ activity) ย้ายที่อยู่อย่างเดียว
- schema / migration / production DB
- ไอคอน Members บน header และใน AccountMenu — เปลี่ยนแค่ปลายทางของลิงก์

Risks & unknowns:
- `/projects/[id]` ซ้อนใต้ `/projects` การวาง layout ที่ `src/app/projects/`
  จะโดนทั้งสองหน้า จึงเลือกวาง `AppTabs` ไว้ใน root layout แล้วให้มันซ่อน
  ตัวเองเมื่อ path เป็นหน้า Project (client component อ่าน `usePathname`)
- `ProjectTabs` มีบทเรียนเขียนกำกับไว้ว่า client component ห้าม import
  `@/lib/rbac` เพราะลาก `pg` เข้า bundle — `AppTabs` ต้องรับ boolean มาแทน
- การซ่อนลิงก์ไม่ใช่การกั้น หน้า `/settings` ต้องเรียก
  `requireAdminAnywhereOrNotFound` เองเหมือนที่ Members ทำ

## Steps
1. `src/components/AppTabs.tsx` — client component แบบเดียวกับ `ProjectTabs`
   รับ `canManage: boolean` วาด Projects + Settings และคืน null เมื่อ path
   ตรง `/projects/<id>` — verify: unit test ของกติกาซ่อน/แสดง
2. `src/app/layout.tsx` — วาง `AppTabs` ใต้ header ในบล็อกที่มี session อยู่
   แล้ว ส่ง `isAdmin` ที่คำนวณอยู่แล้วเข้าไป — verify: screenshot
3. ย้าย `src/app/members/` → `src/app/settings/members/` แล้วทำ
   `src/app/members/page.tsx` เป็น `redirect("/settings/members")` —
   verify: `npx playwright test e2e/permissions.spec.ts`
4. `src/app/settings/page.tsx` — กั้นด้วย `requireAdminAnywhereOrNotFound`
   แล้ววาดกริดการ์ด ใบแรก Users → `/settings/members` — verify: screenshot
5. แก้ปลายทางลิงก์ Members ใน `layout.tsx` และ `AccountMenu` — verify: grep
   ว่าไม่เหลือ `/members` ที่ไหนนอกจากไฟล์ redirect
6. รัน vitest + playwright ทั้งชุด และพิสูจน์ว่าเทสต์ใหม่แดงเมื่อถอดการกั้นออก
