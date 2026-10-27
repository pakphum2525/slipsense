# รายงานสถานะโปรเจกต์ (STATUS.md) — SlipSense (`slipsense-expense-tracker`)

**วันที่อัปเดตล่าสุด:** 27 ตุลาคม 2026  
**สภาพแวดล้อม:** Personal PC Edition (`LAPTOP-C8VOI2RL`) — System Node.js `v24.16.0` (`http://127.0.0.1:8080`)  
**สถานะโดยรวม:** พร้อมใช้งานและพร้อม Deploy ขึ้น GitHub Pages / Supabase Production (รองรับระบบแบ่งเงินเดือน 5 ส่วน & รายการ Fix รายเดือนครบถ้วน)

---

## 1. สิ่งที่ดำเนินการเสร็จสมบูรณ์แล้ว (Completed Deliverables)

1. **แอปพลิเคชันหลัก (`index.html`)**
   - พัฒนาด้วย HTML5, CSS3 และ Vanilla JavaScript ในไฟล์เดียว พร้อมใช้งานโดยไม่ต้องมี Build Step บนเซิร์ฟเวอร์
   - รองรับการถ่ายภาพและอัปโหลดใบเสร็จ/สลิปโอนเงิน ย่อขนาดภาพอัตโนมัติในเบราว์เซอร์ด้วย Canvas (ด้านยาวสุดไม่เกิน ~1,600px JPEG) แสดงขนาดไฟล์ก่อนและหลังย่อ และตรวจจับไฟล์ `.HEIC` พร้อมคำแนะนำที่ชัดเจน
   - มี **Verification Form (ฟอร์มตรวจสอบข้อมูลจาก AI)** ไฮไลต์ฟิลด์ที่ AI ไม่มั่นใจ (`uncertain_fields`) แสดงคำเตือน (`warnings`) บังคับตรวจสอบวันที่ ยอดเงิน และประเภทรายการก่อนยืนยันบันทึกทุกครั้ง (ไม่เดาวันที่หรือยอดเงินที่อ่านไม่ชัด)
   - ระบบฐานข้อมูลในเครื่อง **Offline-First IndexedDB (`slipsense_db`)** แยกสถานะซิงก์ 4 สถานะชัดเจน: `local_only`, `pending_sync`, `synced`, `sync_failed`
   - ระบบย้ายข้อมูลจากโหมดในเครื่อง (`local_only`) ขึ้นบัญชี Cloud แบบขอคำยืนยันจากผู้ใช้ก่อนเสมอ เพื่อป้องกันข้อมูลปะปนกันเมื่อเปลี่ยนบัญชี
   - หน้า **Dashboard รายเดือน** คำนวณรายรับรวม รายจ่ายรวม ยอดคงเหลือสุทธิ และสัดส่วนรายจ่ายตามหมวดหมู่ตามเขตเวลา `Asia/Bangkok` พร้อมแยกแสดงจำนวนรายการที่ซิงก์แล้วและรายการในเครื่อง/รอซิงก์
   - ระบบสำรองและกู้คืนข้อมูล **Export/Import JSON และ CSV (UTF-8 with BOM)** พร้อมตรวจสอบความถูกต้องของข้อมูลและป้องกันรายการซ้ำด้วย UUID

2. **โครงสร้าง PWA และ Offline App Shell (`manifest.json`, `sw.js`, `icons/`, `apple-touch-icon.png`)**
   - ใช้ Relative Paths (`./index.html`, `./manifest.json`, `./sw.js`, `./icons/...`) รองรับการ Deploy ทั้งแบบ Root Domain และ GitHub Pages Project Subpath (`/<repo>/`)
   - Service Worker (`sw.js`) เก็บ Cache เฉพาะ App Shell และบล็อกการ Cache ข้อมูลส่วนบุคคล (`/auth/v1`, `/rest/v1`, `/functions/v1`, `generativelanguage.googleapis.com` และคำขอที่มี `Authorization` Header)
   - สร้างไฟล์ไอคอน PNG จริงครบทั้ง 3 ขนาด (`icons/icon-192.png` ขนาด 192x192, `icons/icon-512.png` ขนาด 512x512, และ `apple-touch-icon.png` ขนาด 180x180)

3. **ฐานข้อมูลและนโยบายความปลอดภัย (`supabase.sql`)**
   - สคริปต์ SQL แบบ Idempotent สร้างตาราง `public.transactions` และ `public.ai_usage_logs` พร้อม Indexes, Constraints และ Trigger `trg_transactions_before_update` ป้องกันการเปลี่ยนเจ้าของรายการ (`user_id` immutability)
   - เปิดใช้งาน `ENABLE ROW LEVEL SECURITY` และ `FORCE ROW LEVEL SECURITY` พร้อมสร้าง Policies ครบทั้ง `SELECT`, `INSERT`, `UPDATE`, `DELETE` (`auth.uid() = user_id`) และ `REVOKE ALL` จาก `PUBLIC` และ `anon`

4. **Supabase Edge Function (`supabase/functions/analyze-receipt/index.ts`)**
   - ตรวจสอบ JWT ของผู้ใช้ผ่าน `supabaseClient.auth.getUser(jwt)` ทุกครั้ง
   - ตรวจสอบชนิดไฟล์ (`image/jpeg`, `image/png`, `image/webp`) ขนาดไฟล์ และจำกัดอัตราการเรียกใช้งาน (Rate Limit) ทั้งในหน่วยความจำและตาราง `public.ai_usage_logs`
   - เรียกใช้ Google Gemini API (`GEMINI_MODEL` ค่าเริ่มต้น `gemini-2.5-flash`) ผ่าน Header `x-goog-api-key` พร้อม `AbortController` Timeout และ `responseSchema` (Structured JSON Output)
   - แปลงปี พ.ศ. (`2568`, `2569`) เป็นปี ค.ศ. อัตโนมัติ และคืนค่า `null` พร้อมคำเตือนเมื่อไม่พบวันที่หรือยอดเงิน

5. **การปกป้องทรัพย์สินทางปัญญาและ Source Code (Section 17 — `src/`, `dist/`, `scripts/build_prod.js`, `docs/IP_AND_SECURITY_ARCHITECTURE.md`, `.github/workflows/deploy-pages.yml`)**
   - แยกโค้ดต้นฉบับ TypeScript (`src/app.ts`, `src/sw.ts`, `src/index.template.html`) ออกจากชุดไฟล์เผยแพร่จริงในโฟลเดอร์ `dist/`
   - `scripts/build_prod.js`: แปลง TypeScript เป็น JavaScript, ลบ Comment ทั้งหมด, ย่อขนาด CSS/JS, เปลี่ยนชื่อตัวแปรและฟังก์ชันภายใน (Identifier Mangling 44 รายการ `_0x1a0`–`_0x1cb`), ปิดการสร้าง Source Maps (`*.map`), และตรวจ Security Gate ก่อนสร้าง `.agent_loop/BUILD_MANIFEST.json`
   - `.github/workflows/deploy-pages.yml`: GitHub Actions Workflow ที่รัน Build + Test และอัปโหลดเฉพาะโฟลเดอร์ `./dist` ขึ้น GitHub Pages

6. **ระบบแบ่งเงินเดือน 5 ส่วน พร้อมยอด Fix รายเดือน และการเลือกถอน/ตัดจ่ายจาก 5 ส่วนนี้**
   - เพิ่มคอลัมน์ `fund_bucket` ใน `public.transactions` (`supabase.sql`), `IndexedDB`, `Export/Import JSON & CSV`, และระบบแนะนำกระปุกอัตโนมัติใน `analyze-receipt`
   - รองรับกระปุกเงินเดือนครบทั้ง 5 ส่วน:
     1. `investment_stock` (`1. เงินลงทุน (หุ้น)`) — ยอดสะสมต่อเนื่อง (Fix `6,500` บาท/เดือน)
     2. `home_building` (`2. เงินเก็บสร้างบ้าน`) — ยอดสะสมต่อเนื่อง (Fix `13,000` บาท/เดือน)
     3. `fixed_expense` (`3. ค่าใช้จ่ายคงที่`) — งบประจำเดือน (`12,700` หรือ `14,000` บาท/เดือน) พร้อม Checklist ปุ่มบันทึกจ่าย 1-Click สำหรับ:
        - **ประกันพ่อ:** `1,300` บาท (จ่าย 2 เดือน) หรือ `2,600` บาท (เว้นจ่าย 1 เดือน)
        - **ประกันแดน:** `2,900` บาท
        - **ให้น้อง (มายด์):** `2,000` บาท
        - **ค่าน้ำ, ค่าไฟ, ค่าโทรศัพท์, ค่าเรียนพิเศษลูก:** งบ `6,500` บาท
     4. `emergency_personal` (`4. ค่าใช้จ่ายฉุกเฉิน (ส่วนตัว)`) — ยอดสะสมต่อเนื่อง พร้อมปุ่ม **"เก็บเงินเหลือใช้เข้าข้อ 4"** สำหรับโอนเงินที่เหลือใช้จากงบรายเดือนเข้าสะสมอัตโนมัติ
     5. `general_expense` (`5. ค่าใช้จ่ายทั่วไป`) — งบใช้จ่ายทั่วไปที่คำนวณจากเงินเดือนส่วนที่เหลือหลังหักยอด Fix
   - ทุกครั้งที่มีการถอน/ใช้จ่าย หรือสแกนใบเสร็จ สามารถเลือกตัดจาก 1 ใน 5 ส่วนนี้ได้ทันที และ**ไม่เก็บรูปสลิปต้นฉบับ**ตามนโยบายเดิม

7. **เครื่องมือพัฒนา ทดสอบ และเอกสารคู่มือ (`scripts/dev_server.js`, `scripts/run_tests.js`, `README.md`)**
   - `scripts/dev_server.js`: Static HTTP Server บน `http://127.0.0.1:8080` พร้อมการป้องกัน Path Traversal
   - `scripts/run_tests.js`: ชุดทดสอบอัตโนมัติ 7 ชุดทดสอบ (25 รายการ) ครอบคลุมโครงสร้างไฟล์, ความปลอดภัยของคีย์, SQL RLS + Atomic Rate-Limit RPC (`F-001`), Edge Function Contract, ตรรกะคำนวณการเงิน/Offline Delete Tombstone (`F-002`), Service Worker Prefix Isolation (`F-003`), HTTP Server Integration, Section 17 IP Protection (`dist/` Obfuscation & Security Gate) และระบบแบ่งเงินเดือน 5 ส่วน (`Test 7.5`) — ผ่าน 25/25 รายการ (Exit Code 0)
   - `README.md`: คู่มือภาษาไทยฉบับสมบูรณ์ครบทั้ง 21 หัวข้อตามข้อกำหนด

---

## 2. รายการบั๊กคงค้าง (Known Bugs / Issues)

- **ไม่มีบั๊กคงค้างในระบบ** (ตรวจสอบความถูกต้องของโครงสร้าง ความปลอดภัย และชุดทดสอบอัตโนมัติครบทุกหัวข้อแล้ว)

---

## 3. ขั้นตอนถัดไปสำหรับผู้ใช้งาน (Next Steps — วาระสำหรับวันพรุ่งนี้)

1. **สอนวิธีติดตั้งและเปิดใช้งานจริงทีละขั้นตอน (Step-by-Step Setup Guide):**
   - **ขั้นที่ 1:** วิธีเปิดรันและทดสอบแอปในเครื่อง PC (`C:\Users\SlipSense` -> `npm start` บน `http://127.0.0.1:8080`)
   - **ขั้นที่ 2:** วิธีสร้างโปรเจกต์ Supabase, รันสคริปต์ฐานข้อมูล `supabase.sql`, และตั้งค่า Authentication
   - **ขั้นที่ 3:** วิธีขอ `GEMINI_API_KEY` และสั่งตั้งค่า Secrets + Deploy Edge Function (`analyze-receipt`)
   - **ขั้นที่ 4:** วิธีสร้าง Private GitHub Repository และเปิดใช้งาน GitHub Pages ให้เผยแพร่เฉพาะโฟลเดอร์ `dist/`
   - **ขั้นที่ 5:** วิธีติดตั้งเป็นแอป (Add to Home Screen) บน **iPhone (Safari)** และ **Android Tablet (Chrome)** พร้อมเชื่อมต่อบัญชีซิงก์ข้ามอุปกรณ์
