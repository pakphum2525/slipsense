# AGENTS.md — SlipSense (Smart Receipt Expense Tracker)

## ข้อมูลโปรเจกต์
- **ชื่อโปรเจกต์:** SlipSense (สลิปเซนส์) — ระบบบันทึกรายรับ-รายจ่ายจากใบเสร็จและสลิปด้วย AI (`slipsense-expense-tracker`)
- **ประเภท:** Production-Ready PWA + Supabase Auth/RLS/Edge Function + Offline-First IndexedDB
- **สภาพแวดล้อม:** Personal PC Edition (`LAPTOP-C8VOI2RL`) ใช้ System Node.js (`v24.16.0`) และ Static HTTP Server บน `http://127.0.0.1:8080` สำหรับพัฒนาและตรวจสอบในเครื่อง พร้อมรองรับการ Deploy ขึ้น GitHub Pages ทันทีโดยไม่ต้องมี Build Step บนเซิร์ฟเวอร์

## กฎความปลอดภัยและการพัฒนา (บังคับใช้เข้มงวด)
1. **ห้ามเก็บ Gemini API Key หรือ `service_role` key ใน Frontend (`index.html`, `sw.js`, `localStorage`, `IndexedDB`) เด็ดขาด**
2. การเรียก Gemini API ต้องผ่าน Supabase Edge Function (`supabase/functions/analyze-receipt/index.ts`) ซึ่งตรวจสอบ JWT ของผู้ใช้ที่เข้าสู่ระบบและจำกัดอัตราการเรียกใช้งาน (Rate Limit) ก่อนเสมอ
3. ข้อมูลธุรกรรมในเครื่องเก็บใน `IndexedDB` (`slipsense_db`) พร้อมสถานะซิงก์ชัดเจน (`local_only`, `pending_sync`, `synced`, `sync_failed`)
4. ข้อมูลที่ได้จาก AI ต้องผ่านฟอร์มตรวจสอบ (`Verification Form`) ให้ผู้ใช้ตรวจทานและแก้ไขก่อนยืนยันบันทึกทุกครั้ง ห้ามเดาวันที่หรือยอดเงินที่อ่านไม่ชัด
5. ใช้ภาษาไทยที่ชัดเจนสำหรับ UI และเอกสาร ใช้ UTF-8 without BOM
