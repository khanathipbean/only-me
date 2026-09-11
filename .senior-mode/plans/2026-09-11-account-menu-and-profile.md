# Account menu + profile editing — Plan

Goal: คลิก avatar แล้วมีเมนูแสดง display name / email / roles พร้อมทางไป
Edit Profile (แก้ชื่อ + รหัสผ่าน) และ Logout

Current vs desired (Diff):
- now: avatar เป็นวงกลมเฉยๆ คลิกไม่ได้ ปุ่ม Logout เป็นไอคอนแยกข้างๆ
- want: คลิก avatar → dropdown: ชื่อ+อีเมล / Roles / Edit Profile / Logout
  และมีหน้าแก้ชื่อกับเปลี่ยนรหัสผ่านจริง

Out of scope / do NOT touch (Fence):
- schema Prisma — ไม่เพิ่มตาราง/คอลัมน์
- RBAC ต่อ project และ `auth.ts` (การ sign-in เดิม)
- ปุ่ม ThemeToggle
- "Teams / Organization" ในภาพตัวอย่าง — แอปนี้ไม่มีคอนเซปต์นี้ ไม่สร้างของปลอม

Risks & unknowns:
- **Roles ในแอปนี้เป็นราย project ไม่ใช่ global** (`ProjectMember.role`)
  → เมนูจะแสดง role ที่ผู้ใช้ถืออยู่ "ทั้งหมดแบบไม่ซ้ำ" ข้ามทุก project
- **เปลี่ยนชื่อแล้ว header ไม่อัปเดต**: `name` มาจาก JWT ที่ออกตอน sign-in
  ไม่ได้อ่านจาก DB → ต้องให้ layout อ่าน user จาก DB (ห่อ `cache()` กัน
  query ซ้ำ) ไม่งั้นต้อง logout เข้าใหม่ถึงจะเห็นชื่อใหม่
- **AuditLog บังคับ `projectId`** (FK ไม่ nullable) การแก้โปรไฟล์ไม่ผูกกับ
  project ใด → บันทึก audit ไม่ได้ถ้าไม่แก้ schema ซึ่งอยู่นอกขอบเขต
  จะไม่บันทึก และบอกผู้ใช้ให้รู้
- เปลี่ยนรหัสผ่านต้องยืนยันรหัสเดิมก่อนเสมอ ไม่งั้นใครยืมเครื่องที่ล็อกอินค้าง
  ก็ยึดบัญชีได้
- dropdown ต้องไม่โดน header ตัด (header เป็น `sticky` + `z-10`)

## Steps

1. **`src/lib/users.ts`** (ใหม่)
   - `getUserWithRoles(userId)` — ชื่อ/อีเมล + role ที่ถืออยู่แบบไม่ซ้ำ (ห่อ `cache`)
   - `updateDisplayName(userId, name)` — validate ว่าไม่ว่าง
   - `changePassword(userId, current, next)` — `bcrypt.compare` รหัสเดิมก่อน,
     บังคับความยาวขั้นต่ำ, แล้ว `hashPassword` ตัวใหม่
   verify: เรียกจริงกับ DB แล้ว login ด้วยรหัสใหม่ได้ / รหัสเดิมใช้ไม่ได้

2. **`AccountMenu`** — files: `src/components/AccountMenu.tsx` (ใหม่, client)
   avatar เป็นปุ่มเปิดเมนู แสดงชื่อ/อีเมล/roles + ลิงก์ Edit Profile + ปุ่ม Logout
   ใช้ pattern เดียวกับ `RowActions`: portal ออก `<body>` + วางตำแหน่งจาก
   กรอบปุ่ม (header เป็น sticky ที่ทับซ้อน layer อื่นได้)
   verify: curl เห็นปุ่ม, เมนู render ตอนคลิก, ปิดด้วย Esc/คลิกนอก

3. **`/profile`** — files: `src/app/profile/page.tsx` (ใหม่)
   สองฟอร์มแยกกัน: Display name และ Change password (current + new + confirm)
   verify: submit จริงทั้งสองฟอร์ม แล้วตรวจ DB + ลองล็อกอินใหม่

4. **layout อ่าน user จาก DB** — files: `src/app/layout.tsx`
   แทนที่ `session.user.name` ด้วยค่าจาก `getUserWithRoles` เพื่อให้ชื่อใหม่
   ขึ้นทันทีหลังแก้ และย้ายปุ่ม Logout เข้าไปในเมนู
   verify: แก้ชื่อแล้ว refresh เห็นชื่อใหม่โดยไม่ต้อง logout

5. **Verify รวม** — `tsc` + `eslint`, ทุกหน้า 200, `/profile` ต้องถูก
   middleware คุ้มครอง (ไม่มี session → เด้ง login), และเก็บกวาดข้อมูลทดสอบ
   (คืนชื่อ/รหัสผ่านเดิมของ admin)
