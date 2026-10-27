# สถาปัตยกรรมการปกป้องทรัพย์สินทางปัญญาและความปลอดภัยของ Source Code (Section 17)

เอกสารฉบับนี้อธิบายการออกแบบและมาตรการทางเทคนิคของโปรเจกต์ **SlipSense (`slipsense-expense-tracker`)** ตามข้อกำหนด **Section 17: Intellectual Property Protection & Source Code Security** เพื่อปกป้อง Source Code ต้นฉบับ, Business Logic, Prompt ภายใน, Algorithm การวิเคราะห์ใบเสร็จ และข้อมูลความลับของระบบ

---

## 1. หลักการออกแบบแบบหลายชั้น (Defense-in-Depth for IP & Security)

เนื่องจากสถาปัตยกรรม Web Application / PWA จำเป็นต้องส่งโค้ดส่วนแสดงผล (HTML, CSS, JavaScript) ไปทำงานบนเบราว์เซอร์ของผู้ใช้ ระบบจึงไม่พึ่งพาการแปลงชื่อตัวแปร (Obfuscation) เพียงอย่างเดียว แต่แยกส่วนประกอบออกเป็น 4 ชั้นอย่างชัดเจน:

| ชั้นความลับ | ตำแหน่งจัดเก็บ | การเผยแพร่สู่สาธารณะ | มาตรการป้องกัน |
|---|---|---|---|
| **1. Server-Side IP & Prompts** | `supabase/functions/analyze-receipt/index.ts`, `supabase.sql` | **ไม่เปิดเผยต่อเบราว์เซอร์** (รันบน Supabase Edge Runtime และ PostgreSQL เท่านั้น) | ตรวจสอบ JWT (`auth.getUser`), บังคับ Atomic Rate Limit (`consume_ai_rate_limit`), ซ่อน System Prompt และ Gemini Schema ไว้ฝั่ง Server 100% |
| **2. Original TypeScript Source** | `src/app.ts`, `src/sw.ts`, `src/index.template.html` | **ไม่เผยแพร่ขึ้น GitHub Pages** (เก็บใน Private Repository เท่านั้น) | แยกโฟลเดอร์ `src/` ออกจาก `dist/` และบล็อกการอัปโหลด `.ts` / `.map` ใน Workflow |
| **3. Internal Docs & QA Specs** | `docs/`, `.agent_loop/`, `scripts/` | **ไม่เผยแพร่ใน `dist/`** | เก็บเฉพาะใน Private Repository สำหรับนักพัฒนาและระบบตรวจสอบอัตโนมัติ |
| **4. Public Production Artifact** | `dist/` (`dist/index.html`, `dist/sw.js`, `dist/manifest.json`, `dist/icons/*`, `dist/vendor/supabase.min.js`) | เผยแพร่ผ่าน GitHub Pages | ลบ Comment ทั้งหมด, ย่อขนาด (Minify CSS/JS), เปลี่ยนชื่อตัวแปรและฟังก์ชันภายใน (Identifier Mangling `_0x1a0...`), และไม่สร้าง Source Maps (`*.map`) |

---

## 2. การแยก Business Logic และทรัพย์สินทางปัญญาไว้ฝั่ง Server (Section 17.2 & 17.5)

ตรรกะที่เป็นทรัพย์สินทางปัญญาหลักของ SlipSense ถูกออกแบบให้ทำงานอยู่บน **Supabase Edge Function (`analyze-receipt`)** และ **PostgreSQL RPC (`supabase.sql`)** เท่านั้น ได้แก่:

1. **Internal AI System Prompt & Extraction Rules**: คำสั่งควบคุมโมเดล Gemini สำหรับอ่านใบเสร็จและสลิปโอนเงินภาษาไทย การแยกแยะทิศทางเงิน (`income`, `expense`, `unknown`) และกฎการสรุปวัตถุประสงค์ของการซื้อ (`purpose_analysis`) ถูกเก็บไว้ใน `supabase/functions/analyze-receipt/index.ts` เท่านั้น เบราว์เซอร์จะได้รับเฉพาะผลลัพธ์ JSON ที่ผ่านการคัดกรองแล้ว
2. **Server-Side Date & Currency Normalization**: อัลกอริทึมตรวจสอบและแปลงปี พ.ศ. (`2480–2650`) เป็นปี ค.ศ. (`ลบ 543`) รวมถึงการตรวจจับข้อมูลที่ไม่ชัดเจน (`uncertain_fields` และ `requires_review`) ทำงานบน Edge Function ก่อนส่งกลับมายัง Client
3. **Atomic Per-User Rate Limiting**: ใช้ฟังก์ชัน PostgreSQL `public.consume_ai_rate_limit(p_limit, p_model)` ร่วมกับ `pg_advisory_xact_lock` เพื่อป้องกันการยิงคำขอพร้อมกัน (Race Condition / Quota Abuse) และจำกัดจำนวนครั้งต่อผู้ใช้ต่อชั่วโมงอย่างแม่นยำ

---

## 3. กระบวนการ Production Build, Minification และ Obfuscation (Section 17.4)

คำสั่ง `npm run build` (`node scripts/build_prod.js`) ดำเนินการตามขั้นตอนต่อไปนี้โดยอัตโนมัติ:

1. **TypeScript Compilation**: แปลงโค้ดต้นฉบับจาก `src/app.ts` และ `src/sw.ts` เป็น JavaScript มาตรฐาน ES6+ ด้วย `stripTypeScriptTypes` ของ Node.js v24
2. **Comment & Debug Stripping**: ลบ HTML Comments (`<!-- ... -->`), CSS Comments (`/* ... */`) และ JavaScript Comments (`// ...`, `/* ... */`) ทั้งหมดออกจากไฟล์ที่เผยแพร่
3. **Safe Identifier Mangling (Obfuscation)**: เปลี่ยนชื่อตัวแปรสถานะและฟังก์ชันภายในจำนวน 44 รายการ (เช่น `appState`, `openLocalDatabase`, `callAnalyzeReceiptEdgeFunction`, `syncPendingTransactions`, `renderDashboard` ฯลฯ) ให้เป็นรหัสสั้น `_0x1a0` ถึง `_0x1cb` โดยไม่กระทบต่อ:
   - การทำงานของ Supabase Auth และ Row Level Security
   - การตรวจสอบความถูกต้องของข้อมูล (`Verification Form`)
   - การเข้าถึงด้วยเทคโนโลยีช่วยเหลือ (Accessibility / ARIA attributes)
   - การทำงานบน iPhone (Safari PWA) และ Android Tablet (Chrome PWA)
4. **Zero Source Maps**: ปิดการสร้างไฟล์ `*.map` และไม่อนุญาตให้มี `sourceMappingURL` ในไฟล์ Production
5. **Automated Post-Build Security Gate**: ตรวจสอบทุกไฟล์ใน `dist/` ว่าไม่มีไฟล์ `.ts`, `.map`, `.sql`, `.env` และไม่มีรูปแบบคีย์ความลับ (`AIzaSy...`, `sb_secret_`) ก่อนบันทึกหลักฐานการ Build ลง `.agent_loop/BUILD_MANIFEST.json`

---

## 4. การตั้งค่า Private Repository และ GitHub Pages Deployment (Section 17.3)

- เก็บ Source Code ต้นฉบับทั้งหมดไว้ใน **Private GitHub Repository**
- ใช้ไฟล์ `.github/workflows/deploy-pages.yml` ในการ Build และอัปโหลดเฉพาะโฟลเดอร์ `./dist` ไปยัง GitHub Pages Artifact เท่านั้น
- โฟลเดอร์ `src/`, `supabase/`, `docs/`, `scripts/` และ `.agent_loop/` จะไม่ถูกรวมอยู่ใน Artifact ที่เผยแพร่สู่สาธารณะ

---

## 5. ข้อจำกัดทางเทคนิคที่ต้องทราบตามความเป็นจริง (Section 17.1 & 17.6 Honest Disclosure)

- **ไม่สามารถป้องกันการทำ Reverse Engineering ได้ 100% สำหรับโค้ดฝั่ง Browser**: โค้ด HTML, CSS และ JavaScript ที่ต้องรันในเบราว์เซอร์ของผู้ใช้สามารถถูกตรวจสอบผ่านเครื่องมือสำหรับนักพัฒนา (Browser DevTools) ได้เสมอ การทำ Minification และ Obfuscation มีเป้าหมายเพื่อเพิ่มความยากและต้นทุนในการอ่านหรือคัดลอกโครงสร้างโค้ดโดยตรงเท่านั้น
- **ความมั่นคงปลอดภัยที่แท้จริงอยู่ที่ฝั่ง Server**: ดังนั้น SlipSense จึงห้ามใช้ Obfuscation แทนการควบคุมความปลอดภัยฝั่ง Server โดยเด็ดขาด ความปลอดภัยของข้อมูลการเงินและโควตา AI ถูกบังคับใช้ด้วย **Supabase JWT Verification**, **PostgreSQL Row Level Security (`ENABLE` + `FORCE RLS`)**, และ **Server-Side Rate Limiting** เสมอ
