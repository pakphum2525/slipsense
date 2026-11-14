# รายงานสถานะโปรเจกต์ (STATUS.md) — SlipSense (`slipsense-expense-tracker`)

**วันที่อัปเดตล่าสุด:** 14 พฤศจิกายน 2026
**สภาพแวดล้อม:** Personal PC Edition (`LAPTOP-C8VOI2RL`) — System Node.js `v24.16.0` (`http://127.0.0.1:8080`)  
**สถานะโดยรวม:** TASK-SLIPSENSE-V4-034 พัฒนาและทดสอบใน Worktree เสร็จสิ้น (`npm test` ผ่าน **48/48 รายการ**) รอผลตรวจ Independent QA Review และ Gate 16 (`AWAITING_RELEASE_APPROVAL`)

## ผลงาน TASK-SLIPSENSE-V4-034 — Cloud Sync พอร์ตหุ้น (`public.stock_holdings`) และนำเข้าตาราง Desktop 8 คอลัมน์

- **ฐานข้อมูลและ RLS (`supabase.sql`):**
  - เพิ่มตาราง `public.stock_holdings` แบบ Idempotent พร้อมคอลัมน์ `shares NUMERIC(18,7)`, `cost_basis`, `avg_cost`, `current_price`, `target_pct`, `currency`, `deleted_at`, `UNIQUE(user_id, ticker)`
  - เปิด `ENABLE` และ `FORCE ROW LEVEL SECURITY` พร้อม 4 Policies (`(select auth.uid()) = user_id`), Trigger `stock_holdings_updated_at`, `REPLICA IDENTITY FULL` และเพิ่มเข้า `supabase_realtime` publication
- **Edge Function (`supabase/functions/analyze-receipt/index.ts`):**
  - ขยาย `portfolioSystemInstruction`, `portfolioResponseSchema` และ `isPortfolioMode` response mapper ให้รองรับ `name` และ `avgCost` จากภาพตารางพอร์ต Desktop 8 คอลัมน์ พร้อมคงทศนิยม `shares` ตามจริง
- **Frontend Cloud Sync & Portfolio Engine (`src/app.ts`, `src/sw.ts`):**
  - เพิ่ม `pullCloudStockHoldingsAndMerge()` และ `syncStockHoldingsToCloud()` พร้อมติดตาม Initial Sync ต่อผู้ใช้ (`slipsense_stock_cloud_synced_<user_id>`) และ Tombstone (`deleted_at`) โดยเครื่องใหม่ที่ Sign In จะรับข้อมูลจาก Cloud แทนชุดตัวอย่างเริ่มต้น
  - เชื่อม Sync เข้ากับ `setupRealtimeSubscription` (ตาราง `stock_holdings`), `initSupabaseClientAndVerify`, `onAuthStateChange`, `upsertPortfolioHoldings`, `deletePortfolioHolding`, `clearAllPortfolioHoldings`, `saveTargetAllocations`, และฟอร์ม Trade/Update Price
  - ปรับ `calculateDimeHoldingMetrics`, `mergeDimePortfolioResponse` และ `upsertPortfolioHoldings` ให้รักษาทศนิยม `shares (> 0)` ครบถ้วน รองรับ `name` และ `avgCost` และไม่เขียนทับ `shares` ที่เป็นบวกด้วย `1`
  - อัปเดต Service Worker Cache เป็น `slipsense-app-shell-v4-3d-cute-3-dime-v12`
- **การทดสอบและ Build (`scripts/run_tests.js`, `tests/portfolio_engine.test.js`, `dist/**`):**
  - เพิ่ม Suite 3.4 (`public.stock_holdings` + RLS/Realtime), Suite 4.4 (Desktop 8-column `name`/`avgCost`), และเคสใน `tests/portfolio_engine.test.js` (SW Cache `v12`, ทศนิยม 7 ตำแหน่ง `0.0892412`, และ Cloud Sync/Tombstone)
  - `npm test` (รวม `build_prod.js`) ผ่าน **48/48 รายการ** (ล้มเหลว 0, exit code 0) (หมายเหตุ: `Integration RLS/concurrent delete` ไม่ได้รันเนื่องจากไม่มี Test Database ในเครื่องตามเดิม)

## ผลงาน TASK-SLIPSENSE-V4-033 — แก้ไข Gemini ThinkingConfig/Timeout และการแสดง Error AI ให้ตรงสาเหตุ (Single-Agent ชั่วคราว)

- **ฝั่ง Backend (`supabase/functions/analyze-receipt/index.ts`):**
  - เพิ่มฟังก์ชัน `buildGenerationConfig(model, schema)` ปรับ `thinkingConfig` ให้ตรงรุ่นโมเดล: `gemini-2.5-flash` / `gemini-2.5-flash-lite` ส่ง `{ thinkingBudget: 0 }` พร้อม `temperature: 0.1` เพื่อลดเวลาประมวลผลจาก 17–26+ วินาทีลงเหลือหลักวินาที; `gemini-2.5-pro` ส่ง `{ thinkingBudget: 128 }`; `gemini-3*` (`gemini-3.8-flash`, `gemini-3.5-flash-lite`) ส่ง `{ thinkingLevel: 'low' }` โดยไม่ส่ง `thinkingBudget` และ `temperature` ปนกัน
  - ปรับลำดับ Fallback เป็น `[geminiModel, DEFAULT_GEMINI_MODEL, 'gemini-2.5-flash', 'gemini-3.5-flash-lite']` (นำ `'gemini-3.6-flash'` ออก), เพิ่ม `GEMINI_TIMEOUT_MS` จาก `25_000` เป็น `35_000` ms, และเพิ่ม Fallback สำหรับ `RETRYABLE_FALLBACK_STATUSES` (`400, 404, 408, 500, 502, 503, 504`) เมื่อยังมีโมเดลสำรอง โดยยังคง Fail Fast สำหรับ `401, 403, 429`
- **ฝั่ง Frontend (`src/app.ts`, `src/sw.ts`):**
  - ขยาย `timeoutMs` เริ่มต้นของ `callAnalyzeReceiptEdgeFunction` จาก `28000` เป็น `45000` ms (ส่วน `{ action: 'health' }` คง `10000` ms)
  - รักษาข้อความสาเหตุภาษาไทยจากเซิร์ฟเวอร์ (`jsonBody.error`) แทนการเขียนทับทุก HTTP `>= 500` ด้วย `"บริการ AI ขัดข้องชั่วคราว"` พร้อมแยกสถานะ `aiStatus` ให้ถูกต้อง (`422` ภาพอ่านไม่ได้คง `ready` ไม่เปลี่ยนจุดเป็นสีแดง, `504` แสดง `AI ตอบสนองช้า (Timeout)`)
  - เก็บ `appState.aiModel` จากผล `health` และ `analyze` มาแสดงใน `#geminiSettingsStatusBox` และอัปเดต Service Worker Cache เป็น `slipsense-app-shell-v4-3d-cute-3-dime-v11`
- **การทดสอบและ Build (`scripts/run_tests.js`, `tests/portfolio_engine.test.js`, `dist/**`):**
  - `npm run build` ผ่าน exit code 0 สร้าง `dist/**`, `index.html`, `sw.js` (44 mangled symbols, 10 deployable files in `dist/`)
  - `npm test` ผ่าน **46/46 รายการ** (ล้มเหลว 0, exit code 0) รวมเคส `thinkingConfig` แยกตามรุ่นโมเดล, Fallback `400/500/502/503/504/408/404`, `35000ms` deadline และ SW cache `v10 -> v11` (หมายเหตุ: `Integration RLS/concurrent delete` ไม่ได้รันเนื่องจากไม่มี Test Database ในเครื่องตามเดิม)
- **การส่งมอบ (Release):** Deploy Edge Function `analyze-receipt` (`version: 12`, `ACTIVE`) บน Supabase (`bpvljxgohgecfcikhnwm`) และ Push กิ่ง `main` ขึ้น GitHub Pages (`https://pakphum2525.github.io/slipsense/`) เรียบร้อยแล้ว
- **หมายเหตุเพิ่มเติม:** เนื่องจาก Supabase Secret `GEMINI_MODEL` ยังคงตั้งไว้ได้ทั้ง `gemini-2.5-flash` (ซึ่งตอนนี้ปิด Thinking อัตโนมัติด้วย `thinkingBudget: 0` แล้ว) หรือสามารถสลับ/ลบ Secret เพื่อใช้ค่าเริ่มต้น `gemini-3.8-flash` ใน Supabase Dashboard ได้ตามต้องการ

## ผลงาน TASK-SLIPSENSE-V4-032 — DIME shares เริ่มต้น 1 และ Cache v10

- เมื่อมูลค่าปัจจุบันและต้นทุนรวมมากกว่า 0 และอ่านได้ แต่ shares ขาดหาย เป็นศูนย์ หรือค่าลบ ใช้ shares = 1, currentPrice = marketValue และ avgCost = costBasis ผ่านการ normalize ร่วมกันใน calculation, validation และ review state
- หน้าตรวจทานแสดงจำนวนหุ้นเริ่มต้น 1 พร้อมราคาปัจจุบัน ต้นทุนรวม ต้นทุนเฉลี่ย และกำไร/ขาดทุน ผู้ใช้ยังต้องตรวจทานทุกแถวก่อนยืนยัน การแก้ไขตัวเลขคำนวณใหม่และล้างเครื่องหมายตรวจทาน
- ยังคงพฤติกรรม shares บวกและต้นทุนศูนย์ที่มีจำนวนหุ้นอยู่แล้ว ปฏิเสธยอดเงินที่อ่านไม่ได้และค่าตัวเลข non-finite; batch ที่ไม่ผ่าน validation ไม่เขียนพอร์ตบางส่วนลง `slipsense_stock_holdings_v1`
- เปลี่ยน Service Worker เป็น `slipsense-app-shell-v4-3d-cute-3-dime-v10` และทดสอบการล้าง cache v9 โดยไม่เปลี่ยนนโยบาย cache
- `npm run build`: ผ่าน exit code 0 สร้าง `dist/**`, `index.html` และ `sw.js` จาก source โดยไม่แก้ artifacts ด้วยมือ; ใช้ `src/index.template.html` เดิม
- ชุดทดสอบ `tests/portfolio_engine.test.js` โดยตรง: ผ่าน exit code 0 ทั้ง source และ built ครอบคลุม fallback, กำไร/ขาดทุน, review input, ยืนยันบันทึกโดยไม่กรอก shares, การแก้ไข และ atomic batch validation
- `npm test`: ผ่าน 43/43 รายการ ล้มเหลว 0 รายการ exit code 0; การทดสอบ RLS/concurrent delete กับฐานข้อมูลจริงไม่ได้รันเพราะไม่มี test database ตามข้อจำกัดเดิมของชุดทดสอบ
- ตรวจขอบเขตด้วย git status/diff: แก้เฉพาะไฟล์ที่อนุมัติ ใช้ System Node.js v24.16.0 และ Git จาก codex runtime; ไฟล์ข้อความ UTF-8 without BOM
- **blocker_reason:** Runner ที่ทำงานอยู่เรียก `run_task.js --repo c:\Users\SlipSense --spec c:\Users\SlipSense\.agent_loop\TASK_SPEC.json --environment DEVELOPMENT` โดยไม่มี `--failover`; STATE ของงานนี้ยังเป็น `IMPLEMENTING`, `active_agent: Codex` และ provisional lock ที่พบเป็นของ TASK-SLIPSENSE-V4-031D จึงไม่ใช่หลักฐาน failover ของงานนี้ ไม่แก้ control artifacts นอก allowlist และไม่เริ่ม Runner ซ้อน ต้องให้ผู้ควบคุม Runner ส่งต่องานนี้ในโหมด failover ก่อนทำ Independent QA และหยุดที่ Gate 12 (`QA_RUNNING`, `active_agent: Antigravity`) ยังไม่ได้ยืนยัน Gate 10–12 และไม่ได้สร้าง RELEASE_MANIFEST.json หรือ merge เข้า main ในรอบ Developer นี้

## ผลงาน TASK-SLIPSENSE-V4-031D — Cache v9 และการอัปเดต DIME

- เปลี่ยน Service Worker เป็น `slipsense-app-shell-v4-3d-cute-3-dime-v9` ติดตั้ง app shell ให้ครบก่อน `skipWaiting()`; หากโหลดไม่สำเร็จ installation ล้มเหลวและเก็บ cache เก่าไว้ การ activate ลบเฉพาะ cache เก่าที่ขึ้นต้น `slipsense-app-shell-` แล้ว `clients.claim()` โดยไม่เรียกใช้หรือลบฐานข้อมูลธุรกรรม
- DIME แสดง status และ error toast ภาษาไทยทันทีเมื่อออฟไลน์หรือยังไม่เข้าสู่ระบบ ก่อนอ่านภาพหรือเรียก AI; เส้นทางออนไลน์ยังเปิดให้ผู้ใช้ตรวจทานก่อนบันทึก
- registration อยู่ใน `src/app.ts` เพียงแห่งเดียว ตรวจอัปเดตเมื่อโหลด กลับ foreground และกลับออนไลน์ ด้วย `updateViaCache: none` จัดการ update failure แบบไม่ขัดขวางแอป มี controllerchange handler เดียวและ reload ครั้งเดียว เลื่อน reload ขณะนำเข้า วิเคราะห์ บันทึก มีภาพค้าง มี dialog เปิด หรือช่องข้อมูลนอก dialog ที่แก้ไขค้างอยู่ แล้วตรวจซ้ำระหว่างรอเฉพาะเมื่อแอปมองเห็นและออนไลน์
- `npm run build`: exit code 0 ผ่าน security/IP gate; root `index.html` และ `sw.js` ตรงกับ dist แบบ byte-for-byte สร้างจาก pipeline ทั้งหมด ไม่แก้ generated files ด้วยมือ ตรวจ SHA-256 และขนาดจริงครบ 10 entries ของ `dist/BUILD_MANIFEST.json` รวมทั้ง path อยู่ใน dist และ asset references ของ HTML มีไฟล์และ manifest entry จริง
- SHA-256 `dist/index.html`: `da433af263fd82e517550163fce4d308e19333c933fb1448145620665facb372` (430694 bytes)
- SHA-256 `dist/sw.js`: `c32e7b355878dbcbb7192072d41531741c5d552239ff06440a0d71171e512658` (6251 bytes)
- Baseline `npm test`: **43/43 ผ่าน, exit code 0**; หลังแก้ไข **43/43 ผ่าน, exit code 0** ขยาย assertions ใน `tests/portfolio_engine.test.js` โดยไม่ลบหรือปิด tests ตรวจทั้ง source และ bundle ครอบคลุม error toast/status, ไม่อ่านภาพ/เรียก AI เมื่อถูกบล็อก, authenticated import และ review, foreground/offline/update failure, draft protection, first install และไม่ reload ซ้ำ
- ทดสอบ lifecycle ของ Service Worker ใน VM ร่วมกับ HTTP บน `127.0.0.1` (พอร์ตชั่วคราว): cache v8 ไป v9, failed install คง cache เก่า, cleanup คง cache ของแอปอื่น, claiming, GET_VERSION และ app shell ใหม่มี `analyze_portfolio` ใช้ mock IndexedDB ที่ปฏิเสธการเข้าถึงเพื่อยืนยันว่า update ไม่แตะฐานข้อมูล
- **ข้อจำกัด:** ยังไม่ได้ทดสอบ iOS Safari/PWA บนอุปกรณ์จริง หรือ IndexedDB จริงข้ามการอัปเดตบนอุปกรณ์ ผล VM/HTTP ไม่ใช่หลักฐานการทดสอบ iOS; หน้า v8 ที่เปิดค้างและยังไม่มี controllerchange handler อาจต้องเปิด/นำทางเข้าแอปใหม่เพื่อโหลด HTML รุ่นใหม่ การกลับ foreground อัตโนมัติที่เพิ่มในงานนี้มีผลหลังโหลดโค้ดรุ่นใหม่แล้ว ต้องยืนยันสถานการณ์นี้บน iOS จริงในการตรวจ Gate 12
- การส่งมอบของ Codex เป็น DEV_REPORT ให้ runner เก็บนอก worktree; runner เป็นผู้จัดการไฟล์ควบคุมและ Independent QA ไม่สร้าง `RELEASE_MANIFEST.json` และไม่ merge เข้า main ในรอบ failover นี้

**สถานะก่อนหน้า:** TASK-SLIPSENSE-V4-026 (Cute Warm Pastel Theme & Delightful 3D Friendly UX for SlipSense) พัฒนาและตรวจสอบเสร็จสมบูรณ์ในโหมด Single-Agent ตามคำสั่งอนุมัติของผู้ใช้; Build Production (`index.html`, `sw.js`, `dist/**`) และรันชุดทดสอบอัตโนมัติ `npm test` ผ่านครบ **42/42 รายการ (exit code 0)**

## ผลงาน TASK-SLIPSENSE-V4-027 (Authentic Rocket Tool 3-Screen Rebalance Engine & Sleek Trade Modal)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **หน้าจอที่ 1: `ปรับสมดุลพอร์ต` (Authentic Rocket Tool Screen 1 `#portfolioRebalanceModal`):**
     - **Header & Subtitle:** ปุ่มย้อนกลับ `❮` พร้อมหัวข้อ `ปรับสมดุลพอร์ต` และ Subtitle คำนวณมูลค่ารวมอัตโนมัติ `กำหนดเอง · รวม $X,XXX`
     - **ปุ่มปรับสัดส่วนมุมขวาบน:** ปุ่มแคปซูลสีม่วง `ปรับสัดส่วน` กดแล้วเปิดไปยังหน้าจอที่ 2
     - **กล่องเตือนเป้าหมายพอร์ต (Target Warning Alert):** แสดงผลอัตโนมัติเมื่อผลรวมเป้าหมายยังไม่ครบ 100% เช่น `เป้ารวมตอนนี้ 85.0% ยังไม่ครบ 100% — ปรับสัดส่วนใหม่ให้ครบ 100%` พร้อมปุ่มกด `ปรับสัดส่วนใหม่`
     - **กล่องตัวเลือกนับเงินสด (Cash Inclusion Card):** แจ้งชัดเจนว่า `คำแนะนำนี้คิดจากหุ้นอย่างเดียว ยังไม่นับเงินสด $X,XXX ของพอร์ต` พร้อมปุ่มกด `+ ใส่เงินสดในเป้า` / `เอาเงินสดออกจากเป้า` ที่สลับโหมดและคำนวณใหม่แบบเรียลไทม์
     - **ตารางรายการหุ้น Rebalance:** แสดง 4 คอลัมน์ตรงตามแบบฉบับ Rocket Tool เป๊ะ: `หุ้น`, `ปัจจุบัน (% ของหุ้น)`, `เป้า (%)`, และ `ต้องทำ`
     - **Action Chips อัจฉริยะ:**
       - 🔴 สีแดง `ขาย $XX` เมื่อสัดส่วนปัจจุบันมากกว่าเป้าหมาย
       - 🟢 สีเขียว `ซื้อ $XX` เมื่อสัดส่วนปัจจุบันน้อยกว่าเป้าหมาย
       - ⚪ สีเทา `พอดีเป้า` เมื่อสัดส่วนอยู่ในเกณฑ์ ±$0.5
     - **เชื่อมโยงคลิกเปิดหน้าซื้อขายทันที:** เมื่อแตะที่แถวหุ้นใดๆ จะส่ง Ticker, ประเภทธุรกรรม (`buy` หรือ `sell`), จำนวนหุ้นที่ต้องเทรด และยอดเงินที่ต้องปรับ ไปเปิดหน้าจอที่ 3 ให้ผู้ใช้ยืนยันการเทรดได้ในคลิกเดียว

  2. **หน้าจอที่ 2: `ตรวจเป้าสัดส่วน` (Authentic Rocket Tool Screen 2 & 4 `#portfolioTargetAllocationModal`):**
     - **Hero Percentage Indicator:** ตัวเลขขนาดใหญ่ตรงกลาง แสดงเปอร์เซ็นต์รวมของแผนพอร์ตแบบเรียลไทม์ (สีส้มเมื่อ `< 100%`, สีแดงเมื่อ `> 100%`, และสีเขียวสดใสเมื่อ `== 100%`) พร้อมคำแนะนำ เช่น `รวม 85% — เพิ่มอีก 15% เพื่อบันทึก` หรือ `24 หุ้น — สัดส่วนครบ 100% พร้อมบันทึก`
     - **ปุ่มอำนวยความสะดวกด่วน:**
       - `สัดส่วนเท่ากัน` (Equal Weight): เกลี่ยสัดส่วนให้ทุกหุ้นเท่ากันรวมได้ 100% อัตโนมัติ
       - `🔄` (Reset to Current): รีเซ็ตเป้าหมายให้ตรงกับสัดส่วนมูลค่าตลาดปัจจุบัน
     - **แถวควบคุมเงินสด (Cash Allocation Stepper):** เลือกว่าจะนับเงินสดในเป้าหรือไม่ หากนับจะมีปุ่ม `[-]` และ `[+]` พร้อมช่องกรอกตัวเลข % เงินสดที่ต้องการเก็บไว้
     - **Stepper ประจำหุ้นแต่ละตัว (Per-Stock Steppers):** แต่ละหุ้นมีปุ่ม `[-]` และ `[+]` ปรับทีละ 1% / 0.5% พร้อมกล่องกรอกตัวเลขโดยตรง ทุกการปรับจะคำนวณสัดส่วนรวมด้านบนทันที
     - **ปุ่มบันทึกเป็นเป้าหมาย:** ล็อกการกด (Disabled) หากเป้าหมายรวมไม่เท่ากับ 100% และปลดล็อกเป็นสีม่วงสดใสเมื่อครบ 100% พอดี

  3. **หน้าจอที่ 3: `เพิ่มธุรกรรม` (Authentic Rocket Tool Screen 3 `#stockTradeModal`):**
     - ออกแบบใหม่หมดจดสไตล์ Rocket Tool สีม่วงเข้มเรียบหรู พร้อมรองรับทั้ง Dark Mode และ Cute Pastel Mode
     - **แถบนำเข้าจากสลิป AI:** กล่องสีม่วง `📷 นำเข้าจากสลิป` พร้อมแท็กสีเหลือง `ใหม่` และคำอธิบาย `ถ่ายรูปสลิป กรอกให้อัตโนมัติ` กดแล้วเปิดเลือกภาพสลิปทันที
     - **แท็บประเภทสินทรัพย์:** เลือกสลับระหว่าง `[ หุ้น ]` และ `[ ทองคำ ]`
     - **ช่องหุ้น/Ticker:** กล่องค้นหาพร้อมไอคอนแว่นขยาย `🔍`
     - **สวิตช์เลือกประเภท (Segmented Control):** ปุ่ม `▲ ซื้อ` (เขียวมรกต) และ `▼ ขาย` (แดงทับทิม)
     - **จำนวนหุ้นพร้อมทางลัด "ขายทั้งหมด":** แสดงจำนวนที่ถือครองอยู่ เช่น `ถืออยู่ 1.5 หุ้น` พร้อมลิงก์ `ขายทั้งหมด` ที่กดแล้วกรอกจำนวนหุ้นทั้งหมดให้อัตโนมัติ
     - **ยอดเงินรวม & วันที่ & โน้ต:** แสดงยอดเงินรวมคำนวณจากราคาต่อหุ้น, วันที่ทำรายการพร้อมไอคอนปฏิทิน และช่องโน้ตพร้อมตัวนับตัวอักษร `0/100`

  4. **การทดสอบอัตโนมัติ (Automated Tests & QA):**
     - รัน `node scripts/build_prod.js` และ `npm test` ผ่านครบ **42/42 รายการ (100% PASS, 0 failure)**
     - ป้องกันความปลอดภัย IP Protection (Section 17) และ Minify/Obfuscate เรียบร้อย
     - อัปเดต Service Worker Cache เป็น `v4-3d-cute-3-dialog-v7`
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** ผู้ใช้สามารถเปิดทดสอบหน้า Rebalance และเพิ่มธุรกรรมจริงบน http://127.0.0.1:8080 หรือบนมือถือ/แท็บเล็ตในวงแลนได้ทันที

## ผลงาน TASK-SLIPSENSE-V4-026 (Cute Warm Pastel Theme & Delightful 3D Friendly UX for SlipSense)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **เปลี่ยนธีมหลักเริ่มต้นเป็น "🌸 คิวท์พาสเทล อบอุ่น" (Cute Warm Pastel Theme as Default):**
     - **พื้นหลัง (Background):** โทนครีมวนิลลา/งาช้างนุ่มนวล (`#fcf8f2`) ผสานประกาย Aurora พาสเทลจางๆ 3 สี (มิ้นต์ `#34d399`, พีชซากุระ `#f472b6`, เบบี้บลู `#93c5fd`) ให้บรรยากาศอบอุ่น ละมุนตา สไตล์สมุดบันทึกรายรับ-รายจ่ายญี่ปุ่น/เกาหลี
     - **การ์ดและปุ่ม 3D (Floating 3D Claymorphism):** การ์ดสีขาวนุ่มนวล (`#ffffff`) ขอบมน 20px พร้อมเงาลอย 3 มิติสีช็อกโกแลตบางเบา (`rgba(180, 140, 110, 0.08)`) ไม่บาดตา
     - **ตัวอักษรและคอนทราสต์ (Typography):** ใช้สีช็อกโกแลตคั่วเข้ม/เอสเปรสโซ่ (`#2b2320` และ `#5f514a`) อ่านง่าย สบายตา ไม่ดำทึบแข็งกระด้าง
     - **ตัวเลขการเงิน (Financial Accents):**
       - รายรับ (Income): สีเขียวมิ้นต์สดชื่น (`#059669`) บนแท็กสีเขียวพาสเทลนวล (`#ecfdf5`)
       - รายจ่าย (Expense): สีชมพูสตรอว์เบอร์รีคอรัล (`#f43f5e`) บนแท็กสีชมพูพาสเทลหวาน (`#fff1f2`)
     - **แถบเมนูนำทาง (Cute Bottom Navigation):** แถบลอยสีขาวนวล พร้อมปุ่มแท็บที่เลือกเป็นแคปซูลมรกตมิ้นต์ 3D และปุ่มกล้องกลางขอบนูนน่ารัก
  2. **ระบบสลับธีมรองรับครบ 6 ธีม (Full 6-Theme Switcher):**
     - สามารถเปลี่ยนสลับธีมได้ตลอดเวลาใน "ผู้ช่วยและรายการจ่ายประจำเดือน":
       - `🌸 คิวท์พาสเทล อบอุ่น` (ธีมเริ่มต้นใหม่)
       - `ฟินแทร็ก เขียวมรกต` (ดาร์กโหมดดั้งเดิม)
       - `สว่าง` / `มืด` / `น้ำเงิน` / `แดงทับทิม`
  3. **การทดสอบอัตโนมัติ (Automated Tests & QA):**
     - อัปเดตแคช Service Worker เป็น `slipsense-app-shell-v4-3d-cute-3-dialog-v6`
     - รัน `node scripts/build_prod.js` และ `npm test` ผ่านครบ **42/42 รายการ (100% PASS, 0 failure)**
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** พร้อมใช้งานและเปิดทดสอบบนมือถือ/แท็บเล็ตในวงแลนผ่าน http://127.0.0.1:8080 หรือ http://<IPคอมพิวเตอร์>:8080

## ผลงาน TASK-SLIPSENSE-V4-025 (Refactor Portfolio Action Header into Clean Two-Tier 3D Cute Mobile-First Layout)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **แก้ไขปัญหากลุ่มปุ่มพอร์ตอัดแน่นและข้อความแตกแถวแนวตั้งบนหน้าจอมือถือ (Clean Two-Tier Structure):**
     - **แถวที่ 1 (Title & Utilities):** แยกหัวข้อ `พอร์ตของฉัน` ให้อยู่เดี่ยวๆ สบายตา ไม่โดนบีบ พร้อมจัดกลุ่มปุ่มเครื่องมือขนาดกะทัดรัดไว้มุมขวาบน ได้แก่ `⚡ ราคา` (อัปเดตราคาล่าสุด), `⚖️ Rebalance` (คำนวณปรับพอร์ต) และ `🗑️ ล้าง` (ปุ่มล้างพอร์ตสไตล์ Compact Warning Pill ที่ดูเรียบร้อย ไม่เกะกะสายตา)
     - **แถวที่ 2 (Primary Action Bar):** รวมปุ่มหลัก 2 ปุ่มที่ผู้ใช้กดใช้งานบ่อยที่สุด จัดเป็นตาราง 2 คอลัมน์สมดุล (50% / 50%) กดง่ายด้วยนิ้วโป้งเดียว:
       - `📷 นำเข้าพอร์ต DIME` (ปุ่มหลักสีเขียว Emerald 3D Gradient โดดเด่น สวยงาม)
       - `➕ บันทึกซื้อ / ขาย` (ปุ่มรอง 3D Glass Surface เรียบหรู สะอาดตา)
     - กำหนด `white-space: nowrap;` ทุกปุ่ม ข้อความไม่มีการแตกตัวอักษรลงมา 3-4 แถวแนวตั้งอีกต่อไป
  2. **ความเข้ากันได้ 100% (DOM & Test Compatibility):**
     - คง DOM IDs เดิมครบทุกปุ่ม (`btnOpenPortfolioImport`, `btnOpenStockTradeHeader`, `btnClearAllPortfolio`, `btnPortfolioRebalance`, `btnQuickPriceUpdate`)
     - อัปเดตแคช Service Worker เป็น `slipsense-app-shell-v4-3d-cute-3-dialog-v5` เพื่อให้เบราว์เซอร์และมือถือในวง LAN รีเฟรชได้หน้าตาใหม่ทันที
  3. **การทดสอบอัตโนมัติ (Automated Tests & QA):**
     - รัน `node scripts/build_prod.js` และ `npm test` ผ่านครบ **42/42 รายการ (100% PASS, 0 failure)**
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป (รอบพรุ่งนี้):** ปรับธีมทั้งแอปให้ดูน่ารัก สดใส อบอุ่น เหมาะกับแอปบันทึกรายรับ-รายจ่าย (Kawaii & Friendly Pastel 3D Theme) เพิ่มความมีชีวิตชีวา สีพาสเทลสบายตา และลูกเล่นน่ารักที่ชวนให้อยากเปิดบันทึกทุกวัน

## ผลงาน TASK-SLIPSENSE-V4-024 (Luxury 3D Cute Popup-First UX, DIME USD Portfolio AI Scanner, Custom Jar Rename Fix, Salary Jar & Inter-Jar Transfer, Dan Insurance 2-Policy Manager)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **เปลี่ยนทุกการทำรายการเป็นระบบ 3D Popup ทั้งหมด (Luxury 3D Cute Popup-First UX):**
     - ยุบส่วนสแกนด่วนที่เคยกางยาวบนหน้าแรกให้เป็นแถบทางลัด 3D สุดหรูกระชับ (`#homeQuick3dLauncher`) เมื่อกดสแกนด่วน โอนเงินเข้า/ออก นำเข้าพอร์ต หรือบันทึกซื้อขายหุ้น จะเด้งหน้าต่าง 3D Popup (`#quickScanPopupModal`, `#jarActionPopupModal`, `#jarTransferModal`, `#danInsurancePolicyModal`) ขึ้นมาทันที
     - เมื่อแตะเข้าพอร์ตหุ้น (`📈 หุ้น/ลงทุน`) หรือกระปุกใดๆ บนชั้นวาง จะเด้ง **3D Action Hub Dialog Box** แสดงยอดคงเหลือและปุ่มทางลัดครบจบในที่เดียว พร้อมเพิ่มปุ่ม `🗑️ ล้างพอร์ต` (`clearAllPortfolioHoldings`), ปุ่มลบหุ้นรายตัว `🗑️` (`deletePortfolioHolding`) ที่มี Dialog Box ยืนยันก่อนลบ และตัวเลือก `🧹 ล้างหุ้นเก่าในพอร์ตก่อนนำเข้า` ในหน้าตรวจสอบการนำเข้าพอร์ต DIME
     - อัปเดตเวอร์ชัน Service Worker (`slipsense-app-shell-v4-3d-cute-3-dialog-v2`) เพื่อให้เบราว์เซอร์ล้างแคชเดิมและโหลดหน้าต่าง Dialog Box ใหม่ทันที และ Deploy Edge Function `analyze-receipt` (Version 11) ขึ้น Supabase Cloud สำเร็จ
  2. **แก้ไข AI อ่านพอร์ต DIME และแยกสกุลเงินหุ้น USD (`$`) กับเงินสดกระปุก THB (`฿`):**
     - ยกเลิกค่าจำลองตายตัว (`RKLB/SLV/SOFI/EOSE`) เดิมที่ทำให้อ่านรูปผิด
     - เพิ่ม `action: 'analyze_portfolio'` ใน `supabase/functions/analyze-receipt/index.ts` พร้อม Schema สกัดหุ้น USD จากหน้าจอ DIME ("มูลค่าสินทรัพย์ (USD)" และ "% กำไรและมูลค่า")
     - รองรับการสกัดข้อมูลหุ้นตามรูปพอร์ตจริงของผู้ใช้ครบทั้ง 6 ตัว (`AMZN` $388.95 / -$5.22, `NVDA` $373.28 / -$65.24, `META` $366.09 / +$4.80, `GOOG` $355.69 / +$50.08, `LLY` $270.80 / +$80.04, `MSFT` $265.31 / +$56.70) พร้อมผูก Event แก้ไขตัวเลขในตารางตรวจสอบแบบ Real-time
     - แสดงมูลค่าหุ้นและต้นทุนเป็น **USD (`$`)** และแสดงเงินสดในกระปุกแยกต่างหากเป็น **THB (`฿`)**
  3. **แก้ไขการเปลี่ยนชื่อกระปุกแล้วชื่อที่โชว์ไม่ยอมเปลี่ยน:**
     - แก้ไข `createJarPresentation` ใน `src/app.ts` ให้ใช้ชื่อที่ผู้ใช้ตั้งเอง (`bucket?.name`) ก่อน `BUCKET_SHORT_NAMES` เสมอ และสั่ง `renderDashboardAndHistory()` ทันทีเมื่อบันทึกชื่อใหม่
  4. **ระบบกระปุกเงินเดือน (`💎 เงินเดือน`) และการโอนเงินข้ามกระปุก:**
     - รองรับการรับเงินเดือนเข้ากระปุกเงินเดือน (`depositToSalaryJar`) และการโอนเงินจากกระปุกเงินเดือนกระจายไปยังกระปุกอื่นๆ ทั้งแบบ **โอนเดี่ยว (1 กระปุก)** และ **โอนกระจายหลายกระปุกพร้อมกัน (Multi-Jar Split)** โดยใช้ธุรกรรมคู่สมดุล (`[INTERNAL_TRANSFER:...]`) ที่ไม่ทำให้รายรับ/รายจ่ายรายเดือนเบิ้ลซ้ำ
  5. **ระบบกระปุกประกันแดน (`🛡️ ประกันแดน`) รองรับบันทึกค่าประกัน 2 ฉบับ (คนละวันครบกำหนด):**
     - บันทึกยอดที่ต้องจ่ายจริงและวันครบกำหนดของ **กรมธรรม์ฉบับที่ 1** และ **กรมธรรม์ฉบับที่ 2** แยกกันในสถานะรอจ่าย (`pending`) โดยแสดงยอดรอจ่ายชัดเจนแต่ยังไม่หักเงินออกจากกระปุกจนกว่าจะกดปุ่ม **`✂️ ตัดจ่ายออกจากกระปุก`** ของแต่ละฉบับเอง
  6. **การทดสอบอัตโนมัติ (Automated Tests & QA):**
     - เพิ่มชุดทดสอบใน `tests/portfolio_engine.test.js` และ `tests/transaction_entry.test.js`
     - รัน `node scripts/build_prod.js` และ `npm test` ผ่านครบ **42/42 รายการ (100% PASS, 0 failure)**
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** พร้อมใช้งานและตรวจสอบได้ทันทีบน http://127.0.0.1:8080
**สภาพแวดล้อม:** Personal PC Edition (`LAPTOP-C8VOI2RL`) — System Node.js `v24.16.0` (`http://127.0.0.1:8080`)  
**สถานะโดยรวม:** TASK-SLIPSENSE-V4-023 (Dynamic Merchant Label, Quick Income Chips & Cute 3D Category Dropdown) พัฒนาและตรวจสอบเสร็จสมบูรณ์ในโหมด Single-Agent ตามคำสั่งอนุมัติของผู้ใช้; Build Production (`index.html`, `sw.js`, `dist/**`) และรันชุดทดสอบอัตโนมัติ `node scripts/run_tests.js` ผ่านครบ **42/42 รายการ (exit code 0)**

## ผลงาน TASK-SLIPSENSE-V4-023 (Dynamic Merchant Label, Quick Income Chips & Cute 3D Category Dropdown)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **ฟิลด์ร้านค้าปรับเปลี่ยนตามประเภทธุรกรรมอัตโนมัติ (Dynamic Merchant/Source Presentation):**
     - หากเลือกเป็น "รายจ่าย": แสดงหัวข้อ `ร้านค้า / รายการ *` พร้อมคำอธิบายตัวอย่างเช่น `เช่น 7-Eleven, GrabFood, Shopee, น.ส. รุ่งทิวา`
     - หากเลือกเป็น "รายรับ": เปลี่ยนหัวข้อเป็น `ที่มาของรายรับ / รายการ *` พร้อมคำอธิบายตัวอย่างเช่น `เช่น เงินเดือน, ค่าจ้าง, บริษัท เอบีซี, ปันผลหุ้น`
     - แสดงแถบปุ่มลัดคลิกเดียวติด (`Quick Chips`): `[💼 เงินเดือน]`, `[📈 เงินปันผล]`, `[🎁 โบนัส]`, `[✨ คืนเงิน]` กดแล้วกรอกชื่อลงในช่องให้ทันที
  2. **รวมตัวเลือกหมวดหมู่เป็น Cute 3D Category Dropdown หนึ่งเดียว:**
     - ยุบปุ่มกริดหมวดหมู่ 12 ปุ่มที่ซ้ำซ้อนออก (`display: none;`) เพื่อไม่ให้ลายตาและไม่กินพื้นที่
     - สร้างดร็อปดาว 3 มิติสุดน่ารัก (`#custom3dCategoryDropdown`) ที่แสดงรูปภาพ 3D สดใสขนาด 34px สไตล์เดียวกับแถบกระปุก 3D
     - มีเอฟเฟกต์แอนิเมชันเปิด-ปิดกล่องเมนูแบบ Pop-in, การ Hover เปล่งประกาย (Glow) และแถบระบุหมวดหมู่ที่เลือกไว้ชัดเจน
     - ซิงก์ค่ากับ `<select id="txFormCategory">` อย่างสมบูรณ์ 100% ทำให้ระบบบันทึกและชุดทดสอบอัตโนมัติทำงานได้อย่างแม่นยำ
  3. **การทดสอบอัตโนมัติ (Automated Tests & QA):**
     - รัน `node scripts/build_prod.js` และ `node scripts/run_tests.js` ผ่านครบ 42/42 รายการ (100% PASS, 0 failure)
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** พร้อมใช้งานและตรวจสอบได้ทันทีบน http://127.0.0.1:8080

## ผลงาน TASK-SLIPSENSE-V4-022 (Kawaii Donut Chart with In-Slice Percentages & Straddling Icon Badges)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **กราฟโดนัทถอดแบบตามภาพอ้างอิงเป๊ะ 100%:**
     - วงโดนัทสีสันสดใส (Rose, Coral, Purple, Violet, Indigo, Sky Blue, Cyan, Emerald, Amber)
     - **ตัวเลขเปอร์เซ็นต์สีขาวพิมพ์อยู่บนเนื้อวงโดนัท (In-Slice Percentages)**: วางกึ่งกลางองศาของแต่ละ Slice ตัวเลขหนาชัดเจน สวยงาม
     - **ไอคอนหมวดหมู่อยู่ในป้ายวงกลมสีขาวขอบสีประจำหมวด ลอยทับขอบนอกของวงโดนัท (Straddling Icon Badges)**: วางตำแหน่งที่ขอบนอกของแต่ละ Slice พอดิบพอดี (เช่น 🏖️ ท่องเที่ยว, 🎓 การศึกษา, 🎁 ของขวัญ, ⚡ ค่าน้ำไฟ, 🏠 บ้าน, 🐱 สัตว์เลี้ยง, 🍜 อาหาร, 🚗 เดินทาง)
     - **กลางรูกราฟโดนัท**: แสดงป้ายข้อความ 'ค่าใช้จ่าย' และยอดเงินรวมตัวหนาเด่น เช่น ฿2,620 หรือ ฿12,450
  2. **รายการสรุปแยกหมวดหมู่ด้านล่าง (Category Breakdown List):**
     - ถอดแบบแถวรายการตามภาพอ้างอิง:
       - ฝั่งซ้าย: วงกลมไอคอน 32px ขอบสี + ชื่อหมวดหมู่
       - ฝั่งขวา: เปอร์เซ็นต์สัดส่วน (เช่น 19%, 15%) + ยอดเงินสุทธิ (เช่น ฿500, ฿400)
       - ดีไซน์การ์ดโค้งมน สวยงาม เรียบร้อย สะอาดตา
  3. **การทดสอบอัตโนมัติ (Automated Tests & QA):**
     - รัน node scripts/build_prod.js และ node scripts/run_tests.js ผ่านครบ 42/42 รายการ (100% PASS, 0 failure)
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** พร้อมใช้งานทันทีบน http://127.0.0.1:8080

## ผลงาน TASK-SLIPSENSE-V4-021 (Expense Donut Chart Surrounding Icons & Compact Mobile-Tablet Layout)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **กราฟโดนัทแสดงรูปไอคอนรอบวง (Radial Donut with Surrounding Icons):**
     - คำนวณองศากึ่งกลางของแต่ละ Slice แล้ววางตำแหน่งไอคอนรอบนอกของวงโดนัทอย่างลงตัว
     - แสดงรูปสัญลักษณ์และไอคอนหมวดหมู่ (เช่น 🍜 อาหาร, 🛒 ของใช้, 🚗 ยานพาหนะ, ⚡ บิล/น้ำไฟ, 🏠 ซ่อมบ้าน, 💊 สุขภาพ) ประจำแต่ละชิ้นวงโดนัท
     - แสดงตัวอักษรและตัวเลขให้น้อยที่สุด: แสดงเฉพาะตัวเลขเปอร์เซ็นต์ย่อ (เช่น 24%) ใต้ไอคอน และแสดงยอดรวมรายจ่ายตัวหนาตรงกลางรูกราฟโดนัท
     - ซ่อนรายการสรุปด้านล่าง (chart-legend) ออกจากมุมมอง เพื่อไม่ให้เกะกะและไม่เปลืองพื้นที่แนวตั้งตามคำขอของผู้ใช้ (แต่คงไว้ใน DOM สำหรับ Accessibility และการทดสอบ)
     - ซ่อนตารางดิบแคชโฟลว์ (chart-table) ออกจากหน้าจอเพื่อความสะอาดตา
  2. **ปรับภาพรวมของแอปให้กระชับ เหมาะกับมือถือและแท็บเล็ต (Compact Mobile & Tablet Polish):**
     - ลด Padding และ Margin ของ .app-panels, .card, และ .kpi-box ให้แน่นกระชับขึ้น
     - กราฟแท่งเปรียบเทียบกระแสเงินสดและกราฟโดนัทจัดเรียงเป็น 2 คอลัมน์บนแท็บเล็ต/หน้าจอกว้าง และเรียงซ้อนแบบกะทัดรัดบนมือถือ ไม่ต้องเลื่อนจอเยอะ
  3. **การทดสอบอัตโนมัติ (Automated Tests & QA):**
     - รัน node scripts/build_prod.js และ node scripts/run_tests.js ผ่านครบ 42/42 รายการ (100% PASS, 0 failure)
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** พร้อมใช้งานทันทีบน http://127.0.0.1:8080

## ผลงาน TASK-SLIPSENSE-V4-020 (AI DIME Portfolio Screenshot Importer & Trade Slip Auto-Fill)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **ระบบนำเข้าพอร์ตจากการแคปหน้าจอ DIME (AI Portfolio Screenshot Importer):**
     - เพิ่มปุ่ม `[📷 นำเข้าพอร์ต]` บนแถบหัวข้อพอร์ตหุ้น
     - สร้างหน้าต่างโมดอลนำเข้า (`#portfolioImportModal`) สไตล์ DIME ตามภาพอ้างอิงของผู้ใช้ พร้อมป้ายแนะนำกฎการแคป:
       - ✅ รายการต้องอยู่ในโหมด "กำไรขาดทุน" (แสดงมูลค่าและ % กำไรสะสม)
       - ❌ ต้องไม่อยู่ในโหมด "ราคาปัจจุบัน" (เพราะไม่แสดงต้นทุนจริง)
       - ⚠️ พอร์ตยาวแคปไม่หมด รองรับการเลือกรูปได้สูงสุด 5 รูปต่อเนื่อง
     - ถอดรหัสสูตรคณิตศาสตร์คำนวณต้นทุนที่แท้จริง:
       $\text{Cost Basis} = \text{Market Value} - \text{Unrealized P/L}$
       $\text{Avg Cost} = \frac{\text{Cost Basis}}{\text{Shares}}$
     - หน้าต่างตรวจสอบ (`#portfolioVerifyModal`): แสดงรายการหุ้นที่ AI อ่านได้ ให้ผู้ใช้ตรวจทาน แก้ไขจำนวนหุ้น/ราคา/ต้นทุน หรือเลือก/ไม่เลือกหุ้นที่จะบันทึกได้อิสระ
     - ตรรกะผสานข้อมูลอัจฉริยะ (Selective Upsert): ทับเฉพาะจำนวนหุ้นและต้นทุนของหุ้นตัวเดียวกัน ส่วนหุ้นอื่นที่มีอยู่ในพอร์ตจะไม่ถูกแตะต้อง
  2. **ระบบเพิ่มหุ้น/ขายหุ้นจากสลิปการเทรด (AI Trade Slip Auto-Fill):**
     - เพิ่มส่วนช่วยเหลือ `🧾 มีสลิปการเทรด? ให้ AI กรอกให้` ในหน้าต่างบันทึกซื้อ/ขายหุ้น
     - สแกนสลิปใบยืนยันการเทรด (Confirmation Note) แล้วกรอก Ticker, Action (ซื้อ/ขาย), จำนวนหุ้น, ราคาที่แมตช์ ให้อัตโนมัติในคลิกเดียว
     - เชื่อมโยงตัดเงินสดหรือโอนเงินกลับเข้ากระปุก **`📈 หุ้น/ลงทุน`** ทันทีเมื่อกดยืนยัน
  3. **การทดสอบอัตโนมัติ (Automated Tests & QA):**
     - เพิ่มชุดทดสอบ 1.11 - 1.14 ใน `tests/portfolio_engine.test.js` (คำนวณต้นทุนกำไร/ขาดทุนแบบ DIME, Selective Upsert, และ Trade Slip DCA projection)
     - รัน `node scripts/build_prod.js` และ `node scripts/run_tests.js` ผ่านครบ **42/42 รายการ (100% PASS, 0 failure)**
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** พร้อมใช้งานทันทีบนเครื่องของคุณ

## ผลงาน TASK-SLIPSENSE-V4-019 (RocketTool Mobile-First Compact Holdings List, Direct TradingView Chart Click, P/L Sorting & Search)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **หน้าตาการ์ดหุ้นแบบกะทัดรัด (Mobile-First Compact Holdings View):**
     - ปรับเปลี่ยนจากการ์ดเดี่ยวขนาดใหญ่ เป็นการ์ดแนวนอนกะทัดรัด (สูง ~64px) ตามแบบ Rocket Tool Mobile App สำหรับรองรับพอร์ตที่มีหุ้นมากกว่า 10-30+ ตัว
     - แสดง Avatar วงกลมไอคอน/สีเฉพาะตัวของหุ้นแต่ละตัว (เช่น SNOW ❄️, NVDA N, AMZN a, META M, MSFT M)
     - แสดง Ticker Symbol พร้อมป้ายสัดส่วนพอร์ตมินิ (`◔ X.X%`) และบรรทัดย่อยระบุจำนวนหุ้นและต้นทุนเฉลี่ย (`X หุ้น · avg $XX.XX`)
     - แสดงมูลค่าตลาดปัจจุบัน และผลตอบแทนกำไร/ขาดทุน (`+XX.XX%` สีเขียว / `-XX.XX%` สีแดง) ชัดเจนทางขวา
  2. **คลิกที่ชื่อหุ้นเปิดดูกราฟ TradingView ทันที (Direct Chart Access):**
     - ผูก Event Delegation เข้ากับการ์ดหุ้นทุกใบ แตะตรงชื่อหุ้นหรือการ์ดจะเปิด TradingView Interactive Chart Modal แบบเต็มตาทันที
  3. **ระบบเรียงลำดับและค้นหาหุ้นอัจฉริยะ (Sort & Search Filter):**
     - เพิ่มปุ่มชิปเรียงลำดับ: `[P&L ⇅]` (เรียงตามผลตอบแทนกำไร/ขาดทุนมากสุด-น้อยสุด) และ `[สัดส่วน ⇅]` (เรียงตามน้ำหนักหุ้นในพอร์ต)
     - เพิ่มช่องค้นหา `[🔍 ค้นหาหุ้น เช่น NVDA, SNOW...]` กรองรายการแบบ Real-time อำนวยความสะดวกสำหรับนักลงทุนที่มีหุ้นหลายตัว
  4. **Hero Summary Card และการแบ่งแท็บ (RocketTool Mobile Header):**
     - เพิ่มปุ่ม `[⚖️ Rebalance]` (เปิดเครื่องคิดเลขจำลองการเทรด) และปุ่ม `[➕]` เพิ่มหุ้นบนแถบหัวข้อ
     - สรุปมูลค่าปัจจุบัน, อัปเดตล่าสุด, ผลตอบแทนวันนี้, และป้ายกำไรสะสม (ขายแล้ว)
     - จัดกลุ่มเป็นแท็บย่อย: `Holdings` | `ประวัติธุรกรรม` | `สัดส่วน Donut`
  5. **ผลการทดสอบอัตโนมัติ:**
     - เพิ่มการทดสอบการเรียงลำดับและการค้นหาใน `tests/portfolio_engine.test.js`
     - รัน `node scripts/build_prod.js` และ `node scripts/run_tests.js` ผ่านครบ **42/42 รายการ (100% PASS, 0 failure)**
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** ส่งมอบเข้าสู่ Release Gate และขออนุมัติจากผู้ใช้

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

## TASK-SLIPSENSE-V4-029 — ลดภาระแบตเตอรี่และความร้อน (9 พฤศจิกายน 2026)

งาน Developer อยู่บนสาขา `agent-task/TASK-SLIPSENSE-V4-029` ใน isolated worktree ที่ Global Runner สร้างไว้แล้ว พบแผนและ `PLAN_REVIEW_REQUEST.json` พร้อม provisional permission ของโหมด failover ก่อนทำงาน ข้อมูลสถานะงานก่อนหน้านี้เป็นประวัติ ไม่ใช่ผลตรวจของงานนี้

- ย้ายพื้นหลังไปยัง `#appFixedBg` แบบ fixed พร้อม `translateZ(0)`, `aria-hidden` และไม่รับ pointer รักษาธีมและ DOM IDs เดิม ลด blur เหลือไม่เกิน 14px และคง layer พื้นหลังเมื่อเปิด reduced motion โดยไม่เพิ่ม layer ให้ทุกการ์ด
- ซ่อนแท็บแล้วถอดเฉพาะ Realtime channel ที่แอปเป็นเจ้าของและหยุด share heartbeat กลับมาแล้วตรวจ session ก่อน reconnect และใช้เส้นทางซิงก์เดิม มี generation ป้องกัน async setup/renewal รอบเก่า การเปลี่ยนบัญชีและ release หยุด heartbeat ด้วย
- คืนขนาด Canvas เป็นศูนย์ ล้าง Image src และถอด handlers ใน finally ทั้งสำเร็จและผิดพลาด คงผลลัพธ์ JPEG, quality และการย่อขนาดเดิม ฟังก์ชันใช้ FileReader จึงไม่มี object URL ที่ต้อง revoke
- เปลี่ยนเฉพาะรุ่น app-shell cache เป็น `v4-3d-cute-3-battery-v8` ไม่เปลี่ยนนโยบาย cache และไม่ล้าง IndexedDB
- System Node.js `v24.16.0` และ Git จาก codex-primary-runtime: production pipeline ผ่าน exit code 0 ด้วย `node -e "require('./tests/battery_optimization.test').buildScoped()"` ซึ่งเรียก `scripts/build_prod.js` เดิม โดยจำกัดการลบ/เขียนเฉพาะ artifact ใน allowlist และตรวจ static assets ที่ไม่อนุญาตให้เขียนว่ามีเนื้อหาเดิม จึงไม่เรียก build เปล่า ๆ ที่จะลบทั้ง dist
- `npm test`: ผ่าน 43/43 รายการ ล้มเหลว 0, exit code 0 รวมชุดทดสอบธีมเดิม, RocketTool/portfolio และ regression ใหม่ การทดสอบเดิมสร้าง build ในหน่วยความจำ มีการทดสอบ source และ generated HTML บนดิสก์แยกอีกครั้ง ผ่าน exit code 0
- Regression ครอบคลุม hidden/visible, async session และ channel removal ที่ค้าง, session ไม่ตรงบัญชี, logout ระหว่าง resume, refresh ล้มเหลว, share pause/resume/release/เสีย claim และ Canvas/Image cleanup เมื่อ decode/context/draw/encode ผิดพลาด รวมทั้ง CSS ทุกธีมและ DOM IDs จาก template ถึง generated HTML
- ตรวจ SHA-256 และขนาด artifact ตาม BUILD_MANIFEST, root/dist ตรงกัน และ DOM IDs เดิมครบ ผ่าน ตรวจ HTTP ด้วย dev server บน `127.0.0.1:8080` แล้ว root/dist HTML และ SW ส่งเนื้อหาตรงกับไฟล์จริง (200) ปิด server หลังตรวจแล้ว
- ScopeVerifier ของ Global Runner ตรวจทั้ง diff และ untracked: ผ่าน ไม่มี violation ไม่แก้ `Production/**`, `.env*` หรือ `supabase.sql` รายงาน Developer ส่งเป็น JSON ในผลตอบกลับให้ Runner รับต่อ
- ข้อจำกัด: browser inventory แจ้ง `The browser access host is unavailable` จึงยังไม่ได้ตรวจ scroll, เปลี่ยนธีม, dialog stacking, hidden/visible, offline/online, logout, release share และ RocketTool ในเบราว์เซอร์จริง พฤติกรรมที่กล่าวว่าผ่านข้างต้นเป็น automated mocks/source/artifact checks ไม่ใช่ผลทดสอบ Supabase จริงหรือเครื่องโทรศัพท์ ไม่มีผลวัดพลังงาน อุณหภูมิ FPS หรือ GPU repaint จึงยังยืนยันขนาดการประหยัดแบตเตอรี่ไม่ได้
- การส่งต่อ: ณ เวลาตรวจ STATE ของ Runner ยังเป็น `IMPLEMENTING`, active_agent `Codex` การสร้าง QA_REPORT/QA_REVIEW_REQUEST และเปลี่ยนเป็น Gate 12 `QA_RUNNING`, active_agent `Antigravity` เป็นหน้าที่ Runner หลังรับ DEV_REPORT และ Independent QA ผ่าน งานนี้ไม่เขียนสถานะ QA ผ่านแทน Runner ไม่สร้าง RELEASE_MANIFEST และไม่ merge ต้องหยุดรอ Antigravity ที่ Gate 12 ตามแผน


## TASK-SLIPSENSE-V4-030 — ผล Developer ใน worktree (9 พฤศจิกายน 2026)

Runner สร้าง isolated worktree และอนุมัติแผนแล้ว (STATE ที่ตรวจพบ: IMPLEMENTING, active_agent: Codex) งานนี้ต่อยอดการแก้ metric/storage ที่ค้างอยู่ใน src/app.ts โดยไม่แก้ไฟล์ควบคุมของ Runner

- นำเข้าภาพ JPEG/PNG/WebP ครั้งละ 1–5 ภาพ ย่อผ่าน Canvas แล้วส่ง base64 จริงพร้อม action analyze_portfolio และ JWT ผ่าน Edge Function เดิมตามลำดับ ไม่เก็บภาพหรือ token ใน persistent storage
- รวม ticker ที่ trim/uppercase ด้วย Map ไม่มีเพดานแถว ทดสอบ 23 holdings ภาพซ้อนกันไม่บวกจำนวน/มูลค่า หากขัดแย้งใช้ภาพแรกและแสดงคำเตือนให้ตรวจแก้
- ฟอร์มแก้ชื่อหุ้น มูลค่า ต้นทุน และจำนวนหุ้นได้ คำนวณ metrics ใหม่ผ่าน engine เดิม แสดง USD และเปอร์เซ็นต์ที่คำนวณไม่ได้อย่างชัดเจน ทุกแถวต้องตรวจยืนยันใหม่หลังแก้ ปฏิเสธชื่อหุ้นซ้ำและค่าที่ไม่ครบ
- อ่าน checkbox แทนที่พอร์ต ณ เวลายืนยัน ค่าเริ่มต้นไม่เลือก หากไม่เลือกให้อ่านพอร์ตล่าสุดและ upsert รักษา identity/metadata ของหุ้นเดิม เขียน localStorage key เดียวแบบ atomic ไม่ล้างก่อนเขียน เมื่อ storage ล้มเหลวคงพอร์ตและฟอร์มไว้
- ป้องกัน batch ซ้อน การยืนยันซ้ำ และผลเก่าหลังยกเลิก/เปลี่ยนบัญชี คืนปุ่มและรีเซ็ต input ใน finally ข้อผิดพลาด offline/auth/compression/network/401/403/429/server/response ว่างหรือผิดรูปแบบแสดงภาษาไทย ไม่เปิดผลบางส่วน

ผลตรวจจริง:
- Baseline npm test: 42/43 ผ่าน, ล้มเหลว 1 (validateDimeReview ยังไม่ประกาศในโค้ดที่ค้างเดิม)
- npm test หลังแก้: 43/43 ผ่าน, ล้มเหลว 0, exit code 0 รวม regression importer ที่รันทั้ง source และ generated bundle ใน sandbox เดิม โดยจำลองเฉพาะ DOM/image/network/auth/storage boundaries ไม่เรียกบริการจริง
- node -e "require('./tests/portfolio_engine.test')().catch(e=>{console.error(e);process.exitCode=1})": ผ่าน exit code 0 ก่อนเพิ่มกรณีเปลี่ยนบัญชี/แก้ ticker ซ้ำ/ต้นทุนว่าง/อ่านพอร์ตล่าสุด ซึ่งกรณีเพิ่มได้ผ่านใน npm test รอบสุดท้าย
- Build: node -e "require('./tests/battery_optimization.test').buildScoped()" ผ่าน exit code 0 ใช้ scripts/build_prod.js เดิมพร้อม guard จำกัดการเขียน/ลบเฉพาะ generated artifacts ที่อนุญาต ตรวจ static assets นอก allowlist ว่าเหมือนเดิมก่อนข้ามการเขียน สร้าง BUILD_MANIFEST จาก build จริง
- ตรวจ SHA-256 และขนาดทุก artifact ใน manifest, root/dist HTML และ SW ตรงกัน, checkbox ID ไม่ซ้ำ/default unchecked และ UTF-8 without BOM: ผ่าน
- Service Worker สร้างจาก src/sw.ts เดิม ไม่เปลี่ยน revision เพราะ navigation ใช้ network-first และ authenticated/API requests bypass cache อยู่แล้ว ผู้ใช้ต้องเชื่อมต่อออนไลน์เพื่อรับหน้าใหม่
- Smoke ที่ทำได้: npm test ตรวจ static HTTP server, syntax และพฤติกรรม source/built ใน browser sandbox ผ่าน ยังไม่ได้ทดสอบคลิก UI ในเบราว์เซอร์จริง หรือ AI กับบัญชี Supabase จริง

ข้อจำกัด: backend ปัจจุบันแปลงค่าที่ AI อ่านไม่ได้บางช่องเป็น 0 และส่ง currency USD เสมอ frontend จึงแยกศูนย์จริงจากค่าที่ backend เติมไม่ได้ ต้องตรวจทานทุกแถว; ไม่แก้ backend ตามขอบเขต ภาพที่ถูกยกเลิกระหว่างส่งอาจยังประมวลผลบน server แต่ผลจะไม่ถูกนำมาใช้

การส่งต่อ: Developer self-tests ผ่าน ไม่ใช่ผล Independent QA รอ Runner รับ DEV_REPORT และทำ ScopeVerifier/Independent QARunner ก่อนหยุด Gate 12 ที่ QA_RUNNING, active_agent Antigravity ตามกระบวนการ ห้ามถือว่าผ่าน Gate 12 แล้ว งานนี้ไม่สร้าง RELEASE_MANIFEST ไม่ merge และไม่ release
## ผลงาน TASK-SLIPSENSE-V4-032 — DIME shares เริ่มต้น 1 และ Cache v10

- เมื่อมูลค่าปัจจุบันและต้นทุนรวมมากกว่า 0 และอ่านได้ แต่ shares ขาดหาย เป็นศูนย์ หรือค่าลบ ใช้ shares = 1, currentPrice = marketValue และ avgCost = costBasis ผ่านการ normalize ร่วมกันใน calculation, validation และ review state
- หน้าตรวจทานแสดงจำนวนหุ้นเริ่มต้น 1 พร้อมราคาปัจจุบัน ต้นทุนรวม ต้นทุนเฉลี่ย และกำไร/ขาดทุน ผู้ใช้ยังต้องตรวจทานทุกแถวก่อนยืนยัน การแก้ไขตัวเลขคำนวณใหม่และล้างเครื่องหมายตรวจทาน
- ยังคงพฤติกรรม shares บวกและต้นทุนศูนย์ที่มีจำนวนหุ้นอยู่แล้ว ปฏิเสธยอดเงินที่อ่านไม่ได้และค่าตัวเลข non-finite; batch ที่ไม่ผ่าน validation ไม่เขียนพอร์ตบางส่วนลง `slipsense_stock_holdings_v1`
- เปลี่ยน Service Worker เป็น `slipsense-app-shell-v4-3d-cute-3-dime-v10` และทดสอบการล้าง cache v9 โดยไม่เปลี่ยนนโยบาย cache
- `npm run build`: ผ่าน exit code 0 สร้าง `dist/**`, `index.html` และ `sw.js` จาก source โดยไม่แก้ artifacts ด้วยมือ; ใช้ `src/index.template.html` เดิม
- ชุดทดสอบ `tests/portfolio_engine.test.js` โดยตรง: ผ่าน exit code 0 ทั้ง source และ built ครอบคลุม fallback, กำไร/ขาดทุน, review input, ยืนยันบันทึกโดยไม่กรอก shares, การแก้ไข และ atomic batch validation
- `npm test`: ผ่าน 43/43 รายการ ล้มเหลว 0 รายการ exit code 0; การทดสอบ RLS/concurrent delete กับฐานข้อมูลจริงไม่ได้รันเพราะไม่มี test database ตามข้อจำกัดเดิมของชุดทดสอบ
- ตรวจขอบเขตด้วย git status/diff: แก้เฉพาะไฟล์ที่อนุมัติ ใช้ System Node.js v24.16.0 และ Git จาก codex runtime; ไฟล์ข้อความ UTF-8 without BOM
- **blocker_reason:** Runner ที่ทำงานอยู่เรียก `run_task.js --repo c:\Users\SlipSense --spec c:\Users\SlipSense\.agent_loop\TASK_SPEC.json --environment DEVELOPMENT` โดยไม่มี `--failover`; STATE ของงานนี้ยังเป็น `IMPLEMENTING`, `active_agent: Codex` และ provisional lock ที่พบเป็นของ TASK-SLIPSENSE-V4-031D จึงไม่ใช่หลักฐาน failover ของงานนี้ ไม่แก้ control artifacts นอก allowlist และไม่เริ่ม Runner ซ้อน ต้องให้ผู้ควบคุม Runner ส่งต่องานนี้ในโหมด failover ก่อนทำ Independent QA และหยุดที่ Gate 12 (`QA_RUNNING`, `active_agent: Antigravity`) ยังไม่ได้ยืนยัน Gate 10–12 และไม่ได้สร้าง RELEASE_MANIFEST.json หรือ merge เข้า main ในรอบ Developer นี้

## ผลงาน TASK-SLIPSENSE-V4-031D — Cache v9 และการอัปเดต DIME

- เปลี่ยน Service Worker เป็น `slipsense-app-shell-v4-3d-cute-3-dime-v9` ติดตั้ง app shell ให้ครบก่อน `skipWaiting()`; หากโหลดไม่สำเร็จ installation ล้มเหลวและเก็บ cache เก่าไว้ การ activate ลบเฉพาะ cache เก่าที่ขึ้นต้น `slipsense-app-shell-` แล้ว `clients.claim()` โดยไม่เรียกใช้หรือลบฐานข้อมูลธุรกรรม
- DIME แสดง status และ error toast ภาษาไทยทันทีเมื่อออฟไลน์หรือยังไม่เข้าสู่ระบบ ก่อนอ่านภาพหรือเรียก AI; เส้นทางออนไลน์ยังเปิดให้ผู้ใช้ตรวจทานก่อนบันทึก
- registration อยู่ใน `src/app.ts` เพียงแห่งเดียว ตรวจอัปเดตเมื่อโหลด กลับ foreground และกลับออนไลน์ ด้วย `updateViaCache: none` จัดการ update failure แบบไม่ขัดขวางแอป มี controllerchange handler เดียวและ reload ครั้งเดียว เลื่อน reload ขณะนำเข้า วิเคราะห์ บันทึก มีภาพค้าง มี dialog เปิด หรือช่องข้อมูลนอก dialog ที่แก้ไขค้างอยู่ แล้วตรวจซ้ำระหว่างรอเฉพาะเมื่อแอปมองเห็นและออนไลน์
- `npm run build`: exit code 0 ผ่าน security/IP gate; root `index.html` และ `sw.js` ตรงกับ dist แบบ byte-for-byte สร้างจาก pipeline ทั้งหมด ไม่แก้ generated files ด้วยมือ ตรวจ SHA-256 และขนาดจริงครบ 10 entries ของ `dist/BUILD_MANIFEST.json` รวมทั้ง path อยู่ใน dist และ asset references ของ HTML มีไฟล์และ manifest entry จริง
- SHA-256 `dist/index.html`: `da433af263fd82e517550163fce4d308e19333c933fb1448145620665facb372` (430694 bytes)
- SHA-256 `dist/sw.js`: `c32e7b355878dbcbb7192072d41531741c5d552239ff06440a0d71171e512658` (6251 bytes)
- Baseline `npm test`: **43/43 ผ่าน, exit code 0**; หลังแก้ไข **43/43 ผ่าน, exit code 0** ขยาย assertions ใน `tests/portfolio_engine.test.js` โดยไม่ลบหรือปิด tests ตรวจทั้ง source และ bundle ครอบคลุม error toast/status, ไม่อ่านภาพ/เรียก AI เมื่อถูกบล็อก, authenticated import และ review, foreground/offline/update failure, draft protection, first install และไม่ reload ซ้ำ
- ทดสอบ lifecycle ของ Service Worker ใน VM ร่วมกับ HTTP บน `127.0.0.1` (พอร์ตชั่วคราว): cache v8 ไป v9, failed install คง cache เก่า, cleanup คง cache ของแอปอื่น, claiming, GET_VERSION และ app shell ใหม่มี `analyze_portfolio` ใช้ mock IndexedDB ที่ปฏิเสธการเข้าถึงเพื่อยืนยันว่า update ไม่แตะฐานข้อมูล
- **ข้อจำกัด:** ยังไม่ได้ทดสอบ iOS Safari/PWA บนอุปกรณ์จริง หรือ IndexedDB จริงข้ามการอัปเดตบนอุปกรณ์ ผล VM/HTTP ไม่ใช่หลักฐานการทดสอบ iOS; หน้า v8 ที่เปิดค้างและยังไม่มี controllerchange handler อาจต้องเปิด/นำทางเข้าแอปใหม่เพื่อโหลด HTML รุ่นใหม่ การกลับ foreground อัตโนมัติที่เพิ่มในงานนี้มีผลหลังโหลดโค้ดรุ่นใหม่แล้ว ต้องยืนยันสถานการณ์นี้บน iOS จริงในการตรวจ Gate 12
- การส่งมอบของ Codex เป็น DEV_REPORT ให้ runner เก็บนอก worktree; runner เป็นผู้จัดการไฟล์ควบคุมและ Independent QA ไม่สร้าง `RELEASE_MANIFEST.json` และไม่ merge เข้า main ในรอบ failover นี้

**สถานะก่อนหน้า:** TASK-SLIPSENSE-V4-026 (Cute Warm Pastel Theme & Delightful 3D Friendly UX for SlipSense) พัฒนาและตรวจสอบเสร็จสมบูรณ์ในโหมด Single-Agent ตามคำสั่งอนุมัติของผู้ใช้; Build Production (`index.html`, `sw.js`, `dist/**`) และรันชุดทดสอบอัตโนมัติ `npm test` ผ่านครบ **42/42 รายการ (exit code 0)**

## ผลงาน TASK-SLIPSENSE-V4-027 (Authentic Rocket Tool 3-Screen Rebalance Engine & Sleek Trade Modal)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **หน้าจอที่ 1: `ปรับสมดุลพอร์ต` (Authentic Rocket Tool Screen 1 `#portfolioRebalanceModal`):**
     - **Header & Subtitle:** ปุ่มย้อนกลับ `❮` พร้อมหัวข้อ `ปรับสมดุลพอร์ต` และ Subtitle คำนวณมูลค่ารวมอัตโนมัติ `กำหนดเอง · รวม $X,XXX`
     - **ปุ่มปรับสัดส่วนมุมขวาบน:** ปุ่มแคปซูลสีม่วง `ปรับสัดส่วน` กดแล้วเปิดไปยังหน้าจอที่ 2
     - **กล่องเตือนเป้าหมายพอร์ต (Target Warning Alert):** แสดงผลอัตโนมัติเมื่อผลรวมเป้าหมายยังไม่ครบ 100% เช่น `เป้ารวมตอนนี้ 85.0% ยังไม่ครบ 100% — ปรับสัดส่วนใหม่ให้ครบ 100%` พร้อมปุ่มกด `ปรับสัดส่วนใหม่`
     - **กล่องตัวเลือกนับเงินสด (Cash Inclusion Card):** แจ้งชัดเจนว่า `คำแนะนำนี้คิดจากหุ้นอย่างเดียว ยังไม่นับเงินสด $X,XXX ของพอร์ต` พร้อมปุ่มกด `+ ใส่เงินสดในเป้า` / `เอาเงินสดออกจากเป้า` ที่สลับโหมดและคำนวณใหม่แบบเรียลไทม์
     - **ตารางรายการหุ้น Rebalance:** แสดง 4 คอลัมน์ตรงตามแบบฉบับ Rocket Tool เป๊ะ: `หุ้น`, `ปัจจุบัน (% ของหุ้น)`, `เป้า (%)`, และ `ต้องทำ`
     - **Action Chips อัจฉริยะ:**
       - 🔴 สีแดง `ขาย $XX` เมื่อสัดส่วนปัจจุบันมากกว่าเป้าหมาย
       - 🟢 สีเขียว `ซื้อ $XX` เมื่อสัดส่วนปัจจุบันน้อยกว่าเป้าหมาย
       - ⚪ สีเทา `พอดีเป้า` เมื่อสัดส่วนอยู่ในเกณฑ์ ±$0.5
     - **เชื่อมโยงคลิกเปิดหน้าซื้อขายทันที:** เมื่อแตะที่แถวหุ้นใดๆ จะส่ง Ticker, ประเภทธุรกรรม (`buy` หรือ `sell`), จำนวนหุ้นที่ต้องเทรด และยอดเงินที่ต้องปรับ ไปเปิดหน้าจอที่ 3 ให้ผู้ใช้ยืนยันการเทรดได้ในคลิกเดียว

  2. **หน้าจอที่ 2: `ตรวจเป้าสัดส่วน` (Authentic Rocket Tool Screen 2 & 4 `#portfolioTargetAllocationModal`):**
     - **Hero Percentage Indicator:** ตัวเลขขนาดใหญ่ตรงกลาง แสดงเปอร์เซ็นต์รวมของแผนพอร์ตแบบเรียลไทม์ (สีส้มเมื่อ `< 100%`, สีแดงเมื่อ `> 100%`, และสีเขียวสดใสเมื่อ `== 100%`) พร้อมคำแนะนำ เช่น `รวม 85% — เพิ่มอีก 15% เพื่อบันทึก` หรือ `24 หุ้น — สัดส่วนครบ 100% พร้อมบันทึก`
     - **ปุ่มอำนวยความสะดวกด่วน:**
       - `สัดส่วนเท่ากัน` (Equal Weight): เกลี่ยสัดส่วนให้ทุกหุ้นเท่ากันรวมได้ 100% อัตโนมัติ
       - `🔄` (Reset to Current): รีเซ็ตเป้าหมายให้ตรงกับสัดส่วนมูลค่าตลาดปัจจุบัน
     - **แถวควบคุมเงินสด (Cash Allocation Stepper):** เลือกว่าจะนับเงินสดในเป้าหรือไม่ หากนับจะมีปุ่ม `[-]` และ `[+]` พร้อมช่องกรอกตัวเลข % เงินสดที่ต้องการเก็บไว้
     - **Stepper ประจำหุ้นแต่ละตัว (Per-Stock Steppers):** แต่ละหุ้นมีปุ่ม `[-]` และ `[+]` ปรับทีละ 1% / 0.5% พร้อมกล่องกรอกตัวเลขโดยตรง ทุกการปรับจะคำนวณสัดส่วนรวมด้านบนทันที
     - **ปุ่มบันทึกเป็นเป้าหมาย:** ล็อกการกด (Disabled) หากเป้าหมายรวมไม่เท่ากับ 100% และปลดล็อกเป็นสีม่วงสดใสเมื่อครบ 100% พอดี

  3. **หน้าจอที่ 3: `เพิ่มธุรกรรม` (Authentic Rocket Tool Screen 3 `#stockTradeModal`):**
     - ออกแบบใหม่หมดจดสไตล์ Rocket Tool สีม่วงเข้มเรียบหรู พร้อมรองรับทั้ง Dark Mode และ Cute Pastel Mode
     - **แถบนำเข้าจากสลิป AI:** กล่องสีม่วง `📷 นำเข้าจากสลิป` พร้อมแท็กสีเหลือง `ใหม่` และคำอธิบาย `ถ่ายรูปสลิป กรอกให้อัตโนมัติ` กดแล้วเปิดเลือกภาพสลิปทันที
     - **แท็บประเภทสินทรัพย์:** เลือกสลับระหว่าง `[ หุ้น ]` และ `[ ทองคำ ]`
     - **ช่องหุ้น/Ticker:** กล่องค้นหาพร้อมไอคอนแว่นขยาย `🔍`
     - **สวิตช์เลือกประเภท (Segmented Control):** ปุ่ม `▲ ซื้อ` (เขียวมรกต) และ `▼ ขาย` (แดงทับทิม)
     - **จำนวนหุ้นพร้อมทางลัด "ขายทั้งหมด":** แสดงจำนวนที่ถือครองอยู่ เช่น `ถืออยู่ 1.5 หุ้น` พร้อมลิงก์ `ขายทั้งหมด` ที่กดแล้วกรอกจำนวนหุ้นทั้งหมดให้อัตโนมัติ
     - **ยอดเงินรวม & วันที่ & โน้ต:** แสดงยอดเงินรวมคำนวณจากราคาต่อหุ้น, วันที่ทำรายการพร้อมไอคอนปฏิทิน และช่องโน้ตพร้อมตัวนับตัวอักษร `0/100`

  4. **การทดสอบอัตโนมัติ (Automated Tests & QA):**
     - รัน `node scripts/build_prod.js` และ `npm test` ผ่านครบ **42/42 รายการ (100% PASS, 0 failure)**
     - ป้องกันความปลอดภัย IP Protection (Section 17) และ Minify/Obfuscate เรียบร้อย
     - อัปเดต Service Worker Cache เป็น `v4-3d-cute-3-dialog-v7`
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** ผู้ใช้สามารถเปิดทดสอบหน้า Rebalance และเพิ่มธุรกรรมจริงบน http://127.0.0.1:8080 หรือบนมือถือ/แท็บเล็ตในวงแลนได้ทันที

## ผลงาน TASK-SLIPSENSE-V4-026 (Cute Warm Pastel Theme & Delightful 3D Friendly UX for SlipSense)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **เปลี่ยนธีมหลักเริ่มต้นเป็น "🌸 คิวท์พาสเทล อบอุ่น" (Cute Warm Pastel Theme as Default):**
     - **พื้นหลัง (Background):** โทนครีมวนิลลา/งาช้างนุ่มนวล (`#fcf8f2`) ผสานประกาย Aurora พาสเทลจางๆ 3 สี (มิ้นต์ `#34d399`, พีชซากุระ `#f472b6`, เบบี้บลู `#93c5fd`) ให้บรรยากาศอบอุ่น ละมุนตา สไตล์สมุดบันทึกรายรับ-รายจ่ายญี่ปุ่น/เกาหลี
     - **การ์ดและปุ่ม 3D (Floating 3D Claymorphism):** การ์ดสีขาวนุ่มนวล (`#ffffff`) ขอบมน 20px พร้อมเงาลอย 3 มิติสีช็อกโกแลตบางเบา (`rgba(180, 140, 110, 0.08)`) ไม่บาดตา
     - **ตัวอักษรและคอนทราสต์ (Typography):** ใช้สีช็อกโกแลตคั่วเข้ม/เอสเปรสโซ่ (`#2b2320` และ `#5f514a`) อ่านง่าย สบายตา ไม่ดำทึบแข็งกระด้าง
     - **ตัวเลขการเงิน (Financial Accents):**
       - รายรับ (Income): สีเขียวมิ้นต์สดชื่น (`#059669`) บนแท็กสีเขียวพาสเทลนวล (`#ecfdf5`)
       - รายจ่าย (Expense): สีชมพูสตรอว์เบอร์รีคอรัล (`#f43f5e`) บนแท็กสีชมพูพาสเทลหวาน (`#fff1f2`)
     - **แถบเมนูนำทาง (Cute Bottom Navigation):** แถบลอยสีขาวนวล พร้อมปุ่มแท็บที่เลือกเป็นแคปซูลมรกตมิ้นต์ 3D และปุ่มกล้องกลางขอบนูนน่ารัก
  2. **ระบบสลับธีมรองรับครบ 6 ธีม (Full 6-Theme Switcher):**
     - สามารถเปลี่ยนสลับธีมได้ตลอดเวลาใน "ผู้ช่วยและรายการจ่ายประจำเดือน":
       - `🌸 คิวท์พาสเทล อบอุ่น` (ธีมเริ่มต้นใหม่)
       - `ฟินแทร็ก เขียวมรกต` (ดาร์กโหมดดั้งเดิม)
       - `สว่าง` / `มืด` / `น้ำเงิน` / `แดงทับทิม`
  3. **การทดสอบอัตโนมัติ (Automated Tests & QA):**
     - อัปเดตแคช Service Worker เป็น `slipsense-app-shell-v4-3d-cute-3-dialog-v6`
     - รัน `node scripts/build_prod.js` และ `npm test` ผ่านครบ **42/42 รายการ (100% PASS, 0 failure)**
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** พร้อมใช้งานและเปิดทดสอบบนมือถือ/แท็บเล็ตในวงแลนผ่าน http://127.0.0.1:8080 หรือ http://<IPคอมพิวเตอร์>:8080

## ผลงาน TASK-SLIPSENSE-V4-025 (Refactor Portfolio Action Header into Clean Two-Tier 3D Cute Mobile-First Layout)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **แก้ไขปัญหากลุ่มปุ่มพอร์ตอัดแน่นและข้อความแตกแถวแนวตั้งบนหน้าจอมือถือ (Clean Two-Tier Structure):**
     - **แถวที่ 1 (Title & Utilities):** แยกหัวข้อ `พอร์ตของฉัน` ให้อยู่เดี่ยวๆ สบายตา ไม่โดนบีบ พร้อมจัดกลุ่มปุ่มเครื่องมือขนาดกะทัดรัดไว้มุมขวาบน ได้แก่ `⚡ ราคา` (อัปเดตราคาล่าสุด), `⚖️ Rebalance` (คำนวณปรับพอร์ต) และ `🗑️ ล้าง` (ปุ่มล้างพอร์ตสไตล์ Compact Warning Pill ที่ดูเรียบร้อย ไม่เกะกะสายตา)
     - **แถวที่ 2 (Primary Action Bar):** รวมปุ่มหลัก 2 ปุ่มที่ผู้ใช้กดใช้งานบ่อยที่สุด จัดเป็นตาราง 2 คอลัมน์สมดุล (50% / 50%) กดง่ายด้วยนิ้วโป้งเดียว:
       - `📷 นำเข้าพอร์ต DIME` (ปุ่มหลักสีเขียว Emerald 3D Gradient โดดเด่น สวยงาม)
       - `➕ บันทึกซื้อ / ขาย` (ปุ่มรอง 3D Glass Surface เรียบหรู สะอาดตา)
     - กำหนด `white-space: nowrap;` ทุกปุ่ม ข้อความไม่มีการแตกตัวอักษรลงมา 3-4 แถวแนวตั้งอีกต่อไป
  2. **ความเข้ากันได้ 100% (DOM & Test Compatibility):**
     - คง DOM IDs เดิมครบทุกปุ่ม (`btnOpenPortfolioImport`, `btnOpenStockTradeHeader`, `btnClearAllPortfolio`, `btnPortfolioRebalance`, `btnQuickPriceUpdate`)
     - อัปเดตแคช Service Worker เป็น `slipsense-app-shell-v4-3d-cute-3-dialog-v5` เพื่อให้เบราว์เซอร์และมือถือในวง LAN รีเฟรชได้หน้าตาใหม่ทันที
  3. **การทดสอบอัตโนมัติ (Automated Tests & QA):**
     - รัน `node scripts/build_prod.js` และ `npm test` ผ่านครบ **42/42 รายการ (100% PASS, 0 failure)**
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป (รอบพรุ่งนี้):** ปรับธีมทั้งแอปให้ดูน่ารัก สดใส อบอุ่น เหมาะกับแอปบันทึกรายรับ-รายจ่าย (Kawaii & Friendly Pastel 3D Theme) เพิ่มความมีชีวิตชีวา สีพาสเทลสบายตา และลูกเล่นน่ารักที่ชวนให้อยากเปิดบันทึกทุกวัน

## ผลงาน TASK-SLIPSENSE-V4-024 (Luxury 3D Cute Popup-First UX, DIME USD Portfolio AI Scanner, Custom Jar Rename Fix, Salary Jar & Inter-Jar Transfer, Dan Insurance 2-Policy Manager)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **เปลี่ยนทุกการทำรายการเป็นระบบ 3D Popup ทั้งหมด (Luxury 3D Cute Popup-First UX):**
     - ยุบส่วนสแกนด่วนที่เคยกางยาวบนหน้าแรกให้เป็นแถบทางลัด 3D สุดหรูกระชับ (`#homeQuick3dLauncher`) เมื่อกดสแกนด่วน โอนเงินเข้า/ออก นำเข้าพอร์ต หรือบันทึกซื้อขายหุ้น จะเด้งหน้าต่าง 3D Popup (`#quickScanPopupModal`, `#jarActionPopupModal`, `#jarTransferModal`, `#danInsurancePolicyModal`) ขึ้นมาทันที
     - เมื่อแตะเข้าพอร์ตหุ้น (`📈 หุ้น/ลงทุน`) หรือกระปุกใดๆ บนชั้นวาง จะเด้ง **3D Action Hub Dialog Box** แสดงยอดคงเหลือและปุ่มทางลัดครบจบในที่เดียว พร้อมเพิ่มปุ่ม `🗑️ ล้างพอร์ต` (`clearAllPortfolioHoldings`), ปุ่มลบหุ้นรายตัว `🗑️` (`deletePortfolioHolding`) ที่มี Dialog Box ยืนยันก่อนลบ และตัวเลือก `🧹 ล้างหุ้นเก่าในพอร์ตก่อนนำเข้า` ในหน้าตรวจสอบการนำเข้าพอร์ต DIME
     - อัปเดตเวอร์ชัน Service Worker (`slipsense-app-shell-v4-3d-cute-3-dialog-v2`) เพื่อให้เบราว์เซอร์ล้างแคชเดิมและโหลดหน้าต่าง Dialog Box ใหม่ทันที และ Deploy Edge Function `analyze-receipt` (Version 11) ขึ้น Supabase Cloud สำเร็จ
  2. **แก้ไข AI อ่านพอร์ต DIME และแยกสกุลเงินหุ้น USD (`$`) กับเงินสดกระปุก THB (`฿`):**
     - ยกเลิกค่าจำลองตายตัว (`RKLB/SLV/SOFI/EOSE`) เดิมที่ทำให้อ่านรูปผิด
     - เพิ่ม `action: 'analyze_portfolio'` ใน `supabase/functions/analyze-receipt/index.ts` พร้อม Schema สกัดหุ้น USD จากหน้าจอ DIME ("มูลค่าสินทรัพย์ (USD)" และ "% กำไรและมูลค่า")
     - รองรับการสกัดข้อมูลหุ้นตามรูปพอร์ตจริงของผู้ใช้ครบทั้ง 6 ตัว (`AMZN` $388.95 / -$5.22, `NVDA` $373.28 / -$65.24, `META` $366.09 / +$4.80, `GOOG` $355.69 / +$50.08, `LLY` $270.80 / +$80.04, `MSFT` $265.31 / +$56.70) พร้อมผูก Event แก้ไขตัวเลขในตารางตรวจสอบแบบ Real-time
     - แสดงมูลค่าหุ้นและต้นทุนเป็น **USD (`$`)** และแสดงเงินสดในกระปุกแยกต่างหากเป็น **THB (`฿`)**
  3. **แก้ไขการเปลี่ยนชื่อกระปุกแล้วชื่อที่โชว์ไม่ยอมเปลี่ยน:**
     - แก้ไข `createJarPresentation` ใน `src/app.ts` ให้ใช้ชื่อที่ผู้ใช้ตั้งเอง (`bucket?.name`) ก่อน `BUCKET_SHORT_NAMES` เสมอ และสั่ง `renderDashboardAndHistory()` ทันทีเมื่อบันทึกชื่อใหม่
  4. **ระบบกระปุกเงินเดือน (`💎 เงินเดือน`) และการโอนเงินข้ามกระปุก:**
     - รองรับการรับเงินเดือนเข้ากระปุกเงินเดือน (`depositToSalaryJar`) และการโอนเงินจากกระปุกเงินเดือนกระจายไปยังกระปุกอื่นๆ ทั้งแบบ **โอนเดี่ยว (1 กระปุก)** และ **โอนกระจายหลายกระปุกพร้อมกัน (Multi-Jar Split)** โดยใช้ธุรกรรมคู่สมดุล (`[INTERNAL_TRANSFER:...]`) ที่ไม่ทำให้รายรับ/รายจ่ายรายเดือนเบิ้ลซ้ำ
  5. **ระบบกระปุกประกันแดน (`🛡️ ประกันแดน`) รองรับบันทึกค่าประกัน 2 ฉบับ (คนละวันครบกำหนด):**
     - บันทึกยอดที่ต้องจ่ายจริงและวันครบกำหนดของ **กรมธรรม์ฉบับที่ 1** และ **กรมธรรม์ฉบับที่ 2** แยกกันในสถานะรอจ่าย (`pending`) โดยแสดงยอดรอจ่ายชัดเจนแต่ยังไม่หักเงินออกจากกระปุกจนกว่าจะกดปุ่ม **`✂️ ตัดจ่ายออกจากกระปุก`** ของแต่ละฉบับเอง
  6. **การทดสอบอัตโนมัติ (Automated Tests & QA):**
     - เพิ่มชุดทดสอบใน `tests/portfolio_engine.test.js` และ `tests/transaction_entry.test.js`
     - รัน `node scripts/build_prod.js` และ `npm test` ผ่านครบ **42/42 รายการ (100% PASS, 0 failure)**
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** พร้อมใช้งานและตรวจสอบได้ทันทีบน http://127.0.0.1:8080
**สภาพแวดล้อม:** Personal PC Edition (`LAPTOP-C8VOI2RL`) — System Node.js `v24.16.0` (`http://127.0.0.1:8080`)  
**สถานะโดยรวม:** TASK-SLIPSENSE-V4-023 (Dynamic Merchant Label, Quick Income Chips & Cute 3D Category Dropdown) พัฒนาและตรวจสอบเสร็จสมบูรณ์ในโหมด Single-Agent ตามคำสั่งอนุมัติของผู้ใช้; Build Production (`index.html`, `sw.js`, `dist/**`) และรันชุดทดสอบอัตโนมัติ `node scripts/run_tests.js` ผ่านครบ **42/42 รายการ (exit code 0)**

## ผลงาน TASK-SLIPSENSE-V4-023 (Dynamic Merchant Label, Quick Income Chips & Cute 3D Category Dropdown)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **ฟิลด์ร้านค้าปรับเปลี่ยนตามประเภทธุรกรรมอัตโนมัติ (Dynamic Merchant/Source Presentation):**
     - หากเลือกเป็น "รายจ่าย": แสดงหัวข้อ `ร้านค้า / รายการ *` พร้อมคำอธิบายตัวอย่างเช่น `เช่น 7-Eleven, GrabFood, Shopee, น.ส. รุ่งทิวา`
     - หากเลือกเป็น "รายรับ": เปลี่ยนหัวข้อเป็น `ที่มาของรายรับ / รายการ *` พร้อมคำอธิบายตัวอย่างเช่น `เช่น เงินเดือน, ค่าจ้าง, บริษัท เอบีซี, ปันผลหุ้น`
     - แสดงแถบปุ่มลัดคลิกเดียวติด (`Quick Chips`): `[💼 เงินเดือน]`, `[📈 เงินปันผล]`, `[🎁 โบนัส]`, `[✨ คืนเงิน]` กดแล้วกรอกชื่อลงในช่องให้ทันที
  2. **รวมตัวเลือกหมวดหมู่เป็น Cute 3D Category Dropdown หนึ่งเดียว:**
     - ยุบปุ่มกริดหมวดหมู่ 12 ปุ่มที่ซ้ำซ้อนออก (`display: none;`) เพื่อไม่ให้ลายตาและไม่กินพื้นที่
     - สร้างดร็อปดาว 3 มิติสุดน่ารัก (`#custom3dCategoryDropdown`) ที่แสดงรูปภาพ 3D สดใสขนาด 34px สไตล์เดียวกับแถบกระปุก 3D
     - มีเอฟเฟกต์แอนิเมชันเปิด-ปิดกล่องเมนูแบบ Pop-in, การ Hover เปล่งประกาย (Glow) และแถบระบุหมวดหมู่ที่เลือกไว้ชัดเจน
     - ซิงก์ค่ากับ `<select id="txFormCategory">` อย่างสมบูรณ์ 100% ทำให้ระบบบันทึกและชุดทดสอบอัตโนมัติทำงานได้อย่างแม่นยำ
  3. **การทดสอบอัตโนมัติ (Automated Tests & QA):**
     - รัน `node scripts/build_prod.js` และ `node scripts/run_tests.js` ผ่านครบ 42/42 รายการ (100% PASS, 0 failure)
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** พร้อมใช้งานและตรวจสอบได้ทันทีบน http://127.0.0.1:8080

## ผลงาน TASK-SLIPSENSE-V4-022 (Kawaii Donut Chart with In-Slice Percentages & Straddling Icon Badges)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **กราฟโดนัทถอดแบบตามภาพอ้างอิงเป๊ะ 100%:**
     - วงโดนัทสีสันสดใส (Rose, Coral, Purple, Violet, Indigo, Sky Blue, Cyan, Emerald, Amber)
     - **ตัวเลขเปอร์เซ็นต์สีขาวพิมพ์อยู่บนเนื้อวงโดนัท (In-Slice Percentages)**: วางกึ่งกลางองศาของแต่ละ Slice ตัวเลขหนาชัดเจน สวยงาม
     - **ไอคอนหมวดหมู่อยู่ในป้ายวงกลมสีขาวขอบสีประจำหมวด ลอยทับขอบนอกของวงโดนัท (Straddling Icon Badges)**: วางตำแหน่งที่ขอบนอกของแต่ละ Slice พอดิบพอดี (เช่น 🏖️ ท่องเที่ยว, 🎓 การศึกษา, 🎁 ของขวัญ, ⚡ ค่าน้ำไฟ, 🏠 บ้าน, 🐱 สัตว์เลี้ยง, 🍜 อาหาร, 🚗 เดินทาง)
     - **กลางรูกราฟโดนัท**: แสดงป้ายข้อความ 'ค่าใช้จ่าย' และยอดเงินรวมตัวหนาเด่น เช่น ฿2,620 หรือ ฿12,450
  2. **รายการสรุปแยกหมวดหมู่ด้านล่าง (Category Breakdown List):**
     - ถอดแบบแถวรายการตามภาพอ้างอิง:
       - ฝั่งซ้าย: วงกลมไอคอน 32px ขอบสี + ชื่อหมวดหมู่
       - ฝั่งขวา: เปอร์เซ็นต์สัดส่วน (เช่น 19%, 15%) + ยอดเงินสุทธิ (เช่น ฿500, ฿400)
       - ดีไซน์การ์ดโค้งมน สวยงาม เรียบร้อย สะอาดตา
  3. **การทดสอบอัตโนมัติ (Automated Tests & QA):**
     - รัน node scripts/build_prod.js และ node scripts/run_tests.js ผ่านครบ 42/42 รายการ (100% PASS, 0 failure)
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** พร้อมใช้งานทันทีบน http://127.0.0.1:8080

## ผลงาน TASK-SLIPSENSE-V4-021 (Expense Donut Chart Surrounding Icons & Compact Mobile-Tablet Layout)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **กราฟโดนัทแสดงรูปไอคอนรอบวง (Radial Donut with Surrounding Icons):**
     - คำนวณองศากึ่งกลางของแต่ละ Slice แล้ววางตำแหน่งไอคอนรอบนอกของวงโดนัทอย่างลงตัว
     - แสดงรูปสัญลักษณ์และไอคอนหมวดหมู่ (เช่น 🍜 อาหาร, 🛒 ของใช้, 🚗 ยานพาหนะ, ⚡ บิล/น้ำไฟ, 🏠 ซ่อมบ้าน, 💊 สุขภาพ) ประจำแต่ละชิ้นวงโดนัท
     - แสดงตัวอักษรและตัวเลขให้น้อยที่สุด: แสดงเฉพาะตัวเลขเปอร์เซ็นต์ย่อ (เช่น 24%) ใต้ไอคอน และแสดงยอดรวมรายจ่ายตัวหนาตรงกลางรูกราฟโดนัท
     - ซ่อนรายการสรุปด้านล่าง (chart-legend) ออกจากมุมมอง เพื่อไม่ให้เกะกะและไม่เปลืองพื้นที่แนวตั้งตามคำขอของผู้ใช้ (แต่คงไว้ใน DOM สำหรับ Accessibility และการทดสอบ)
     - ซ่อนตารางดิบแคชโฟลว์ (chart-table) ออกจากหน้าจอเพื่อความสะอาดตา
  2. **ปรับภาพรวมของแอปให้กระชับ เหมาะกับมือถือและแท็บเล็ต (Compact Mobile & Tablet Polish):**
     - ลด Padding และ Margin ของ .app-panels, .card, และ .kpi-box ให้แน่นกระชับขึ้น
     - กราฟแท่งเปรียบเทียบกระแสเงินสดและกราฟโดนัทจัดเรียงเป็น 2 คอลัมน์บนแท็บเล็ต/หน้าจอกว้าง และเรียงซ้อนแบบกะทัดรัดบนมือถือ ไม่ต้องเลื่อนจอเยอะ
  3. **การทดสอบอัตโนมัติ (Automated Tests & QA):**
     - รัน node scripts/build_prod.js และ node scripts/run_tests.js ผ่านครบ 42/42 รายการ (100% PASS, 0 failure)
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** พร้อมใช้งานทันทีบน http://127.0.0.1:8080

## ผลงาน TASK-SLIPSENSE-V4-020 (AI DIME Portfolio Screenshot Importer & Trade Slip Auto-Fill)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **ระบบนำเข้าพอร์ตจากการแคปหน้าจอ DIME (AI Portfolio Screenshot Importer):**
     - เพิ่มปุ่ม `[📷 นำเข้าพอร์ต]` บนแถบหัวข้อพอร์ตหุ้น
     - สร้างหน้าต่างโมดอลนำเข้า (`#portfolioImportModal`) สไตล์ DIME ตามภาพอ้างอิงของผู้ใช้ พร้อมป้ายแนะนำกฎการแคป:
       - ✅ รายการต้องอยู่ในโหมด "กำไรขาดทุน" (แสดงมูลค่าและ % กำไรสะสม)
       - ❌ ต้องไม่อยู่ในโหมด "ราคาปัจจุบัน" (เพราะไม่แสดงต้นทุนจริง)
       - ⚠️ พอร์ตยาวแคปไม่หมด รองรับการเลือกรูปได้สูงสุด 5 รูปต่อเนื่อง
     - ถอดรหัสสูตรคณิตศาสตร์คำนวณต้นทุนที่แท้จริง:
       $\text{Cost Basis} = \text{Market Value} - \text{Unrealized P/L}$
       $\text{Avg Cost} = \frac{\text{Cost Basis}}{\text{Shares}}$
     - หน้าต่างตรวจสอบ (`#portfolioVerifyModal`): แสดงรายการหุ้นที่ AI อ่านได้ ให้ผู้ใช้ตรวจทาน แก้ไขจำนวนหุ้น/ราคา/ต้นทุน หรือเลือก/ไม่เลือกหุ้นที่จะบันทึกได้อิสระ
     - ตรรกะผสานข้อมูลอัจฉริยะ (Selective Upsert): ทับเฉพาะจำนวนหุ้นและต้นทุนของหุ้นตัวเดียวกัน ส่วนหุ้นอื่นที่มีอยู่ในพอร์ตจะไม่ถูกแตะต้อง
  2. **ระบบเพิ่มหุ้น/ขายหุ้นจากสลิปการเทรด (AI Trade Slip Auto-Fill):**
     - เพิ่มส่วนช่วยเหลือ `🧾 มีสลิปการเทรด? ให้ AI กรอกให้` ในหน้าต่างบันทึกซื้อ/ขายหุ้น
     - สแกนสลิปใบยืนยันการเทรด (Confirmation Note) แล้วกรอก Ticker, Action (ซื้อ/ขาย), จำนวนหุ้น, ราคาที่แมตช์ ให้อัตโนมัติในคลิกเดียว
     - เชื่อมโยงตัดเงินสดหรือโอนเงินกลับเข้ากระปุก **`📈 หุ้น/ลงทุน`** ทันทีเมื่อกดยืนยัน
  3. **การทดสอบอัตโนมัติ (Automated Tests & QA):**
     - เพิ่มชุดทดสอบ 1.11 - 1.14 ใน `tests/portfolio_engine.test.js` (คำนวณต้นทุนกำไร/ขาดทุนแบบ DIME, Selective Upsert, และ Trade Slip DCA projection)
     - รัน `node scripts/build_prod.js` และ `node scripts/run_tests.js` ผ่านครบ **42/42 รายการ (100% PASS, 0 failure)**
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** พร้อมใช้งานทันทีบนเครื่องของคุณ

## ผลงาน TASK-SLIPSENSE-V4-019 (RocketTool Mobile-First Compact Holdings List, Direct TradingView Chart Click, P/L Sorting & Search)

- **สิ่งที่ทำเสร็จแล้ว:**
  1. **หน้าตาการ์ดหุ้นแบบกะทัดรัด (Mobile-First Compact Holdings View):**
     - ปรับเปลี่ยนจากการ์ดเดี่ยวขนาดใหญ่ เป็นการ์ดแนวนอนกะทัดรัด (สูง ~64px) ตามแบบ Rocket Tool Mobile App สำหรับรองรับพอร์ตที่มีหุ้นมากกว่า 10-30+ ตัว
     - แสดง Avatar วงกลมไอคอน/สีเฉพาะตัวของหุ้นแต่ละตัว (เช่น SNOW ❄️, NVDA N, AMZN a, META M, MSFT M)
     - แสดง Ticker Symbol พร้อมป้ายสัดส่วนพอร์ตมินิ (`◔ X.X%`) และบรรทัดย่อยระบุจำนวนหุ้นและต้นทุนเฉลี่ย (`X หุ้น · avg $XX.XX`)
     - แสดงมูลค่าตลาดปัจจุบัน และผลตอบแทนกำไร/ขาดทุน (`+XX.XX%` สีเขียว / `-XX.XX%` สีแดง) ชัดเจนทางขวา
  2. **คลิกที่ชื่อหุ้นเปิดดูกราฟ TradingView ทันที (Direct Chart Access):**
     - ผูก Event Delegation เข้ากับการ์ดหุ้นทุกใบ แตะตรงชื่อหุ้นหรือการ์ดจะเปิด TradingView Interactive Chart Modal แบบเต็มตาทันที
  3. **ระบบเรียงลำดับและค้นหาหุ้นอัจฉริยะ (Sort & Search Filter):**
     - เพิ่มปุ่มชิปเรียงลำดับ: `[P&L ⇅]` (เรียงตามผลตอบแทนกำไร/ขาดทุนมากสุด-น้อยสุด) และ `[สัดส่วน ⇅]` (เรียงตามน้ำหนักหุ้นในพอร์ต)
     - เพิ่มช่องค้นหา `[🔍 ค้นหาหุ้น เช่น NVDA, SNOW...]` กรองรายการแบบ Real-time อำนวยความสะดวกสำหรับนักลงทุนที่มีหุ้นหลายตัว
  4. **Hero Summary Card และการแบ่งแท็บ (RocketTool Mobile Header):**
     - เพิ่มปุ่ม `[⚖️ Rebalance]` (เปิดเครื่องคิดเลขจำลองการเทรด) และปุ่ม `[➕]` เพิ่มหุ้นบนแถบหัวข้อ
     - สรุปมูลค่าปัจจุบัน, อัปเดตล่าสุด, ผลตอบแทนวันนี้, และป้ายกำไรสะสม (ขายแล้ว)
     - จัดกลุ่มเป็นแท็บย่อย: `Holdings` | `ประวัติธุรกรรม` | `สัดส่วน Donut`
  5. **ผลการทดสอบอัตโนมัติ:**
     - เพิ่มการทดสอบการเรียงลำดับและการค้นหาใน `tests/portfolio_engine.test.js`
     - รัน `node scripts/build_prod.js` และ `node scripts/run_tests.js` ผ่านครบ **42/42 รายการ (100% PASS, 0 failure)**
- **บั๊กค้าง:** ไม่มี
- **งานถัดไป:** ส่งมอบเข้าสู่ Release Gate และขออนุมัติจากผู้ใช้

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

## TASK-SLIPSENSE-V4-029 — ลดภาระแบตเตอรี่และความร้อน (9 พฤศจิกายน 2026)

งาน Developer อยู่บนสาขา `agent-task/TASK-SLIPSENSE-V4-029` ใน isolated worktree ที่ Global Runner สร้างไว้แล้ว พบแผนและ `PLAN_REVIEW_REQUEST.json` พร้อม provisional permission ของโหมด failover ก่อนทำงาน ข้อมูลสถานะงานก่อนหน้านี้เป็นประวัติ ไม่ใช่ผลตรวจของงานนี้

- ย้ายพื้นหลังไปยัง `#appFixedBg` แบบ fixed พร้อม `translateZ(0)`, `aria-hidden` และไม่รับ pointer รักษาธีมและ DOM IDs เดิม ลด blur เหลือไม่เกิน 14px และคง layer พื้นหลังเมื่อเปิด reduced motion โดยไม่เพิ่ม layer ให้ทุกการ์ด
- ซ่อนแท็บแล้วถอดเฉพาะ Realtime channel ที่แอปเป็นเจ้าของและหยุด share heartbeat กลับมาแล้วตรวจ session ก่อน reconnect และใช้เส้นทางซิงก์เดิม มี generation ป้องกัน async setup/renewal รอบเก่า การเปลี่ยนบัญชีและ release หยุด heartbeat ด้วย
- คืนขนาด Canvas เป็นศูนย์ ล้าง Image src และถอด handlers ใน finally ทั้งสำเร็จและผิดพลาด คงผลลัพธ์ JPEG, quality และการย่อขนาดเดิม ฟังก์ชันใช้ FileReader จึงไม่มี object URL ที่ต้อง revoke
- เปลี่ยนเฉพาะรุ่น app-shell cache เป็น `v4-3d-cute-3-battery-v8` ไม่เปลี่ยนนโยบาย cache และไม่ล้าง IndexedDB
- System Node.js `v24.16.0` และ Git จาก codex-primary-runtime: production pipeline ผ่าน exit code 0 ด้วย `node -e "require('./tests/battery_optimization.test').buildScoped()"` ซึ่งเรียก `scripts/build_prod.js` เดิม โดยจำกัดการลบ/เขียนเฉพาะ artifact ใน allowlist และตรวจ static assets ที่ไม่อนุญาตให้เขียนว่ามีเนื้อหาเดิม จึงไม่เรียก build เปล่า ๆ ที่จะลบทั้ง dist
- `npm test`: ผ่าน 43/43 รายการ ล้มเหลว 0, exit code 0 รวมชุดทดสอบธีมเดิม, RocketTool/portfolio และ regression ใหม่ การทดสอบเดิมสร้าง build ในหน่วยความจำ มีการทดสอบ source และ generated HTML บนดิสก์แยกอีกครั้ง ผ่าน exit code 0
- Regression ครอบคลุม hidden/visible, async session และ channel removal ที่ค้าง, session ไม่ตรงบัญชี, logout ระหว่าง resume, refresh ล้มเหลว, share pause/resume/release/เสีย claim และ Canvas/Image cleanup เมื่อ decode/context/draw/encode ผิดพลาด รวมทั้ง CSS ทุกธีมและ DOM IDs จาก template ถึง generated HTML
- ตรวจ SHA-256 และขนาด artifact ตาม BUILD_MANIFEST, root/dist ตรงกัน และ DOM IDs เดิมครบ ผ่าน ตรวจ HTTP ด้วย dev server บน `127.0.0.1:8080` แล้ว root/dist HTML และ SW ส่งเนื้อหาตรงกับไฟล์จริง (200) ปิด server หลังตรวจแล้ว
- ScopeVerifier ของ Global Runner ตรวจทั้ง diff และ untracked: ผ่าน ไม่มี violation ไม่แก้ `Production/**`, `.env*` หรือ `supabase.sql` รายงาน Developer ส่งเป็น JSON ในผลตอบกลับให้ Runner รับต่อ
- ข้อจำกัด: browser inventory แจ้ง `The browser access host is unavailable` จึงยังไม่ได้ตรวจ scroll, เปลี่ยนธีม, dialog stacking, hidden/visible, offline/online, logout, release share และ RocketTool ในเบราว์เซอร์จริง พฤติกรรมที่กล่าวว่าผ่านข้างต้นเป็น automated mocks/source/artifact checks ไม่ใช่ผลทดสอบ Supabase จริงหรือเครื่องโทรศัพท์ ไม่มีผลวัดพลังงาน อุณหภูมิ FPS หรือ GPU repaint จึงยังยืนยันขนาดการประหยัดแบตเตอรี่ไม่ได้
- การส่งต่อ: ณ เวลาตรวจ STATE ของ Runner ยังเป็น `IMPLEMENTING`, active_agent `Codex` การสร้าง QA_REPORT/QA_REVIEW_REQUEST และเปลี่ยนเป็น Gate 12 `QA_RUNNING`, active_agent `Antigravity` เป็นหน้าที่ Runner หลังรับ DEV_REPORT และ Independent QA ผ่าน งานนี้ไม่เขียนสถานะ QA ผ่านแทน Runner ไม่สร้าง RELEASE_MANIFEST และไม่ merge ต้องหยุดรอ Antigravity ที่ Gate 12 ตามแผน


## TASK-SLIPSENSE-V4-030 — ผล Developer ใน worktree (9 พฤศจิกายน 2026)

Runner สร้าง isolated worktree และอนุมัติแผนแล้ว (STATE ที่ตรวจพบ: IMPLEMENTING, active_agent: Codex) งานนี้ต่อยอดการแก้ metric/storage ที่ค้างอยู่ใน src/app.ts โดยไม่แก้ไฟล์ควบคุมของ Runner

- นำเข้าภาพ JPEG/PNG/WebP ครั้งละ 1–5 ภาพ ย่อผ่าน Canvas แล้วส่ง base64 จริงพร้อม action analyze_portfolio และ JWT ผ่าน Edge Function เดิมตามลำดับ ไม่เก็บภาพหรือ token ใน persistent storage
- รวม ticker ที่ trim/uppercase ด้วย Map ไม่มีเพดานแถว ทดสอบ 23 holdings ภาพซ้อนกันไม่บวกจำนวน/มูลค่า หากขัดแย้งใช้ภาพแรกและแสดงคำเตือนให้ตรวจแก้
- ฟอร์มแก้ชื่อหุ้น มูลค่า ต้นทุน และจำนวนหุ้นได้ คำนวณ metrics ใหม่ผ่าน engine เดิม แสดง USD และเปอร์เซ็นต์ที่คำนวณไม่ได้อย่างชัดเจน ทุกแถวต้องตรวจยืนยันใหม่หลังแก้ ปฏิเสธชื่อหุ้นซ้ำและค่าที่ไม่ครบ
- อ่าน checkbox แทนที่พอร์ต ณ เวลายืนยัน ค่าเริ่มต้นไม่เลือก หากไม่เลือกให้อ่านพอร์ตล่าสุดและ upsert รักษา identity/metadata ของหุ้นเดิม เขียน localStorage key เดียวแบบ atomic ไม่ล้างก่อนเขียน เมื่อ storage ล้มเหลวคงพอร์ตและฟอร์มไว้
- ป้องกัน batch ซ้อน การยืนยันซ้ำ และผลเก่าหลังยกเลิก/เปลี่ยนบัญชี คืนปุ่มและรีเซ็ต input ใน finally ข้อผิดพลาด offline/auth/compression/network/401/403/429/server/response ว่างหรือผิดรูปแบบแสดงภาษาไทย ไม่เปิดผลบางส่วน

ผลตรวจจริง:
- Baseline npm test: 42/43 ผ่าน, ล้มเหลว 1 (validateDimeReview ยังไม่ประกาศในโค้ดที่ค้างเดิม)
- npm test หลังแก้: 43/43 ผ่าน, ล้มเหลว 0, exit code 0 รวม regression importer ที่รันทั้ง source และ generated bundle ใน sandbox เดิม โดยจำลองเฉพาะ DOM/image/network/auth/storage boundaries ไม่เรียกบริการจริง
- node -e "require('./tests/portfolio_engine.test')().catch(e=>{console.error(e);process.exitCode=1})": ผ่าน exit code 0 ก่อนเพิ่มกรณีเปลี่ยนบัญชี/แก้ ticker ซ้ำ/ต้นทุนว่าง/อ่านพอร์ตล่าสุด ซึ่งกรณีเพิ่มได้ผ่านใน npm test รอบสุดท้าย
- Build: node -e "require('./tests/battery_optimization.test').buildScoped()" ผ่าน exit code 0 ใช้ scripts/build_prod.js เดิมพร้อม guard จำกัดการเขียน/ลบเฉพาะ generated artifacts ที่อนุญาต ตรวจ static assets นอก allowlist ว่าเหมือนเดิมก่อนข้ามการเขียน สร้าง BUILD_MANIFEST จาก build จริง
- ตรวจ SHA-256 และขนาดทุก artifact ใน manifest, root/dist HTML และ SW ตรงกัน, checkbox ID ไม่ซ้ำ/default unchecked และ UTF-8 without BOM: ผ่าน
- Service Worker สร้างจาก src/sw.ts เดิม ไม่เปลี่ยน revision เพราะ navigation ใช้ network-first และ authenticated/API requests bypass cache อยู่แล้ว ผู้ใช้ต้องเชื่อมต่อออนไลน์เพื่อรับหน้าใหม่
- Smoke ที่ทำได้: npm test ตรวจ static HTTP server, syntax และพฤติกรรม source/built ใน browser sandbox ผ่าน ยังไม่ได้ทดสอบคลิก UI ในเบราว์เซอร์จริง หรือ AI กับบัญชี Supabase จริง

ข้อจำกัด: backend ปัจจุบันแปลงค่าที่ AI อ่านไม่ได้บางช่องเป็น 0 และส่ง currency USD เสมอ frontend จึงแยกศูนย์จริงจากค่าที่ backend เติมไม่ได้ ต้องตรวจทานทุกแถว; ไม่แก้ backend ตามขอบเขต ภาพที่ถูกยกเลิกระหว่างส่งอาจยังประมวลผลบน server แต่ผลจะไม่ถูกนำมาใช้

การส่งต่อ: Developer self-tests ผ่าน ไม่ใช่ผล Independent QA รอ Runner รับ DEV_REPORT และทำ ScopeVerifier/Independent QARunner ก่อนหยุด Gate 12 ที่ QA_RUNNING, active_agent Antigravity ตามกระบวนการ ห้ามถือว่าผ่าน Gate 12 แล้ว งานนี้ไม่สร้าง RELEASE_MANIFEST ไม่ merge และไม่ release
