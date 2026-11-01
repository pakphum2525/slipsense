# รายงานสถานะโปรเจกต์ (STATUS.md) — SlipSense (`slipsense-expense-tracker`)

**วันที่อัปเดตล่าสุด:** 1 พฤศจิกายน 2026
**สภาพแวดล้อม:** Personal PC Edition (`LAPTOP-C8VOI2RL`) — System Node.js `v24.16.0` (`http://127.0.0.1:8080`)  
**สถานะโดยรวม:** TASK-SLIPSENSE-V4-009 ผ่านการทดสอบ (36/36 รายการ), Antigravity QA Review (Gate 12), ได้รับอนุมัติ Release (Gate 16), รวมโค้ดเข้า main และพุชขึ้น GitHub Pages เรียบร้อยแล้ว

## ผลงาน TASK-SLIPSENSE-V4-009

ปรับฟอร์มให้เน้นยอดเงินและร้านค้า / รายการ หมวดหมู่กับกระปุกเงินยังมองเห็นได้ วันที่และข้อมูลรองยังแก้ไขได้ ย้ายสรุปรายการกับวัตถุประสงค์เข้า native details ที่ปิดทุกครั้งเมื่อเปิดฟอร์ม คงข้อมูล AI/รายการแก้ไขและคำเตือน ไม่เดาวันที่หรือยอดเงินที่อ่านไม่ได้ รายการ manual ที่เว้นรายละเอียดใช้ชื่อเป็นสรุปและข้อความวัตถุประสงค์กลาง โดยไม่แก้ schema หรือ migration

ประวัติจับคู่ชื่อเต็มหลัง normalize Unicode NFC ช่องว่างและตัวพิมพ์ กรองเจ้าของ รายการลบและ pending_delete จัดล่าสุดจาก created_at แล้ว updated_at และ id ดึงหมวดหมู่กับกระปุกจากแถวเดียว รองรับ cache เก่า/ใหม่และ quick chip ป้องกันผล async เก่าทับค่าที่ผู้ใช้เลือก ชื่อใหม่ ฟอร์มรอบใหม่หรือบัญชีใหม่ เรียนรู้หลังบันทึกสำเร็จเท่านั้น

### หลักฐาน self-test ของงาน 009

- คำสั่ง `npm test` ด้วย System Node.js `v24.16.0`: ผ่าน **36/36** รายการระดับ suite/test case ล้มเหลว **0**, exit code **0** รวม assertions ย่อยใน regression suites
- `tests/transaction_entry.test.js` ตรวจ markup จริงร่วมกับ input/change/click handlers ทั้ง source และ built: details/datalist, ชื่อซ้ำและเวลาล่าสุด/เวลาเท่ากัน/เวลาหาย, บันทึกสองช่องลง IndexedDB, payload Supabase mock, ข้อมูล AI/แก้ไข, validation, เขียน IndexedDB ล้มเหลว, legacy cache/Unicode, การแยกบัญชีและการแข่งขัน async
- `tests/daily_entry_learning.test.js` ตรวจ cache เก่า/ใหม่ หมวดหมู่พร้อมกระปุก ทางลัด ผู้ใช้แก้เอง แบบร่างยกเลิกและเสียง ทั้ง source และ built
- Build ผ่าน `createMemoryBuild` ในหน่วยความจำจาก source ปัจจุบัน ไม่มีการเขียน generated artifact ลงดิสก์ เพิ่ม transaction error event ใน IndexedDB harness และ timeout เพื่อป้องกันผลผ่านจาก Promise ค้าง
- ข้อจำกัด: browser sandbox จำลอง DOM/events/IndexedDB ไม่ใช่ browser layout engine ไม่ได้ตรวจ datalist popup, native details ด้วยคีย์บอร์ด, responsive layout หรือหน้าจอมือถือจริงในงานนี้ และไม่ได้เรียก Supabase/Gemini จริง
- ขอบเขตที่แก้: `src/app.ts`, `src/index.template.html`, `scripts/run_tests.js`, `tests/app_harness.js`, `tests/idb_harness.js`, `tests/daily_entry_learning.test.js`, `tests/transaction_entry.test.js`, `README.md`, `STATUS.md`; บันทึก UTF-8 without BOM
- รอ Antigravity ที่ **Gate 12** เพื่อตรวจแผนและ QA/diff ตามขั้นตอน ผู้พัฒนาไม่ได้ออก RELEASE_MANIFEST หรือ merge เข้า main และไม่ได้แก้ไฟล์สถานะ/อนุมัติที่ถูกป้องกัน

---

## ผลงาน TASK-SLIPSENSE-V4-008

ปรับระบบเป็น 6 กระปุก โดยแยกเงินสะสมประกันแดน 2,900 บาท/เดือน เป้าหมายรายปี 34,800 บาท ค่าใช้จ่ายคงที่ใหม่ 9,800/11,100 บาท และเงินทั่วไป 12,800/11,500 บาทเมื่อเงินเดือน 45,000 บาท ยอดประกันแดนสะสมข้ามเดือนและข้ามปี ไม่ถูกกวาดโดย rollover และจ่ายจริงผ่านฟอร์มยืนยันแยกจากการสะสม

เพิ่ม 4 panels, Home แบบ Hero/กริด 2 คอลัมน์, Bottom Navigation, กราฟแท่งย้อนหลัง 6 เดือน, donut หมวดรายจ่าย และเกจประกันแดน พร้อมตาราง/ข้อความอ่านยอด เพิ่มเส้นทางตรวจข้อมูลเก่าที่มี marker ชัดเจนด้วยคู่ปรับกระปุกแบบ atomic; ข้อมูลคลุมเครือหรือเดือนที่ rollover แล้วต้องตรวจเองก่อน ไม่เดาและไม่ย้ายย้อนหลังด้วย SQL

### หลักฐาน self-test

- คำสั่ง: `node scripts/run_tests.js` ด้วย System Node.js `v24.16.0`
- ผลล่าสุด: ผ่าน **35/35** รายการระดับ suite/test case, ล้มเหลว **0**, exit code **0** (รวม assertions ย่อยใน regression suites)
- Regression ครอบคลุมเงินเดือนทั้งสองรอบ, 6 กระปุก, ทศนิยม, เงินไม่พอ/ติดลบ/ไม่จำกัด, แม่แบบเก่า/ปรับเอง, ผู้ใช้ต่างกัน, แบ่งซ้ำข้ามแท็บ, การจ่ายเบี้ยจริง, เงินสะสมข้ามปี, rollover ที่เว้นประกันแดน และการย้ายข้อมูลซ้ำโดยยอดสุทธิคงเดิม
- ทดสอบ IndexedDB ล้มเหลวหลังเริ่มเขียนขาโอน แล้วตรวจว่าการลองใหม่โอนครบยอด ไม่มีขาโอนหรือ ledger บางส่วนตกค้าง
- กราฟทดสอบทั้ง source และโค้ดหลัง build: เดือนว่าง, Bangkok timestamp ข้ามปี, รายการลบ/ผู้ใช้อื่น/ID ซ้ำ/วันที่ผิด/ยอดผิด, โอนภายใน, เงินเดือนรวม 45,000 ไม่บวกซ้ำ, เกจเกินเป้า, ไม่มีข้อมูล และข้อความหมวดที่มี markup ถูกใส่เป็น text
- Section 17 เรียก main ของ builder เดิมใน VM พร้อม filesystem adapter ในหน่วยความจำทั้งหมด รวม suite build เดิมที่ค้นพบอัตโนมัติ ตรวจ source/artifact SHA-256, minify/mangle 44 identifiers และไม่มี source map/secret ไม่ใช้ artifacts เก่า ไม่เขียน dist หรือไฟล์รากจริง operation ที่ไม่รองรับทำให้ล้มเหลว
- Build ที่ทดสอบล่าสุด: app source 210,799 bytes → compiled 150,219 bytes; HTML 222,400 bytes (เป็น artifacts ในหน่วยความจำ)

### หลักฐาน mobile และ keyboard

ตรวจด้วย Microsoft Edge headless ผ่าน CDP บน 127.0.0.1 โดยเสิร์ฟ HTML ที่ build ใหม่ในหน่วยความจำและใช้โปรไฟล์ชั่วคราวที่ล้างหลังทดสอบ ผลเป็นการตรวจ DOM/layout และ interaction ไม่ใช่การเทียบภาพ:

| ความกว้าง viewport | scrollWidth ทุกแท็บ | คอลัมน์ Home | Bottom Navigation |
| ---: | ---: | --- | --- |
| 320px | 320px | 142px + 142px | ปุ่มสูงอย่างน้อย 44px |
| 375px | 375px | 169.5px + 169.5px | ปุ่มสูงอย่างน้อย 44px |
| 390px | 390px | 177px + 177px | ปุ่มสูงอย่างน้อย 44px |
| 768px | 768px | 366px + 366px | ปุ่มสูงอย่างน้อย 44px |

ทั้งสี่แท็บมี aria-selected ตรงกันและย้าย focus ไป panel ที่เปิด ปุ่มลูกศรขวาจากหน้าหลักเลือกแท็บกระปุกพร้อม focus และ outline แบบ solid การทดสอบ VM ตรวจการคงตัวกรอง/แบบร่างและการ bind ซ้ำแล้ว Hero ทำงานเพียงครั้งเดียว

จำลอง Network offline ใน Edge แล้วแบ่งเงินเดือนลง IndexedDB สำเร็จ กราฟยังมี SVG 2 รูป ยอดรายรับเดือนที่เลือก 4,500,000 สตางค์ และมีรายการเติมประกันแดน 1 รายการ ไม่ต้องเรียกเครือข่ายเพื่อคำนวณกราฟ การทดสอบนี้ไม่ได้ยืนยัน cold-start offline หรืออุปกรณ์มือถือจริง

Safe-area: มี viewport-fit=cover และ env(safe-area-inset-bottom) พร้อมค่ากันพื้นที่ body ใน desktop emulation ค่า paddingBottom ของ navigation เท่ากับ 8px (safe-area inset เป็นศูนย์) ยังไม่ได้ตรวจอุปกรณ์ iOS/Android ที่มีรอยบากจริงหรือโปรแกรมอ่านหน้าจอจริง ไม่มีภาพอ้างอิงแนบ จึงยังไม่ตรวจความเหมือนภาพ

### Schema, ขอบเขต และการส่งต่อ

SQL แทนที่ CHECK เดิมแบบ transaction/รันซ้ำได้ และคง RLS/ownership/index ไม่ได้รัน migration กับฐานจริงหรือฐานทดสอบ PostgreSQL จึงยังต้องให้ Independent QA ตรวจ migration ก่อนเปิดซิงก์รุ่นนี้ JWT/rate limit และ Gemini secret ยังคงอยู่ฝั่ง Edge Function

แก้เฉพาะ 9 ไฟล์ใน allowlist: src/app.ts, src/index.template.html, supabase.sql, supabase/functions/analyze-receipt/index.ts, scripts/run_tests.js, tests/salary_template.test.js, tests/fixed_expense_batch.test.js, README.md และ STATUS.md ทุกไฟล์บันทึก UTF-8 without BOM ตรวจ git diff --check และขอบเขต git status อีกครั้งก่อนส่งรายงาน

ส่ง DEV_REPORT เป็น JSON ในผลตอบกลับให้ runner รับต่อ เพราะไฟล์ DEV_REPORT.json และ .agent_loop อยู่นอก write allowlist ของ Developer นี้ ไม่สร้าง/แก้ state หรือเอกสาร Gate เอง ขั้นต่อไปคือ Independent QARunner และหยุดให้ Antigravity ตรวจแผน/QA/diff ที่ Gate 12 ตาม failover protocol (สถานะที่ runner ต้องจัดการ: QA_RUNNING, active_agent Antigravity) ผลนี้เป็น self-test ของ Developer เท่านั้น ยังไม่ใช่ Independent QA/การอนุมัติ release ไม่สร้าง RELEASE_MANIFEST และไม่ merge main

---

## บันทึกสถานะก่อนงานนี้ (ข้อมูลประวัติ ไม่ใช่ผล QA ของ TASK-SLIPSENSE-V4-008)

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
