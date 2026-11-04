# รายงานสถานะโปรเจกต์ (STATUS.md) — SlipSense (`slipsense-expense-tracker`)

**วันที่อัปเดตล่าสุด:** 3 พฤศจิกายน 2026
**สภาพแวดล้อม:** Personal PC Edition (`LAPTOP-C8VOI2RL`) — System Node.js `v24.16.0` (`http://127.0.0.1:8080`)  
**สถานะโดยรวม:** TASK-SLIPSENSE-V4-015 (3D Cute Kawaii UI & Jar Shelf Upgrade) และ TASK-SLIPSENSE-V4-014C (Custom Fund Buckets & Compact Scan Hub) พัฒนาและตรวจสอบเสร็จสมบูรณ์ในโหมด Single-Agent ตามคำสั่งผู้ใช้; Build Production (`index.html`, `sw.js`, `dist/**`) และรันชุดทดสอบอัตโนมัติ `node scripts/run_tests.js` ผ่านครบ **41/41 รายการ (exit code 0)**

## ผลงาน TASK-SLIPSENSE-V4-018 (RocketTool-Engine Stock Portfolio Tracker, P/L Calculator, Asset Allocation Donut & TradingView Charts)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **โมเดลข้อมูลและการจัดเก็บออฟไลน์ (Data Model & Storage):**
     - สร้างโครงสร้างข้อมูล `StockHolding` (ticker, name, shares, costBasis, avgCost, currentPrice, targetPct, currency) และ `StockTransaction` (buy/sell, quantity, price, amount, realizedPL, fundId, tradeDate)
     - บันทึกลง IndexedDB (`slipsense_db`) และจัดเก็บแบบ Offline-First
     - เชื่อมโยงเงินสดกับกระปุก **📈 หุ้น/ลงทุน** (`investment_stock`) เมื่อกดบันทึกซื้อหุ้นจะตัดเงินจากกระปุก และเมื่อขายหุ้นจะนำเงินสดพร้อมผลกำไร/ขาดทุนกลับเข้ากระปุกอัตโนมัติ
  2. **RocketTool P/L Calculation Engine (ถอดรหัส Logic 100%):**
     - คิดต้นทุนเฉลี่ยถ่วงน้ำหนัก (`Weighted Average Cost`) เมื่อซื้อเพิ่ม
     - คิดกำไร/ขาดทุนที่รับรู้จริง (`Realized P/L`) เมื่อขายออก
     - คิดกำไร/ขาดทุนสุทธิที่ยังไม่ขาย (`Unrealized P/L`) ทั้งจำนวนเงินและเปอร์เซ็นต์ผลตอบแทน (`+XX.X%` สีเขียว / `-XX.X%` สีแดง) ทั้งรายตัวและภาพรวมทั้งพอร์ต
  3. **RocketTool Asset Allocation Donut & Target Progress Bar:**
     - กราฟโดนัท Pure SVG Arc ด้วยสูตรเรขาคณิต `cR` (`createSvgArcPath`) จาก Rocket Tool พร้อมสรุปมูลค่ารวมตรงกลางและ Legend แสดงสัดส่วนเปอร์เซ็นต์
     - แถบสัดส่วนแคปซูลมน (`.ch-bar`) พร้อมขีดบอกเป้าหมายสีทอง (`.tgt`)
     - เครื่องคิดเลขจำลองการซื้อ (`Rebalance Simulator`) คำนวณต้นทุนใหม่และสัดส่วนใหม่ล่วงหน้า พร้อมระบบเตือนสติการเงิน (`⚠️ สัดส่วนจะเกินเป้า X%` / `✓ ยังอยู่ในกรอบเป้า`)
  4. **TradingView Real-Time Chart Integration:**
     - ฝังวิดเจ็ตกราฟแท่งเทียนสดจาก TradingView Advanced Chart รองรับหุ้นสหรัฐฯ (NASDAQ/NYSE), หุ้นไทย (SET:PTT), คริปโต (BTC, ETH), และทองคำ
  5. **Quick Market Price Update:**
     - มีโมดอลเปิดให้กรอก/อัปเดตราคาตลาดปัจจุบันของหุ้นทุกตัวได้อย่างสะดวกรวดเร็ว
  6. **ผลการทดสอบและการ Build:**
     - เพิ่มชุดทดสอบ `tests/portfolio_engine.test.js`
     - รัน `node scripts/build_prod.js` และ `node scripts/run_tests.js` ผ่านครบ **42/42 รายการ (100% PASS, 0 failure)**
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** ส่งมอบเข้าสู่ Release Gate และขออนุมัติจากผู้ใช้

## ผลงาน TASK-SLIPSENSE-V4-017 (De-duplication & Daily Life Categories with Travel & Pets)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **แก้ไขจุดซ้ำซ้อนในทุกกระปุก:**
     - ตรวจพบว่าในการ์ดกระปุกเดิม (`fund-card`) มีการแสดงชื่อกระปุกซ้ำสองครั้งในใบเดียวกัน (แสดง `jar-name` ที่ส่วนหัว แล้วแสดง `fund-title: 📈 หุ้น/ลงทุน, 🏡 สร้างบ้าน, 📌 รายเดือน` ซ้ำอีกครั้งข้างปุ่มแก้ไข/ลบ) ได้ตัดการแสดงชื่อซ้ำซ้อนออก ให้คงชื่อสั้นและไอคอน 3D ที่กระชับสวยงามเพียงจุดเดียว
     - ปรับลดความซ้ำซ้อนของคำอธิบายฟิลด์ในฟอร์มบันทึกรายการ จากเดิมที่ยาวเหยียด `ส่วนของเงิน (เลือกจาก 6 ส่วนเมื่อถอนออก/จ่าย หรือเติมเข้า) *` ให้กระชับเหลือ `กระปุกตัดจ่าย *`
  2. **หมวดหมู่ดร็อปดาวน์และปุ่มเลือก 3D มีรูปและชื่อสั้นกระชับ:**
     - ปรับตัวเลือกใน Dropdown ทั้งหมด (`#txFormCategory`, `#filterCategorySelect`) ให้มีรูป Emoji และชื่อสั้นชัดเจน:
       - 🍜 อาหาร (`food_drink`)
       - 🍎 ของใช้ (`groceries`)
       - 🚗 เดินทาง (`transport`)
       - ✈️ ท่องเที่ยว (`travel` — เพิ่มตามคำสั่งผู้ใช้ สำหรับค่าที่พัก ทริป โรงแรม ตั๋วเดินทาง)
       - 📌 บิล/น้ำไฟ (`utilities_bills`)
       - 🎁 ช้อปปิ้ง (`shopping_general`)
       - 🏡 ที่พัก/บ้าน (`home_repair`)
       - 🛡️ สุขภาพ (`health_medical`)
       - 🌈 บันเทิง (`entertainment`)
       - 🎓 ศึกษา/งาน (`education_work`)
       - 🐱 สัตว์เลี้ยง (`pet` — เพิ่มสำหรับค่าอาหารและดูแลสัตว์เลี้ยง)
       - 🐷 โอนเงิน/อื่นๆ (`transfer_other`)
       - 💰 เงินเดือน / 📈 ธุรกิจ / ✨ รายรับอื่นๆ (สำหรับรายรับ)
  3. **เอาจุดซ้ำซ้อนในแผงเลือกหมวดหมู่ออก:**
     - แผงเลือกหมวดหมู่ 3D (`#txCategoryPicker`) แยกแสดงตามประเภทรายการ (Type): เมื่อเลือกรายจ่าย จะแสดงเฉพาะหมวดหมู่รายจ่าย ไม่ปะปนกับหมวดหมู่เงินเดือน/ธุรกิจ เพื่อความกระชับและไม่สับสน
  4. **อัปเกรด Edge Function และ AI Extraction:**
     - อัปเดต `supabase/functions/analyze-receipt/index.ts` และ `normalizeAiAnalysisResult` ในเครื่องให้ตรวจจับใบเสร็จหมวดท่องเที่ยว (`travel`) และสัตว์เลี้ยง (`pet`) ได้อัตโนมัติ
  5. **อัปเกรด Service Worker Cache:** ปรับ `CACHE_VERSION` เป็น `slipsense-app-shell-v4-3d-cute-3` เพื่อบังคับให้อุปกรณ์มือถือ/แท็บเล็ตล้างแคชเก่าและโหลดข้อมูลหมวดหมู่ใหม่ทันที
  6. **ผลการทดสอบ:** รัน `node scripts/build_prod.js` และ `node scripts/run_tests.js` ผ่านครบ **41/41 รายการ (100% PASS, 0 failure)**
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** นำขึ้น GitHub Pages เพื่อให้อุปกรณ์มือถือและแท็บเล็ตอัปเดตเวอร์ชันล่าสุด

## ผลงาน TASK-SLIPSENSE-V4-016 (Compact Cute Kawaii UI, 3D Bottom Bar & 3D Category Picker)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **เอาส่วนปุ่มทางลัดออกจากหน้าหลัก:** ลบ `.app-grid` (กระปุก, กราฟ, ประวัติ, แบ่งงบ) ออกจากหน้าหลัก (`#panel-home`) ตามคำขอ เนื่องจากมี Bottom Bar ครอบคลุมฟังก์ชันแล้ว ช่วยประหยัดพื้นที่แนวตั้งบนมือถือได้มากกว่า 130px
  2. **ทำ Bottom Bar เป็นรูป 3D Kawaii:** เปลี่ยนไอคอนในแท็บนำทางหลักด้านล่างเป็นไอคอน 3D (`house`, `pig`, `stock`, `bills`) ขนาด 26px พร้อมชื่อสั้นน่ารัก (`หน้าหลัก`, `กระปุก`, `กราฟ`, `ประวัติ`) และปุ่ม FAB สแกนใบเสร็จ/สลิปตรงกลางขนาด 54px ที่สวยงามกระชับ
  3. **หมวดหมู่มีรูป 3D ครบทุกจุด:**
     - เพิ่มแผงเลือกหมวดหมู่ 3D (`#txCategoryPicker`) ในฟอร์มตรวจทานและบันทึกรายการ (`#verificationModal`) ให้ผู้ใช้สามารถแตะเลือกหมวดหมู่ได้อย่างรวดเร็วด้วยไอคอน 3D และชื่อสั้น (`อาหาร`, `ของใช้`, `เดินทาง`, `บิล/น้ำไฟ`, `ช้อปปิ้ง`, `ซ่อมบ้าน`, `สุขภาพ`, `ศึกษา/งาน`, `บันเทิง`, `โอนเงิน`) ซิงก์กับ dropdown อัตโนมัติ
     - สรุปหมวดหมู่รายจ่ายหน้าหลัก (`#categoryBreakdownContainer`) แสดงไอคอน 3D 32px ด้านซ้ายคู่กับชื่อสั้นและแถบสัดส่วน
     - แถวรายการธุรกรรมล่าสุด (`tx-item`) และแท็บประวัติ ใช้ไอคอน 3D 40px ที่กระชับและป้ายชื่อหมวดหมู่สั้น
     - กราฟโดนัทในแท็บวิเคราะห์แสดงไอคอน 3D คู่กับคำอธิบาย
  4. **ปรับ UI/UX ให้กระชับที่สุด (Compact UI):**
     - ปรับขอบจอ `.app-panels` เป็น max-width 680px และ padding 8px 10px สไตล์ Mobile-First
     - ลดช่องว่าง `.balance-hero`, ยอดเงินคงเหลือสุทธิใช้ `clamp(1.8rem, 6.5vw, 2.3rem)` และกล่องสรุปรายรับ-รายจ่ายกระชับขึ้น
     - ชั้นวางกระปุก `.jar-shelf` ปรับคอลัมน์เป็น `minmax(100px, 1fr)`, ความสูงการ์ดลดลงเหลือ ~115px ประหยัดพื้นที่หน้าจอ
     - แถบ Bottom Nav ปรับความสูงกระชับ ~48px รองรับ safe-area-inset สำหรับ iPhone และ Android
  5. **อัปเกรด Service Worker Cache:** ปรับ `CACHE_VERSION` เป็น `slipsense-app-shell-v4-3d-cute-2` เพื่อให้มือถือและแท็บเล็ตอัปเดตแคช PWA เป็นเวอร์ชันล่าสุดทันที
  6. **ผลการทดสอบ:** รัน `node scripts/build_prod.js` และ `node scripts/run_tests.js` ผ่านครบ **41/41 รายการ (100% PASS, 0 failure)**
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** นำโค้ดขึ้น GitHub เพื่อให้ GitHub Pages อัปเดตไปยังมือถือและแท็บเล็ตของผู้ใช้

## ผลงาน TASK-SLIPSENSE-V4-015 (3D Cute Kawaii UI & ชั้นวางกระปุกของฉัน)

- **สิ่งที่ทำเสร็จแล้ว:**
  - เพิ่มคลังภาพเวกเตอร์ 3 มิติแบบพาสเทล (`ICON_ARTWORK`, `ICON_KEYS`, `render3dIcon`) ใน `src/app.ts` รองรับ 19 ไอคอนกระปุกและทุกหมวดหมู่ธุรกรรม พร้อมแสงเงา 3 มิติ (`radialGradient`, `linearGradient`, `feDropShadow`) และใบหน้าตัวการ์ตูน Kawaii
  - เพิ่มชั้นวาง **กระปุกของฉัน** (`#homeJarShelf`) บนหน้าแรก (`#panel-home`) และอัปเกรดการ์ดกระปุกในแท็บกระปุก (`#panel-funds`) ให้แสดงไอคอน 3D ขนาดใหญ่ ชื่อสั้นอ่านง่าย แถบความคืบหน้า (`jarProgress`) และการ์ดปุ่ม **+ เพิ่มกระปุก** (`.jar-add-card`)
  - เชื่อมไอคอน 3D เข้ากับแถวรายการธุรกรรม (`createTransactionCard`), สรุปหมวดหมู่รายจ่าย (`#categoryBreakdownContainer`), คำอธิบายกราฟโดนัท (`.chart-legend`), ทางลัดหน้าแรก (`renderShortcutIcons`) และแผงเลือกไอคอนกระปุก (`#bucketIconPicker` ครบ 19 แบบ)
  - อัปเดต `CACHE_VERSION` ใน `src/sw.ts` และ `sw.js` เป็น `slipsense-app-shell-v4-3d-cute-1` และสั่ง `registration.update()` ใน `registerServiceWorkerSafe()` เพื่อให้เบราว์เซอร์ดึงหน้าตาใหม่ทันที
  - รัน `node scripts/build_prod.js` และ `node scripts/run_tests.js`: ผ่านครบ **41/41** รายการ (ล้มเหลว 0)
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** เปิดใช้งานหรือรีเฟรชหน้าเว็บที่ `http://127.0.0.1:8080` (กด `Ctrl+F5` หากเปิดค้างไว้) หรือนำขึ้น GitHub Pages

## ผลงาน TASK-SLIPSENSE-V4-013

Edge Function รองรับ fallback เมื่อได้รับ HTTP 404/503/504/408 และยังมีโมเดลสำรอง โดยคงลำดับ candidate เดิมและตัดชื่อซ้ำ ยกเลิก response body ก่อนเปลี่ยนโมเดล รอ 300ms สำหรับ 503/504/408 ส่วน 404 ไม่รอ ใช้ AbortController กับ timeout รวม 25 วินาทีเดียว รวมการยกเลิก body ช่วงรอ และการอ่านผลลัพธ์ หยุดรอเมื่อ abort และไม่เริ่มคำขอใหม่หลังหมดเวลา จอง `consume_ai_rate_limit` เพียงครั้งเดียวต่อคำขอ คง JWT/input/schema validation และ Verification Form เดิม

HTTP 400/401/403/429 และสถานะนอกชุด fallback หยุดทันที รวมถึง network error, timeout รวม และผลลัพธ์ผิด schema เมื่อหมด candidate ใช้เส้นทาง error เดิมโดยไม่ยกเลิก body สุดท้าย หากยกเลิก body ไม่สำเร็จจะเข้าตัวจัดการข้อผิดพลาดเดิม นโยบายหยุด 429 และ delay 300ms เป็นข้อกำหนดของงานนี้; [Google แนะนำ retry ด้วย exponential backoff](https://ai.google.dev/gemini-api/docs/troubleshooting) สำหรับ transient errors รวมถึง 429

### ผลตรวจจริงและขอบเขตงาน

- ทำงานที่ `C:/Users/SlipSense/.agent_loop/worktrees/TASK-SLIPSENSE-V4-013` สาขา `agent-task/TASK-SLIPSENSE-V4-013` ด้วย System Node.js `v24.16.0` และ Git จาก codex runtime
- รัน `node scripts/run_tests.js` ผ่าน **40/40** ล้มเหลว **0**, exit code **0**; Suite 4 ทดสอบ handler จริงใน VM พร้อม mock fetch/RPC และนาฬิกา deterministic แยก timeout รวมจาก delay โดยไม่มีการเรียก Gemini จริง
- แยกกรณีสำเร็จหลัง 503, 504 และ 408 ตรวจ URL ตามลำดับ, cancellation ก่อนรอ, delay 300ms, payload/signal เดิม และ quota ครั้งเดียว รวม regression 404 ไม่รอ, ตัด candidate ซ้ำ, หมด candidate, หยุด 400/401/403/429/500, cancellation ล้มเหลว, timeout ระหว่างรอ/attempt/อ่าน body และการล้าง timer/listener
- แก้เฉพาะ `supabase/functions/analyze-receipt/index.ts`, `scripts/run_tests.js`, `README.md`, `STATUS.md` เป็น UTF-8 without BOM ไม่แก้ไฟล์ควบคุมหรือ protected paths
- ตาม AGENTS.md งาน implementation ต้องผ่าน **Dual-Agent V4 failover** ใน isolated worktree และหยุดรอ Antigravity ที่ **Gate 12** (`QA_RUNNING`, `active_agent: Antigravity`) ห้ามออก `RELEASE_MANIFEST.json` หรือ merge/deploy ก่อนตรวจครบ รอบ Developer นี้รับงานจาก runner ที่สถานะ `IMPLEMENTING` พร้อมแผนอนุมัติแล้ว ผล self-tests นี้ยังไม่ใช่ Independent QA หรือหลักฐานว่าถึง Gate 12 และไม่อนุมัติ release

## ผลงาน TASK-SLIPSENSE-V4-012

ธีมเริ่มต้น FinTrack ใช้พื้นเข้ม Emerald/Indigo/Rose พร้อมยอดคงเหลือเด่น รายรับ/รายจ่ายมีเครื่องหมาย รายการล่าสุดและตัวกรองแยกจากประวัติ ป้าย AI ตามแหล่งรายการ สถานะซิงก์จริง ปุ่มสแกนกลางและ AI callout ใช้ capture flow เดิม คงธีม light/dark/blue/dark-red และ preference เดิม รวมถึง Verification Form ให้ตรวจทานก่อนบันทึก

Edge Function ใช้ค่าเริ่มต้น `gemini-3.8-flash` และลำดับสำรองที่ตัดชื่อซ้ำ เปลี่ยนโมเดลเฉพาะ HTTP 404 ใช้ timeout เดียวทั้งชุด ตรวจ JWT/input และจอง atomic rate-limit ครั้งเดียวก่อนเรียกโมเดล คง schema และการไม่เดาวันที่/ยอดเงิน Health check แสดง configured model ส่วน response วิเคราะห์แสดงโมเดลที่สำเร็จจริง

### หลักฐานและข้อจำกัดการตรวจ

- ตรวจ repository root และ branch จริง: `C:/Users/SlipSense/.agent_loop/worktrees/TASK-SLIPSENSE-V4-012`, `agent-task/TASK-SLIPSENSE-V4-012` ใช้ System Node.js `v24.16.0` และ Git จาก runtime ตาม AGENTS.md
- รับช่วง source และ build artifacts ที่พัฒนาและ build แล้ว 10 ไฟล์ตามคำสั่ง รอบดำเนินการต่อนี้แก้เฉพาะ `README.md` และ `STATUS.md` ไม่รัน production builder เขียนทับ artifacts ใหม่
- รัน `node scripts/run_tests.js`: ผ่าน **37/37**, ล้มเหลว **0**, exit code **0** รวมการ build/ตรวจ source และ built ในหน่วยความจำ, production security gate, Edge handler ใน VM พร้อม mock RPC/fetch/timers และ behavioral UI tests
- ตรวจธีม/first paint/preference, IDs, CSS responsive/reduced motion, navigation/FAB, analysis lifecycle, signed amounts, AI badges, latest filtering และการ bind ผ่าน Node.js ตามชุดทดสอบ ตรวจ build manifest hashes และ output ผ่าน production build tests
- Step 17 ใช้ CSS rules และ Node.js tests แทนเบราว์เซอร์ตามข้อกำหนด Headless Sandbox **ไม่ได้เปิดเบราว์เซอร์หรือใช้ Computer Use** จึงยังไม่ยืนยันภาพจริง/overflow ที่ 320, 375, 390, 768px และจอใหญ่ รวมถึง native controls, modal และอุปกรณ์จริง
- ไม่เรียก Supabase/Gemini จริง ผล mock ไม่ยืนยันการมีอยู่จริงของชื่อโมเดล สิทธิ์บัญชี หรือคุณภาพ OCR; ไม่สามารถยืนยัน baseline ก่อน build ของรอบก่อนจากการรับช่วงเพียงอย่างเดียว
- ขอบเขต diff รวม 12 ไฟล์: `supabase/functions/analyze-receipt/index.ts`, `src/index.template.html`, `src/app.ts`, `index.html`, `sw.js`, `dist/index.html`, `dist/sw.js`, `dist/BUILD_MANIFEST.json`, `scripts/run_tests.js`, `tests/aurora_theme.test.js`, `README.md`, `STATUS.md` เอกสารบันทึก UTF-8 without BOM

### ส่งต่อ Runner และ Gate 12

ให้ Independent QARunner ตรวจ diff และผลทดสอบจริง หากไม่ผ่านให้ Runner จัดการซ่อมเฉพาะ worktree ไม่เกิน 3 รอบ การสร้าง `QA_REVIEW_REQUEST.json` และตั้ง `QA_RUNNING` / `active_agent: Antigravity` เป็นหน้าที่ Runner เมื่อสอดคล้องกับ policy ข้อความนี้เป็นสถานะส่งต่อ ไม่ได้อ้างว่าแก้ workflow state แล้ว ผู้พัฒนาไม่แก้ protected workflow files ไม่สร้าง `RELEASE_MANIFEST.json` และไม่ merge เข้า main รอ Antigravity ตรวจทั้งแผนและ QA ที่ Gate 12

---

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
## TASK-SLIPSENSE-V4-014C — ผลตรวจใน Worktree (2 พฤศจิกายน 2026)

สถานะการพัฒนา: เสร็จแล้ว ส่งต่อ Antigravity ตรวจตามกระบวนการเดิม ยังไม่ merge หรือ release และไม่ได้แก้ไฟล์ควบคุมสถานะของ runner ข้อความสถานะงานเก่าด้านล่างเป็นประวัติ ไม่ใช่ผลยืนยันของงานนี้

- เพิ่ม registry กระปุกกำหนดเอง ชื่อ/ไอคอน/สี/ประเภทสะสมหรือรายเดือน พร้อมเพิ่ม แก้ไข ลบและย้ายรายการหลัง IndexedDB transaction commit รองรับการแยกบัญชี คิว durable และ tombstone
- เพิ่ม SQL migration, ENABLE/FORCE RLS, สิทธิ์ authenticated และ RPC ย้าย/ลบแบบ atomic พร้อมป้องกันลบใบสุดท้ายและ retry ซ้ำ ซิงก์ registry ก่อนธุรกรรม และตามปลายทางใหม่เมื่ออีกอุปกรณ์ลบกระปุกปลายทางเดิม
- รวมหน้าแรกเป็น scan hub เดียว ใช้ปุ่ม ถ่ายสลิป/เลือกรูป/จดเอง ปุ่มลัดชื่อสั้น และ modal จัดการกระปุกพร้อม Escape, focus trap และคืน focus
- สร้าง index.html, sw.js และ dist/** ด้วย `node scripts/build_prod.js` โดย System Node.js v24.16.0: ผ่าน exit code 0; build ตรวจ Security & IP Gate ผ่าน (10 deployable files) อัปเดต SW cache เป็น v4-dynamic-buckets-1 โดยไม่ล้าง IndexedDB
- `node scripts/run_tests.js`: ผ่าน 41/41 รายการระดับ runner, ล้มเหลว 0, exit code 0 รวม behavioral assertions ทั้ง source และ built สำหรับ CRUD, ประเภทกระปุก, ย้ายยอด/จำนวนคงเดิม, rollback, เปิดใหม่, ไม่ seed คืน, offline retry, แยกบัญชี, schema contract, server-only rows จำลอง และปลายทางที่ถูกลบจากอีกอุปกรณ์
- UI/mobile: ตรวจโครงสร้าง DOM, accessibility attributes และ CSS แถว 3 ปุ่มด้วยชุดทดสอบแล้ว ยังไม่ได้ตรวจ rendering ที่ความกว้างมือถือจริง เครื่องมือ browser แจ้ง “The browser access host is unavailable” จึงไม่มีผล visual/mobile browser สำหรับงานนี้
- Offline: ผ่านการทดสอบ IndexedDB และ client จำลอง ไม่ได้ยืนยัน offline browser restart หรือ service worker upgrade จริงบนอุปกรณ์
- SQL ยังไม่ได้ apply ฐานข้อมูลจริง และไม่ได้รัน RLS integration ด้วยผู้ใช้สองราย/anon หรือ concurrent delete จริง ไม่มีผลทดสอบ PostgreSQL อ้างอิงแทน unit assertions ต้องตรวจในฐานข้อมูลทดสอบก่อนใช้จริง
- ตรวจขอบเขตด้วย git status รวม untracked และ diff: การแก้ไขอยู่ใน allowlist ของงานเท่านั้น รายงาน DEV_REPORT ส่งเป็น JSON ในผลตอบกลับเพื่อให้ runner รับต่อ โดยไม่สร้างไฟล์นอก allowlist
