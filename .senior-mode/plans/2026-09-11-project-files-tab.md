# Files tab — Plan

Goal: แท็บ File ในโปรเจกต์ อัปโหลดไฟล์แล้วแสดงรายการ จัดกลุ่มตาม Module

```
Module: A
  file X.X
  file X.X
-----------------
Module: B
  file X.X
```

Current vs desired (Diff):
- now: ไม่มีที่เก็บไฟล์ระดับโปรเจกต์ มีแต่ Attachment ที่ผูกกับ Test Case
- want: แท็บใหม่ `/projects/[id]/files` — เพิ่มไฟล์ + ดูรายการจัดกลุ่มตาม Module

Out of scope / do NOT touch (Fence):
- Attachment ของ Test Case — คนละเรื่อง ไม่แตะ
- ไม่ประมวลผลเนื้อไฟล์ใดๆ (ไม่ parse, ไม่ preview) ตามที่ระบุว่า "เก็บมาแสดงเท่านั้น"
- RBAC เดิม: อ่านได้ทุก member, อัปโหลด/ลบเฉพาะ EDITOR_ROLES

Risks & unknowns:
- **ยังไม่มี route สำหรับดาวน์โหลดไฟล์เลยในระบบ** — `saveAttachment` เขียนไฟล์
  ลง `./uploads` แล้วจบ ไม่มีทางอ่านกลับผ่านแอป แท็บนี้ต้องมีดาวน์โหลดถึงจะมี
  ประโยชน์ จึงต้องสร้าง route ใหม่พร้อมตรวจสิทธิ์
- **โค้ดเดิมมีช่องโหว่ path traversal**: `storageKey = \`${randomUUID()}-${file.name}\``
  แล้ว `path.join(UPLOAD_DIR, storageKey)` — ชื่อไฟล์ที่มี `../` จะพาไปเขียนนอก
  โฟลเดอร์ได้ ของใหม่จะใช้ UUID ล้วนเป็นชื่อบนดิสก์ และเก็บชื่อจริงไว้ใน DB
- **ไฟล์ที่เสิร์ฟกลับต้องบังคับดาวน์โหลด** (`Content-Disposition: attachment`)
  ไม่งั้นไฟล์ HTML/SVG ที่ผู้ใช้อัปโหลดจะรันสคริปต์ในโดเมนเดียวกับแอป
- `./uploads` อยู่บนดิสก์ของเครื่องที่รัน ไม่ใช่ object storage — ถ้า deploy
  หลาย instance หรือ container ที่ filesystem หายเมื่อ restart ไฟล์จะหาย
  (เป็นข้อจำกัดเดิมของระบบ ไม่ได้เกิดจากงานนี้ แต่ต้องรู้)

## การตัดสินใจที่ตกลงแล้ว

1. **Module = ข้อความอิสระต่อไฟล์** ใช้เป็นหัวข้อแบ่งกลุ่มบนหน้าจอ
2. **ลบได้** แบบ soft delete เหมือนส่วนอื่นของระบบ
3. **จำกัดขนาด 20 MB** ไม่จำกัดชนิดไฟล์ตอนอัปโหลด
4. **คลิกไฟล์แล้ว preview ใน modal** (เพิ่มจากรอบแรก)

## Preview กับความปลอดภัย

การเสิร์ฟไฟล์ที่ผู้ใช้อัปโหลดแบบ inline จากโดเมนเดียวกับแอป คือช่องทาง
stored XSS แบบคลาสสิก — ไฟล์ `.html` หรือ `.svg` จะรันสคริปต์ในโดเมนนี้และ
อ่าน session cookie ได้ ทางที่ถูกคือแยก origin สำหรับ user content ซึ่ง
โปรเจกต์นี้ยังไม่มี จึงป้องกันเป็นชั้นๆ แทน:

- inline เฉพาะชนิดที่สคริปต์ไม่ได้: `application/pdf`, `image/png`,
  `image/jpeg`, `image/gif`, `image/webp` — **ไม่รวม SVG** (รันสคริปต์ได้)
- ชนิดอื่นทั้งหมด → `Content-Disposition: attachment` และ modal แสดงว่า
  พรีวิวไม่ได้ พร้อมปุ่มดาวน์โหลด
- ทุก response แนบ `X-Content-Type-Options: nosniff` และ
  `Content-Security-Policy: default-src 'none'; sandbox`
- `Content-Type` มาจากชนิดที่บันทึกไว้ตอนอัปโหลดและผ่าน allowlist เท่านั้น
  ไม่ได้เชื่อค่าที่ browser ส่งมาตรงๆ

## Steps

1. schema: `model ProjectFile` (projectId, module, fileName, storageKey,
   contentType, size, uploadedById, uploadedAt, deletedAt)
   verify: `db push` ผ่าน
2. `lib/project-files.ts` — `saveProjectFile` (UUID ล้วนเป็น storageKey,
   ตรวจขนาด), `listProjectFilesGroupedByModule`, `readProjectFile`,
   `deleteProjectFile`
   verify: อัปโหลดจริงแล้วไฟล์โผล่ในดิสก์ + แถวใน DB ตรงกัน
3. route เสิร์ฟไฟล์ `/api/projects/[id]/files/[fileId]` — ตรวจ membership,
   inline เฉพาะ allowlist ที่เหลือเป็น attachment, ชื่อไฟล์จาก DB
   verify: สมาชิกเปิดได้ / คนนอกได้ 403 / ไม่มี session ได้ 401 /
   ไฟล์ HTML ต้องถูกบังคับดาวน์โหลด ไม่ใช่ render
4. หน้า `/projects/[id]/files` — ฟอร์มอัปโหลด (file + module) + รายการ
   จัดกลุ่มตาม module เป็นการ์ดไฟล์ (ไอคอน + ชื่อ + วันที่อัปเดต)
   คลิกการ์ด → modal พรีวิว (iframe สำหรับ PDF, img สำหรับรูป) + ปุ่มดาวน์โหลด
   verify: อัปโหลด 2 ไฟล์คนละ module แล้วขึ้นเป็น 2 กลุ่ม
5. เพิ่มแท็บ `File` ใน `ProjectTabs`
   verify: แท็บขึ้นและ active ถูกต้องเมื่ออยู่หน้านั้น
6. Verify รวม: `tsc` + `eslint`, ทุกหน้า 200, แล้วลบไฟล์ทดสอบออกทั้งจาก DB
   และดิสก์
