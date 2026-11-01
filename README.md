# SlipSense (สลิปเซนส์) — ระบบบันทึกรายรับ-รายจ่ายอัจฉริยะจากใบเสร็จและสลิปด้วย AI

**SlipSense (`slipsense-expense-tracker`)** คือเว็บแอปพลิเคชันแบบ **Progressive Web App (PWA)** สำหรับบันทึกรายรับ-รายจ่ายส่วนบุคคลด้วยแนวคิด **Offline-First** ผสานพลังการอ่านใบเสร็จและสลิปโอนเงินภาษาไทย/อังกฤษด้วย **Google Gemini Structured Output** ผ่าน **Supabase Edge Function** พร้อมระบบซิงก์ข้อมูลข้ามอุปกรณ์แบบเรียลไทม์ผ่าน **Supabase Auth, PostgreSQL (Row Level Security) และ Realtime**

---

## สารบัญ (20 หัวข้อหลักตามมาตรฐาน Production)

1. [ภาพรวม Architecture](#1-ภาพรวม-architecture)
2. [โครงสร้างไฟล์](#2-โครงสร้างไฟล์)
3. [การสร้าง Supabase Project](#3-การสร้าง-supabase-project)
4. [การรัน SQL (`supabase.sql`)](#4-การรัน-sql-supabasesql)
5. [การตั้งค่า Authentication และ Redirect URLs](#5-การตั้งค่า-authentication-และ-redirect-urls)
6. [การตรวจสอบ RLS (Row Level Security)](#6-การตรวจสอบ-rls-row-level-security)
7. [การตั้งค่า Gemini API Key ฝั่ง Server](#7-การตั้งค่า-gemini-api-key-ฝั่ง-server)
8. [การตั้งค่า Model ID (`GEMINI_MODEL`)](#8-การตั้งค่า-model-id-gemini_model)
9. [การ Deploy Edge Function (`analyze-receipt`)](#9-การ-deploy-edge-function-analyze-receipt)
10. [การตั้งค่า Supabase URL และ Publishable/Anon Key บน Frontend](#10-การตั้งค่า-supabase-url-และ-publishableanon-key-บน-frontend)
11. [การ Deploy ขึ้น GitHub Pages](#11-การ-deploy-ขึ้น-github-pages)
12. [การติดตั้งบน iPhone (iOS Safari)](#12-การติดตั้งบน-iphone-ios-safari)
13. [การติดตั้งบน Android Tablet และมือถือ Android](#13-การติดตั้งบน-android-tablet-และมือถือ-android)
14. [วิธีทดสอบ Local-only Mode](#14-วิธีทดสอบ-local-only-mode)
15. [วิธีทดสอบ Offline Mode](#15-วิธีทดสอบ-offline-mode)
16. [วิธี Export/Import Backup (JSON และ CSV)](#16-วิธี-exportimport-backup-json-และ-csv)
17. [วิธีแก้ปัญหาที่พบบ่อย (Troubleshooting)](#17-วิธีแก้ปัญหาที่พบบ่อย-troubleshooting)
18. [ข้อจำกัดที่ยังมีอยู่ (Known Limitations)](#18-ข้อจำกัดที่ยังมีอยู่-known-limitations)
19. [ขั้นตอนเปลี่ยน Gemini Model ในอนาคต](#19-ขั้นตอนเปลี่ยน-gemini-model-ในอนาคต)
20. [Security Checklist ก่อนเปิดใช้งานจริง](#20-security-checklist-ก่อนเปิดใช้งานจริง)

---

## 1. ภาพรวม Architecture

SlipSense ออกแบบด้วยสถาปัตยกรรม **Offline-First Static PWA + Secure Serverless Backend** โดยแยกส่วนการทำงานออกเป็น 4 ชั้นหลักอย่างชัดเจน:

```
[ ผู้ใช้งาน (iPhone / Android / PC Browser) ]
       │
       ├── 1. Static PWA Frontend (index.html + sw.js + manifest.json)
       │      - ทำงานได้ทันทีโดยไม่ต้องมี Build Step บนเซิร์ฟเวอร์
       │      - บีบอัดรูปภาพในเบราว์เซอร์ (Canvas Image Compression <= 1600px JPEG)
       │      - แสดง Verification Form ให้ผู้ใช้ตรวจสอบ/แก้ไขข้อมูลก่อนบันทึกเสมอ
       │
       ├── 2. Offline-First Storage (IndexedDB: slipsense_db)
       │      - เก็บธุรกรรมทั้งหมดในเครื่องพร้อมสถานะซิงก์:
       │        • local_only   (โหมดใช้งานในเครื่องอย่างเดียว)
       │        • pending_sync (รอซิงก์ขึ้นคลาวด์เมื่อออนไลน์)
       │        • synced       (ซิงก์ตรงกับ Supabase แล้ว)
       │        • sync_failed  (ซิงก์ไม่สำเร็จ รอการลองใหม่/ตรวจสอบ)
       │
       ├── 3. Supabase Backend (Auth + PostgreSQL + RLS + Realtime)
       │      - ยืนยันตัวตนด้วย Email/Password หรือ Magic Link (JWT)
       │      - ตาราง public.transactions และ public.ai_usage_logs บังคับใช้ RLS ทุกแถว
       │      - ซิงก์ข้อมูลด้วย client_id (UUID) ป้องกันข้อมูลซ้ำ (Idempotent Upsert)
       │
       └── 4. Supabase Edge Function (analyze-receipt) + Google Gemini API
              - ตรวจสอบ JWT ของผู้ใช้ + จำกัดอัตราการเรียกใช้งาน (Rate Limit 10 ครั้ง/นาที, 100 ครั้ง/วัน)
              - เรียก Google Gemini API (responseMimeType: application/json + responseSchema)
              - ห้ามเก็บ Gemini API Key ไว้ใน Frontend เด็ดขาด
```

---

## 2. โครงสร้างไฟล์

```text
slipsense-expense-tracker/
├── index.html                                  # แอปพลิเคชันหลัก (UI + IndexedDB + Sync + AI Verification Form)
├── manifest.json                               # PWA Web App Manifest (Relative Paths รองรับทุก Subpath)
├── sw.js                                       # Service Worker สำหรับ Cache App Shell และรองรับ Offline Mode
├── apple-touch-icon.png                        # ไอคอนสำหรับ iOS Home Screen (180x180)
├── icons/
│   ├── icon-192.png                            # ไอคอน PWA ขนาด 192x192
│   └── icon-512.png                            # ไอคอน PWA ขนาด 512x512
├── vendor/
│   └── supabase.min.js                         # ไลบรารี Supabase Client แบบ Local Fallback
├── supabase.sql                                # สคริปต์ฐานข้อมูล PostgreSQL (Tables, Indexes, Triggers, RLS)
├── supabase/
│   └── functions/
│       └── analyze-receipt/
│           └── index.ts                        # Supabase Edge Function เชื่อมต่อ Gemini API อย่างปลอดภัย
├── scripts/
│   ├── dev_server.js                           # Local Static HTTP Server (http://127.0.0.1:8080)
│   ├── generate_icons.js                       # สคริปต์สร้างไอคอน PNG มาตรฐาน
│   └── run_tests.js                            # สคริปต์ตรวจสอบโครงสร้าง ความปลอดภัย และชุดทดสอบอัตโนมัติ
├── .env.example                                # ตัวอย่างการตั้งค่า Environment Variables
├── AGENTS.md                                   # กฎความปลอดภัยและแนวทางการพัฒนาโปรเจกต์
├── STATUS.md                                   # รายงานสถานะการพัฒนาและการตรวจสอบคุณภาพ
└── README.md                                   # คู่มือการติดตั้ง ใช้งาน และดูแลรักษาระบบฉบับสมบูรณ์
```

---

## 3. การสร้าง Supabase Project

1. ไปที่ [https://supabase.com/dashboard](https://supabase.com/dashboard) และเข้าสู่ระบบ
2. คลิก **New project** และเลือก Organization ที่ต้องการ
3. ตั้งค่าโปรเจกต์:
   - **Name:** `slipsense-expense-tracker`
   - **Database Password:** ตั้งรหัสผ่านที่ปลอดภัยและเก็บรักษาไว้ในที่ปลอดภัย
   - **Region:** เลือก `Southeast Asia (Singapore)` (`ap-southeast-1`) เพื่อให้มีความหน่วงต่ำที่สุดสำหรับผู้ใช้ในประเทศไทย
4. คลิก **Create new project** และรอประมาณ 1–2 นาทีจนสถานะโปรเจกต์เป็น `Active`
5. ไปที่เมนู **Project Settings -> API** เพื่อจดบันทึกค่า 2 ค่าสำหรับใช้งานในขั้นตอนถัดไป:
   - **Project URL:** เช่น `https://xxxxxxxxxxxxxxxxxxxx.supabase.co`
   - **Project API Keys (`anon` / `publishable` key):** คีย์สาธารณะสำหรับฝั่ง Frontend (ห้ามคัดลอก `service_role` มาใส่ใน Frontend เด็ดขาด)

---

## 4. การรัน SQL (`supabase.sql`)

1. ในหน้า Supabase Dashboard ให้ไปที่เมนู **SQL Editor** ทางแถบซ้าย
2. คลิก **New query**
3. เปิดไฟล์ `supabase.sql` ในโปรเจกต์นี้ คัดลอกโค้ด SQL ทั้งหมดไปวางใน SQL Editor
4. คลิกปุ่ม **Run** (หรือกด `Ctrl + Enter`)
5. สคริปต์ `supabase.sql` จะดำเนินการสร้างโครงสร้างดังต่อไปนี้แบบ Idempotent (รันซ้ำได้อย่างปลอดภัย):
   - เปิดใช้งาน Extension `pgcrypto`
   - สร้างตาราง `public.transactions` พร้อม Constraint ตรวจสอบ `type`, `amount`, `confidence`, `source` และ `UNIQUE (user_id, client_id)`
   - สร้างตาราง `public.ai_usage_logs` สำหรับบันทึกประวัติการเรียก AI และตรวจสอบ Rate Limit
   - สร้าง Indexes สำหรับเร่งความเร็วการค้นหาและการทำ Delta Sync (`user_id`, `transaction_date`, `updated_at`, `deleted_at`)
   - สร้าง Trigger `trg_transactions_set_updated_at` เพื่อบังคับอัปเดตเวลา `updated_at` จากฝั่งเซิร์ฟเวอร์ทุกครั้ง
   - เปิดใช้งาน **Row Level Security (RLS)** และสร้าง Policies ครบทุกคำสั่ง (`SELECT`, `INSERT`, `UPDATE`, `DELETE`)
   - ผูกตาราง `public.transactions` เข้ากับ `supabase_realtime` publication

---

## 5. การตั้งค่า Authentication และ Redirect URLs

เพื่อให้ระบบเข้าสู่ระบบด้วย Email/Password และ Magic Link ทำงานได้ทั้งขณะพัฒนาในเครื่อง (`localhost`) และเมื่อใช้งานจริงบน GitHub Pages:

1. ใน Supabase Dashboard ไปที่เมนู **Authentication -> Providers**
   - ตรวจสอบว่า **Email** เปิดใช้งานอยู่ (`Enabled`)
   - สามารถเปิดทั้งการเข้าสู่ระบบด้วยรหัสผ่านปกติและ Magic Link (OTP)
2. ไปที่เมนู **Authentication -> URL Configuration**
3. ตั้งค่า **Site URL** เป็น URL หลักที่ใช้งานจริง เช่น:
   - กรณี Project Site: `https://<username>.github.io/<repo>/`
   - หรือกรณีพัฒนาในเครื่อง: `http://127.0.0.1:8080`
4. ในหัวข้อ **Redirect URLs** ให้เพิ่มรายการ URL ทั้งหมดที่อนุญาตให้ Redirect กลับมาหลังยืนยันตัวตน:
   - สำหรับพัฒนาในเครื่อง (Local Development):
     - `http://127.0.0.1:8080`
     - `http://127.0.0.1:8080/`
     - `http://127.0.0.1:8080/**`
   - สำหรับ GitHub Pages แบบ **User Site** (`<username>.github.io`):
     - `https://<username>.github.io/`
     - `https://<username>.github.io/**`
   - สำหรับ GitHub Pages แบบ **Project Site** (`<username>.github.io/<repo>`):
     - `https://<username>.github.io/<repo>/`
     - `https://<username>.github.io/<repo>/**`
5. คลิก **Save** เพื่อบันทึกการตั้งค่า

---

## 6. การตรวจสอบ RLS (Row Level Security)

หลังจากรัน `supabase.sql` แล้ว ควรตรวจสอบให้มั่นใจว่า RLS ทำงานอย่างถูกต้องก่อนใช้งานจริง:

1. ไปที่เมนู **Database -> Tables** ใน Supabase Dashboard
2. ตรวจสอบว่าตาราง `transactions` และ `ai_usage_logs` มีป้ายสถานะ **RLS Enabled** ทั้งคู่
3. หรือรันคำสั่งตรวจสอบใน **SQL Editor** ดังนี้:

```sql
-- 1. ตรวจสอบว่าเปิด RLS แล้วทั้ง 2 ตาราง (relrowsecurity ต้องเป็น true)
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname IN ('transactions', 'ai_usage_logs');

-- 2. ตรวจสอบรายการ Policies ทั้งหมด
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('transactions', 'ai_usage_logs')
ORDER BY tablename, policyname;
```

**สิ่งที่ต้องเห็น:**
- `transactions`: มี 4 Policies (`transactions_select_own`, `transactions_insert_own`, `transactions_update_own`, `transactions_delete_own`) ที่จำกัดเฉพาะ `auth.uid() = user_id`
- `ai_usage_logs`: มี 2 Policies (`ai_usage_logs_select_own`, `ai_usage_logs_insert_own`) ที่จำกัดเฉพาะ `auth.uid() = user_id`

---

## 7. การตั้งค่า Gemini API Key ฝั่ง Server

> **กฎเหล็กด้านความปลอดภัย:** ห้ามนำ `GEMINI_API_KEY` ไปใส่ใน `index.html`, `sw.js`, `localStorage`, `IndexedDB` หรือ Commit ลง Git เด็ดขาด ต้องตั้งค่าผ่าน **Supabase Secrets** สำหรับ Edge Function เท่านั้น

1. สร้าง Gemini API Key จาก [Google AI Studio](https://aistudio.google.com/)
2. ติดตั้งและเข้าสู่ระบบ Supabase CLI บนเครื่องคอมพิวเตอร์:
   ```powershell
   npx supabase login
   npx supabase link --project-ref <YOUR_PROJECT_REF>
   ```
3. ตั้งค่า `GEMINI_API_KEY` ใน Supabase Edge Function Secrets:
   ```powershell
   npx supabase secrets set GEMINI_API_KEY="ใส่_API_KEY_ของคุณที่นี่"
   ```
4. (ทางเลือก) ตั้งค่า `ALLOWED_ORIGIN` เพื่อจำกัด CORS เฉพาะโดเมนของคุณ:
   ```powershell
   npx supabase secrets set ALLOWED_ORIGIN="https://<username>.github.io"
   ```

---

## 8. การตั้งค่า Model ID (`GEMINI_MODEL`)

SlipSense แยกชื่อโมเดล AI ออกจากโค้ดผ่านตัวแปรแวดล้อม `GEMINI_MODEL` โดยมีค่าเริ่มต้นคือ `gemini-2.5-flash` ซึ่งเป็นโมเดลที่รวดเร็ว แม่นยำต่อการอ่านภาษาไทย และรองรับ Structured Output (`responseSchema`):

```powershell
npx supabase secrets set GEMINI_MODEL="gemini-2.5-flash"
```

สามารถตรวจสอบรายการ Secrets ที่ตั้งไว้แล้ว (โดยไม่แสดงค่าจริง) ได้ด้วยคำสั่ง:

```powershell
npx supabase secrets list
```

---

## 9. การ Deploy Edge Function (`analyze-receipt`)

เมื่อตั้งค่า Secrets เรียบร้อยแล้ว ให้ทำการ Deploy ฟังก์ชัน `analyze-receipt` ขึ้นสู่ Supabase:

1. รันคำสั่ง Deploy จากโฟลเดอร์รากของโปรเจกต์:
   ```powershell
   npx supabase functions deploy analyze-receipt
   ```
2. หมายเหตุสำคัญ:
   - ห้ามใส่แฟลก `--no-verify-jwt` หรือหากตั้งค่าใน `config.toml` ตัวโค้ดใน `supabase/functions/analyze-receipt/index.ts` ก็มีการตรวจสอบ `Authorization: Bearer <JWT>` ผ่าน `supabaseClient.auth.getUser()` ซ้ำอีกชั้นหนึ่งเสมอ
3. ทดสอบเรียกใช้งานเบื้องต้น (เมื่อมี Access Token ของผู้ใช้ที่ล็อกอินแล้ว):
   ```powershell
   curl -i --location --request POST "https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/analyze-receipt" `
     --header "Authorization: Bearer <USER_ACCESS_TOKEN>" `
     --header "Content-Type: application/json" `
     --data '{"imageBase64":"...","mimeType":"image/jpeg"}'
   ```

---

## 10. การตั้งค่า Supabase URL และ Publishable/Anon Key บน Frontend

ในแอปพลิเคชัน SlipSense ผู้ใช้สามารถตั้งค่าการเชื่อมต่อคลาวด์ได้ง่ายๆ ผ่านหน้า UI โดยไม่ต้องแก้ไขโค้ด:

1. เปิดแอป SlipSense แล้วไปที่แท็บ **ตั้งค่า (Settings)**
2. กรอกข้อมูลในส่วน **การเชื่อมต่อ Supabase Cloud**:
   - **Supabase Project URL:** `https://<YOUR_PROJECT_REF>.supabase.co`
   - **Supabase Publishable / Anon Key:** `eyJhbGciOi...` (หรือ `sb_publishable_...`)
3. คลิก **บันทึกการตั้งค่า Cloud** แล้วเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน (หรือ Magic Link)

### ทำความเข้าใจเรื่องความปลอดภัยของ Publishable / Anon Key
- **Anon Key (หรือ Publishable Key) เป็นเพียง Public Client Key** ที่ออกแบบมาให้ระบุตัวตนของโปรเจกต์เมื่อเรียก API จากเบราว์เซอร์ **ไม่ใช่กลไกควบคุมสิทธิ์การเข้าถึงข้อมูล**
- กลไกที่บังคับสิทธิ์จริงคือ **PostgreSQL Row Level Security (RLS)** ร่วมกับ **User JWT (`auth.uid()`)** ที่ออกโดย Supabase Auth เมื่อผู้ใช้ล็อกอินสำเร็จ
- ดังนั้น ต่อให้บุคคลภายนอกเห็น Anon Key ในเบราว์เซอร์ ก็จะไม่สามารถอ่าน แก้ไข หรือลบข้อมูลของผู้อื่นได้ และไม่สามารถเรียกใช้ Gemini AI ได้หากไม่มี JWT ของผู้ใช้ที่ผ่านการยืนยันตัวตน
- **ข้อห้ามเด็ดขาด:** ห้ามนำ `service_role` key หรือ `GEMINI_API_KEY` มาใส่ในช่องตั้งค่า Frontend นี้โดยเด็ดขาด (ระบบมีตัวตรวจจับและบล็อกคีย์อันตรายอัตโนมัติ)

---

## 11. การ Deploy ขึ้น GitHub Pages

SlipSense ออกแบบด้วย Relative Paths (`./manifest.json`, `./sw.js`, `./icons/...`) จึงสามารถนำไปวางบน GitHub Pages ได้ทันทีโดย **ไม่ต้องมี Build Step บนเซิร์ฟเวอร์** และรองรับทั้ง 2 รูปแบบ:

### รูปแบบที่ 1: User Site (`https://<username>.github.io/`)
1. สร้าง Repository ชื่อ `<username>.github.io`
2. Push ไฟล์ทั้งหมดของโปรเจกต์ขึ้นไปยัง Branch `main`
3. ไปที่ **Settings -> Pages** เลือก **Source: Deploy from a branch** -> Branch `main` / `/ (root)` แล้วกด **Save**

### รูปแบบที่ 2: Project Site (`https://<username>.github.io/<repo>/`)
1. สร้าง Repository ชื่อใดก็ได้ เช่น `slipsense-expense-tracker`
2. Push ไฟล์ทั้งหมดขึ้นไปยัง Branch `main`
3. ไปที่ **Settings -> Pages** เลือก Branch `main` และโฟลเดอร์ `/ (root)` แล้วกด **Save**
4. รอประมาณ 1–2 นาที เว็บแอปจะพร้อมใช้งานที่ `https://<username>.github.io/slipsense-expense-tracker/` โดยที่ Service Worker (`./sw.js`) และ Manifest (`./manifest.json`) จะอ้างอิง Subpath `/<repo>/` ได้อย่างถูกต้องอัตโนมัติ

---

## 12. การติดตั้งบน iPhone (iOS Safari)

1. เปิดเบราว์เซอร์ **Safari** บน iPhone แล้วเข้าไปที่ URL ของแอป (บน GitHub Pages ที่เป็น HTTPS)
2. แตะปุ่ม **แชร์ (Share)** (ไอคอนสี่เหลี่ยมที่มีลูกศรชี้ขึ้นด้านล่างหน้าจอ)
3. เลื่อนลงมาแล้วแตะ **เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)**
4. ตรวจสอบชื่อแอป `SlipSense` และไอคอน (ระบบใช้ `apple-touch-icon.png` ขนาด 180x180) แล้วแตะ **เพิ่ม (Add)** ที่มุมขวาบน
5. เปิดแอปจากไอคอนบนหน้าจอโฮม แอปจะทำงานในโหมดเต็มจอ (`standalone`) เหมือนแอปเนทีฟ

---

## 13. การติดตั้งบน Android Tablet และมือถือ Android

1. เปิดเบราว์เซอร์ **Google Chrome** บนมือถือ Android หรือ Android Tablet แล้วเข้าไปที่ URL ของแอป
2. แตะปุ่มเมนู **จุดสามจุด (⋮)** ที่มุมขวาบนของ Chrome (หรือแตะปุ่ม **ติดตั้งแอป** ที่แสดงในหน้าเว็บ)
3. เลือกเมนู **ติดตั้งแอป (Install app)** หรือ **เพิ่มลงในหน้าจอหลัก (Add to Home screen)**
4. กดยืนยัน **ติดตั้ง (Install)**
5. ไอคอน `SlipSense` จะปรากฏบนหน้าจอหลักและใน App Drawer พร้อมรองรับหน้าจอทั้งแนวตั้ง (มือถือ) และแนวนอน/2 คอลัมน์ (แท็บเล็ต)

---

## 14. วิธีทดสอบ Local-only Mode

โหมด **Local-only** เหมาะสำหรับผู้ที่ต้องการใช้งานบันทึกรายรับ-รายจ่ายในเครื่องอย่างเดียวโดยไม่ต้องเชื่อมต่อคลาวด์:

1. รันเซิร์ฟเวอร์พัฒนาในเครื่องด้วย System Node.js:
   ```powershell
   node scripts/dev_server.js
   ```
2. เปิดเบราว์เซอร์ไปที่ `http://127.0.0.1:8080`
3. ยังไม่ต้องตั้งค่า Supabase หรือเข้าสู่ระบบ (สังเกตป้ายสถานะด้านบนจะแสดงโหมดใช้งานในเครื่อง)
4. ไปที่ฟอร์มเพิ่มรายการ กรอกข้อมูลร้านค้า ยอดเงิน ประเภท หมวดหมู่ และวันที่ แล้วกด **ยืนยันบันทึกรายการ**
5. ตรวจสอบผลลัพธ์:
   - รายการจะถูกบันทึกลงใน `IndexedDB` (`slipsense_db`) ทันที
   - สถานะซิงก์ของรายการจะแสดงเป็น **`local_only` (เฉพาะในเครื่อง)**
   - ลองกด **รีเฟรชหน้าเว็บ (F5)** ข้อมูลทั้งหมดและยอดสรุปบน Dashboard จะยังคงอยู่ครบถ้วน
   - ลองกด **แก้ไข** และ **ลบ** รายการ ทุกอย่างจะทำงานผ่าน IndexedDB ทันที

---

## 15. วิธีทดสอบ Offline Mode

โหมด **Offline-First** ช่วยให้ผู้ใช้ที่ล็อกอินคลาวด์ไว้แล้วสามารถบันทึกและแก้ไขข้อมูลได้แม้ไม่มีสัญญาณอินเทอร์เน็ต:

1. เปิดแอปในเบราว์เซอร์ที่เข้าสู่ระบบ Supabase Cloud เรียบร้อยแล้ว
2. เปิด **Developer Tools (F12)** -> แท็บ **Network** -> เปลี่ยนสถานะจาก `No throttling` เป็น **`Offline`** (หรือปิด Wi-Fi / เปิดโหมดเครื่องบินบนมือถือ)
3. สังเกตแถบสถานะของแอปจะเปลี่ยนเป็น **ออฟไลน์ (Offline)**
4. ทดลองทำงานขณะออฟไลน์:
   - เพิ่มรายการรายจ่ายใหม่ หรือแก้ไขรายการเดิม แล้วกดบันทึก
   - รายการจะถูกบันทึกลง `IndexedDB` ทันที พร้อมสถานะ **`pending_sync` (รอซิงก์)**
   - สามารถเปิดดู Dashboard, ค้นหา, กรองหมวดหมู่ และสลับเดือนได้ตามปกติ
5. ทดลองกลับมาออนไลน์:
   - เปลี่ยนสถานะ Network กลับเป็น **`No throttling` (Online)**
   - ระบบ Auto-Sync จะตรวจพบสัญญาณอินเทอร์เน็ตและส่งรายการที่อยู่ในคิว `pending_sync` ขึ้นสู่ Supabase อัตโนมัติ (หรือกดปุ่ม **ซิงก์ข้อมูล** ด้วยตนเอง)
   - สถานะของรายการจะเปลี่ยนจาก `pending_sync` เป็น **`synced` (ซิงก์แล้ว)**

---

## 16. วิธี Export/Import Backup (JSON และ CSV)

เพื่อป้องกันข้อมูลสูญหายจากการล้างแคชของเบราว์เซอร์หรือการเปลี่ยนอุปกรณ์ SlipSense มีระบบสำรองและกู้คืนข้อมูลในแท็บ **ตั้งค่า / สำรองข้อมูล**:

### การส่งออกข้อมูล (Export)
- **Export JSON (แนะนำสำหรับการสำรองและกู้คืนเต็มรูปแบบ):**
  - ส่งออกข้อมูลธุรกรรมทั้งหมดพร้อม `client_id`, `updated_at`, `evidence_summary`, `confidence` และสถานะครบทุกฟิลด์
  - ใช้สำหรับนำเข้า (Import) กลับเข้าสู่ระบบได้โดยข้อมูลไม่ซ้ำซ้อน
- **Export CSV (สำหรับเปิดใน Excel / Google Sheets):**
  - ส่งออกเป็นไฟล์ `.csv` เข้ารหัส UTF-8 พร้อม BOM เพื่อให้โปรแกรม Microsoft Excel เปิดอ่านภาษาไทยได้ทันทีโดยไม่เกิดปัญหาตัวอักษรเพี้ยน

### การนำเข้าข้อมูล (Import JSON)
- เลือกไฟล์ `.json` ที่เคยสำรองไว้ ระบบจะตรวจสอบโครงสร้างข้อมูลและผสาน (Merge) รายการเข้ากับฐานข้อมูลในเครื่องโดยอ้างอิงจาก `client_id` และเวลา `updated_at` ล่าสุด
- หากรหัสผู้ใช้ล็อกอินคลาวด์อยู่ รายการที่นำเข้าจะถูกจัดคิวซิงก์ขึ้น Supabase ให้อัตโนมัติ

> **คำเตือนสำคัญด้านความเป็นส่วนตัว:**
> ไฟล์ Backup ทั้งแบบ `.json` และ `.csv` มีข้อมูลธุรกรรมทางการเงินส่วนบุคคล ชื่อร้านค้า และบันทึกช่วยจำของคุณในรูปแบบข้อความปกติ (Plaintext) **โปรดจัดเก็บไฟล์สำรองไว้ในที่ปลอดภัยส่วนตัว ห้ามส่งต่อในช่องทางสาธารณะ และห้ามอัปโหลดขึ้น Git Repository สาธารณะ**

---

## 17. วิธีแก้ปัญหาที่พบบ่อย (Troubleshooting)

| ปัญหาที่พบ | สาเหตุ | วิธีแก้ไข |
|---|---|---|
| **1. อัปโหลดรูปภาพ `.HEIC` จาก iPhone ไม่ได้** | เบราว์เซอร์บางรุ่นไม่รองรับการถอดรหัสไฟล์ HEIC ใน Canvas โดยตรง และ Gemini รองรับ `JPEG`, `PNG`, `WEBP` | ระบบจะแจ้งเตือนให้ทราบ ให้เปลี่ยนการตั้งค่ากล้อง iPhone ที่ **Settings -> Camera -> Formats -> Most Compatible (JPEG)** หรือถ่ายภาพผ่านปุ่มกล้องในเว็บโดยตรง หรือแคปหน้าจอสลิปเป็น PNG/JPEG |
| **2. แจ้งเตือน Session หมดอายุ (`401 Unauthorized`)** | JWT Token ของผู้ใช้หมดอายุหรือถูกยกเลิก | ไปที่ส่วนบัญชีผู้ใช้ กด **ออกจากระบบ** แล้ว **เข้าสู่ระบบใหม่** (ข้อมูลที่บันทึกค้างไว้ในเครื่อง `pending_sync` จะไม่หายและจะซิงก์ต่อทันทีที่ล็อกอินสำเร็จ) |
| **3. แจ้งเตือนเกินโควตา (`429 Too Many Requests`)** | เรียกสแกนใบเสร็จเกินลิมิตที่ตั้งไว้ (10 ครั้ง/นาที หรือ 100 ครั้ง/วัน ต่อผู้ใช้) หรือโควตา Gemini API เต็ม | รอสักครู่ (ประมาณ 1 นาที) แล้วลองใหม่อีกครั้ง หรือกรอกข้อมูลใบเสร็จด้วยตนเองผ่านฟอร์มตรวจสอบได้ทันทีโดยไม่ต้องรอ AI |
| **4. ติดปัญหา CORS เมื่อเรียก Edge Function** | ค่า `ALLOWED_ORIGIN` ใน Supabase Secrets ไม่ตรงกับโดเมนที่เปิดใช้งานจริง | ตรวจสอบคำสั่ง `npx supabase secrets set ALLOWED_ORIGIN="https://<username>.github.io"` ให้ตรงกับ Origin ของเว็บ (ไม่มี `/` ปิดท้าย) หรือตั้งเป็น `*` ในช่วงทดสอบ แล้ว Deploy ฟังก์ชันซ้ำ |
| **5. ข้อมูลชนกันเมื่อแก้ไขจากหลายเครื่องขณะออฟไลน์ (Offline Sync Conflict)** | แก้ไขรายการเดียวกันบน 2 อุปกรณ์ขณะออฟไลน์ทั้งคู่ | ระบบใช้กลไก **Idempotent Upsert ด้วย `(user_id, client_id)`** ร่วมกับ **Last-Write-Wins ตามเวลาของเซิร์ฟเวอร์ (`updated_at`)** และดึง Delta Sync กลับมาอัปเดตให้ตรงกัน หากรายการใดซิงก์ไม่สำเร็จ (`sync_failed`) สามารถกดปุ่ม **ลองซิงก์ใหม่** หรือกดบันทึกซ้ำจากหน้าแก้ไขได้ |

---

## 18. ข้อจำกัดที่ยังมีอยู่ (Known Limitations)

เพื่อให้ผู้ใช้งานเข้าใจขอบเขตการทำงานของระบบอย่างชัดเจน จึงแยกความสามารถตามสถานะการเชื่อมต่อดังนี้:

### ฟังก์ชันที่ทำงานแบบออฟไลน์ในเครื่องได้ 100% (ไม่ต้องใช้อินเทอร์เน็ต)
- การเพิ่ม แก้ไข และลบรายการรายรับ-รายจ่ายด้วยตนเอง
- การคำนวณยอดสรุปรายรับ รายจ่าย คงเหลือ และกราฟสัดส่วนหมวดหมู่บน Dashboard
- การค้นหา กรองตามหมวดหมู่ กรองตามประเภท และดูประวัติย้อนหลังรายเดือน
- การเข้าคิวรอซิงก์ (`pending_sync`) ใน `IndexedDB` (`slipsense_db`)
- การส่งออก (Export) และนำเข้า (Import) ไฟล์สำรองข้อมูล JSON / CSV

### ฟังก์ชันที่จำเป็นต้องใช้อินเทอร์เน็ต (Online Only)
- **การวิเคราะห์รูปใบเสร็จและสลิปด้วย Gemini AI:** เนื่องจากต้องส่งภาพที่บีบอัดแล้วไปยัง Supabase Edge Function (`analyze-receipt`) เพื่อประมวลผลด้วยโมเดล Gemini บนคลาวด์
- **การยืนยันตัวตน (Login / Sign Up / Magic Link) และการซิงก์ข้อมูลข้ามอุปกรณ์กับ Supabase Cloud**

### ข้อจำกัดเฉพาะแพลตฟอร์ม (iOS Safari & Browser Storage)
- **iOS Storage Eviction:** บน iOS/iPadOS หากเปิดเว็บในแท็บ Safari ปกติโดยไม่ได้กด **Add to Home Screen** และไม่ได้เข้าใช้งานเกิน 7 วัน ระบบปฏิบัติการ iOS อาจล้างข้อมูล IndexedDB อัตโนมัติ ดังนั้น **แนะนำให้ติดตั้งลงหน้าจอโฮม (Add to Home Screen) หรือเชื่อมต่อบัญชี Supabase Cloud และหมั่น Export JSON Backup เสมอ**
- **Background Sync API:** เบราว์เซอร์ Safari บน iOS ยังไม่รองรับ Web Background Sync API ขณะปิดแอป ดังนั้นระบบจะทำการซิงก์ข้อมูลอัตโนมัติทันทีที่ผู้ใช้เปิดแอปขึ้นมาใหม่หรือเมื่อสัญญาณอินเทอร์เน็ตกลับมาขณะเปิดหน้าแอปอยู่
- **ไม่มีการเก็บรูปภาพต้นฉบับบนคลาวด์:** เพื่อประหยัดพื้นที่จัดเก็บและรักษาความเป็นส่วนตัว ระบบจะส่งภาพให้ AI สกัดเป็นข้อมูลโครงสร้างและข้อความสรุปหลักฐาน (`evidence_summary`) เท่านั้น ไม่ได้อัปโหลดไฟล์รูปภาพเก็บไว้ใน Supabase Storage

---

## 19. ขั้นตอนเปลี่ยน Gemini Model ในอนาคต

เมื่อ Google เปิดตัวโมเดล Gemini รุ่นใหม่ในอนาคต คุณสามารถอัปเกรดโมเดลได้ทันที **โดยไม่ต้องแก้ไขโค้ด Frontend (`index.html`) แม้แต่บรรทัดเดียว**:

1. ตั้งค่า Secret `GEMINI_MODEL` ใหม่ผ่าน Supabase CLI:
   ```powershell
   npx supabase secrets set GEMINI_MODEL="gemini-2.5-pro"
   ```
   *(หรือเปลี่ยนเป็นรหัสโมเดลรุ่นใหม่ที่รองรับ `generateContent` และ `responseSchema`)*
2. หากต้องการให้มีผลทันที สามารถสั่ง Deploy Edge Function ซ้ำ 1 ครั้ง:
   ```powershell
   npx supabase functions deploy analyze-receipt
   ```
3. ทดสอบสแกนใบเสร็จในแอป หน้า Verification Form จะแสดงผลลัพธ์จากโมเดลใหม่พร้อมบันทึกรหัสโมเดลลงในตาราง `public.ai_usage_logs` โดยอัตโนมัติ

---

## 20. Security Checklist ก่อนเปิดใช้งานจริง

ก่อนนำระบบขึ้นใช้งานจริงหรือเผยแพร่ Repository สู่สาธารณะ โปรดตรวจสอบรายการต่อไปนี้ให้ครบทุกข้อ:

- [x] **ไม่มี API Key ลับในโค้ด Frontend และเอกสาร:** ตรวจสอบแล้วว่าไม่มี `GEMINI_API_KEY` (`AIza...`) หรือ Supabase `service_role` key ใน `index.html`, `sw.js`, `manifest.json`, `README.md` หรือไฟล์ใดๆ ใน Git Repository
- [x] **เรียก Gemini ผ่าน Edge Function เท่านั้น:** Frontend เรียกใช้งานเฉพาะ `/functions/v1/analyze-receipt` พร้อมแนบ `Authorization: Bearer <user_jwt>`
- [x] **เปิดใช้งาน RLS ครบทุกตาราง:** ทั้ง `public.transactions` และ `public.ai_usage_logs` เปิด Row Level Security และมี Policy ตรวจสอบ `auth.uid() = user_id` ครบทุก Action
- [x] **มีระบบ Rate Limit ฝั่ง Server:** Edge Function ตรวจสอบจำนวนการเรียกใช้งานจาก `public.ai_usage_logs` ไม่เกิน 10 ครั้ง/นาที และ 100 ครั้ง/วัน ต่อผู้ใช้
- [x] **บังคับผ่านฟอร์มตรวจสอบ (Human-in-the-Loop Verification Form):** ข้อมูลที่สกัดจาก AI จะไม่ถูกบันทึกลงฐานข้อมูลอัตโนมัติโดยไม่ผ่านสายตาผู้ใช้ และห้าม AI เดาวันที่หรือยอดเงินที่อ่านไม่ชัด (`null` + แจ้งเตือนใน `warnings`)
- [x] **ป้องกัน XSS และการเข้าถึงไฟล์นอกขอบเขต:** หน้าเว็บเข้ารหัส HTML Output (Escape HTML) ทุกจุด และ `scripts/dev_server.js` ป้องกัน Path Traversal นอกโฟลเดอร์โปรเจกต์
- [x] **ปกป้อง Source Code และทรัพย์สินทางปัญญา (Section 17):** แยกโค้ดต้นฉบับ TypeScript (`src/app.ts`, `src/sw.ts`) ออกจากไฟล์เผยแพร่จริงใน `dist/` ซึ่งผ่านการลบ Comment, ย่อขนาด (Minify) และเปลี่ยนชื่อตัวแปรภายใน (Identifier Mangling) โดยไม่มีไฟล์ Source Map (`*.map`)

---

## 21. การปกป้องทรัพย์สินทางปัญญาและ Source Code (Section 17 IP Protection & Production Build)

ระบบ **SlipSense** ออกแบบสถาปัตยกรรมการปกป้อง Source Code และทรัพย์สินทางปัญญาแบบหลายชั้น (Defense-in-Depth) ตามรายละเอียดใน [`docs/IP_AND_SECURITY_ARCHITECTURE.md`](./docs/IP_AND_SECURITY_ARCHITECTURE.md):

1. **การแยกโค้ดต้นฉบับ TypeScript (`src/`) และไฟล์สำหรับเผยแพร่ (`dist/`):**
   - โค้ดต้นฉบับสำหรับนักพัฒนาเขียนด้วย TypeScript อยู่ใน `src/app.ts`, `src/sw.ts` และ `src/index.template.html` (เก็บไว้ใน Private Repository เท่านั้น)
   - คำสั่ง Build สำหรับ Production:
     ```powershell
     npm run build
     # หรือ node scripts/build_prod.js
     ```
   - สคริปต์ `scripts/build_prod.js` จะแปลง TypeScript เป็น JavaScript, ลบ Comment ทั้งหมด, ย่อขนาด CSS/JS, เปลี่ยนชื่อตัวแปรและฟังก์ชันภายใน (Identifier Mangling 44 รายการ เช่น `_0x1a0`–`_0x1cb`), ปิดการสร้าง Source Maps (`*.map`), และสร้างชุดไฟล์พร้อมใช้งานในโฟลเดอร์ `dist/`
2. **การเก็บ Business Logic และ AI Prompt ไว้ฝั่ง Server เท่านั้น:**
   - คำสั่ง System Prompt ภายใน, โครงสร้าง `responseSchema`, อัลกอริทึมแปลงปี พ.ศ. เป็น ค.ศ., กฎการวิเคราะห์วัตถุประสงค์ (`purpose_analysis`) และการจำกัดอัตราการเรียกใช้งานแบบ Atomic (`public.consume_ai_rate_limit`) ทำงานอยู่บน Supabase Edge Function (`supabase/functions/analyze-receipt/index.ts`) และ PostgreSQL เท่านั้น ไม่ถูกส่งมายังเบราว์เซอร์
3. **การเผยแพร่เฉพาะโฟลเดอร์ `dist/` ขึ้น GitHub Pages:**
   - ไฟล์ `.github/workflows/deploy-pages.yml` กำหนดให้ GitHub Actions รัน `node scripts/build_prod.js`, รันชุดทดสอบ `node scripts/run_tests.js`, ตรวจสอบว่าไม่มีไฟล์ `.ts`, `.map`, `.sql`, `.env` ปะปน แล้วอัปโหลดเฉพาะโฟลเดอร์ `./dist` ขึ้น GitHub Pages เท่านั้น
4. **ข้อจำกัดตามความเป็นจริงของสถาปัตยกรรม Web/PWA:**
   - การทำ Minification และ Obfuscation สำหรับโค้ดที่รันบนเบราว์เซอร์ช่วยเพิ่มความยากในการอ่านและคัดลอกโครงสร้างโค้ดโดยตรง แต่**ไม่สามารถป้องกันการทำ Reverse Engineering ได้ 100%** ดังนั้นระบบจึงบังคับใช้การยืนยันตัวตนด้วย JWT, Row Level Security (`ENABLE` + `FORCE RLS`) และการเก็บ API Key/Business Logic สำคัญไว้ฝั่ง Server เสมอ

## 22. ระบบ 6 กระปุกและหน้าแอป (TASK-SLIPSENSE-V4-008)

เงินเก็บประกันแดนแยกเป็นกระปุกที่ 6 `dan_insurance` โดยคงหมายเลขกระปุกเดิมทุกข้อ เงินเดือน 45,000 บาทแบ่งดังนี้ (คำนวณด้วยจำนวนเต็มหน่วยสตางค์):

| กระปุก | รอบประกันพ่อ 1,300 | รอบประกันพ่อ 2,600 |
| --- | ---: | ---: |
| 1 ลงทุนหุ้น | 6,500 | 6,500 |
| 2 สร้างบ้าน | 13,000 | 13,000 |
| 3 ค่าใช้จ่ายคงที่ | 9,800 | 11,100 |
| 4 ฉุกเฉินส่วนตัว | 0 | 0 |
| 5 ใช้จ่ายทั่วไป | 12,800 | 11,500 |
| 6 สะสมประกันแดน | 2,900 | 2,900 |
| รวม | 45,000 | 45,000 |

การกันเงิน 2,900 บาทเป็นการสะสมจากเงินเดือน ไม่ใช่รายจ่ายหรือหลักฐานว่าจ่ายเบี้ยแล้ว เป้าหมายรายปี 34,800 บาท ยอดพร้อมใช้สะสมรายรับลบรายจ่ายถึงสิ้นเดือนที่เลือกและไม่ถูกล้างเมื่อเปลี่ยนปี เกจจำกัดภาพที่ 0–100% แต่ข้อความแสดงยอดเงินจริงแม้เกินเป้า และแสดงยอดเติมสะสมกับเบี้ยที่จ่ายจริงในปีที่เลือกแยกกัน

เมื่อต้องจ่ายเบี้ยจริง ให้เปิดแท็บกระปุก กด “บันทึกเบี้ยประกันแดนที่จ่ายจริง” ระบุวันที่และยอดตามใบเสร็จ ตรวจฟอร์มแล้วจึงยืนยัน ระบบตรวจ marker รายการเดิมและป้องกันจ่ายซ้ำในเดือนเดียวกัน ประกันแดนไม่อยู่ใน checklist หรือกลุ่มจ่ายค่าใช้จ่ายคงที่แล้ว การโอนเงินเหลือใช้สิ้นเดือนใช้เฉพาะกระปุก 3 และ 5 ไปกระปุก 4 โดยบันทึกทุกขาใน IndexedDB transaction เดียว และป้องกันบันทึกซ้ำข้ามแท็บ กระปุก 6 ยังคงสะสมต่อ

เมนูด้านล่างมี 4 แท็บ: หน้าหลัก/สแกน, กระปุก 6 ส่วน, กราฟ, ประวัติ หน้า Home ใช้ Hero สำหรับเลือกภาพและกริดทางลัด 2 คอลัมน์ เมนูรองรับปุ่มลูกศรซ้าย/ขวา, Home, End และ focus ที่มองเห็นได้ แบบร่างกับตัวกรองยังอยู่เมื่อสลับแท็บ แบบฟอร์มเงินเดือนเปิดใน modal และเครื่องมือยาวอยู่ในหน้ากระปุก

แท็บกราฟเลือกเดือนสุดท้ายของช่วงย้อนหลัง 6 เดือน เดือนว่างแสดงศูนย์ กราฟแท่งเทียบรายรับ/รายจ่ายและ donut หมวดรายจ่ายเดือนที่เลือกมีตาราง/คำอธิบายสำหรับโปรแกรมอ่านหน้าจอ ไม่นับคู่โอนภายในหรือคู่ปรับกระปุกเป็นรายรับรายจ่ายใหม่ เงินเดือนนับผลรวมรายการจัดสรรเพียงครั้งเดียว ไม่บวกยอดเงินเดือนซ้ำอีกชั้น วันที่ timestamp แปลงตามปฏิทินกรุงเทพ กรองรายการลบ ID ซ้ำ วันที่/ยอดผิด และบัญชีอื่น กราฟใช้ข้อมูลในเครื่องและทำงาน offline หลังโหลดแอปแล้ว

### บันทึกรายการแบบกระชับและเติมจากประวัติ

เมื่อกดเพิ่มรายการด้วยตนเอง กรอกเพียง **ยอดเงิน** และ **ร้านค้า / รายการ** เช่น “กาแฟ” หรือ “ค่าไฟ” วันที่เริ่มต้นเป็นวันปัจจุบันตามกรุงเทพฯ ประเภทเป็นรายจ่าย และใช้สกุลเงินจากการตั้งค่า ตรวจสอบหมวดหมู่กับกระปุกเงินที่แสดงอยู่ก่อนกดยืนยัน สามารถเลือกแก้ทั้งสองช่องได้เสมอ

เลือกชื่อจากรายการแนะนำใต้ช่องร้านค้า / รายการ หรือพิมพ์ชื่อเดิมให้ครบ ระบบจะเติมหมวดหมู่และกระปุกเงินจากธุรกรรมล่าสุดที่บันทึกของบัญชีปัจจุบัน โดยใช้เวลาสร้างรายการ ไม่ใช่วันที่บนใบเสร็จ ไม่จับคู่ชื่อบางส่วน ชื่อใหม่ยังพิมพ์ได้ตามปกติ ระบบรักษาค่าที่คุณเลือกแก้เองและไม่จำแบบร่างที่ยกเลิก ทางลัดรายการเดิมยังเปิดฟอร์มให้ตรวจสอบก่อนบันทึก

กด **+ รายละเอียดเพิ่มเติม** เพื่อเปิดช่องสรุปรายการสินค้า/บริการและวัตถุประสงค์ ทั้งสองช่องไม่บังคับและปิดทุกครั้งที่เปิดฟอร์มใหม่ ข้อมูลที่มีอยู่ยังคงอยู่แม้ยุบส่วนนี้ หากเว้นว่างในรายการที่กรอกเอง ระบบใช้ชื่อร้านค้า / รายการเป็นสรุป และใช้ข้อความ “ไม่ได้ระบุวัตถุประสงค์เพิ่มเติม” ส่วนวันที่ ประเภท สกุลเงิน แหล่งข้อมูล และหมายเหตุยังตรวจสอบหรือแก้ไขได้

**ผล AI ต้องตรวจสอบก่อนยืนยันเสมอ** คำเตือนและช่องสำคัญที่อ่านไม่ชัดยังแสดงอยู่ ระบบไม่เติมวันที่หรือยอดเงินที่ AI อ่านไม่ได้ให้เอง และรักษาหมวดหมู่ กระปุกเงิน รวมถึงรายละเอียดจาก AI หรือรายการที่เปิดแก้ไข การเปลี่ยนชื่อร้านค้า / รายการเป็นชื่ออื่นจึงเริ่มใช้คำแนะนำจากประวัติสำหรับชื่อนั้นได้

### อัปเกรด schema และข้อมูลเดิม

ก่อนซิงก์รุ่นนี้ ให้ผู้ดูแลสำรองข้อมูลและรัน `supabase.sql` ในฐานทดสอบก่อน แล้วจึงอัปเกรดฐานที่ใช้งานจริงตามขั้นตอน release: SQL ใช้ transaction และแทนที่ CHECK เดิมที่จำกัด 5 กระปุกให้รับ 6 ค่า รันซ้ำได้โดยคง RLS, เจ้าของข้อมูล และ index การพัฒนางานนี้ไม่ได้รัน SQL กับฐานจริง

แม่แบบเก่าที่ระบุ `version: 1` และมีสูตรมาตรฐานพร้อมยอดรวมถูกต้องจะแยก 2,900 จากค่าใช้จ่ายคงที่เป็นประกันแดนโดยรักษายอดรวม แม่แบบไม่ระบุรุ่นหรือปรับเองแสดงคำเตือนให้ตรวจตัวเลขเองก่อนยืนยันบันทึก เงินเดือนไม่พอ ยอดติดลบ/ไม่จำกัด หรือยอดแบ่งรวมไม่เท่าเงินเดือนจะบันทึกไม่ได้

ข้อมูลประวัติไม่ถูกเดาจากข้อความอิสระ: เปิดหน้ากระปุก เลือกเดือนและตรวจสถานะข้อมูลเก่า จากนั้นตรวจประวัติก่อนกดยืนยันแยกยอด ระบบย้ายเฉพาะรายการที่มี `SALARY_SPLIT` สูตรเดิมหรือ `fixed_item:dan_insurance` ชัดเจน โดยสร้างคู่ปรับกระปุกที่ยอดรวมสุทธิคงเดิม เก็บรายการต้นฉบับและ marker สำหรับตรวจย้อนหลัง ทำซ้ำแล้วไม่ย้ายซ้ำ เดือนที่มีรายการคลุมเครือหรือเคย rollover จะไม่ปรับให้อัตโนมัติ และกัน rollover เดือนนั้นจนตรวจเสร็จ หากยังไม่ผ่าน ให้สำรองข้อมูล ตรวจหลักฐาน และแก้รายการผ่านประวัติโดยยืนยันยอดกระปุกกับยอดรวม ไม่ควรลบ marker เพื่อฝืนข้ามการตรวจสอบ

### การทดสอบและข้อจำกัด

ใช้ `node scripts/run_tests.js` (System Node.js 24.16.0) ชุด Section 17 เรียก `main` ของ builder เดิมผ่าน VM และ filesystem adapter อ่าน source จริง แต่ mkdir/write/copy/remove ของ build อยู่ในหน่วยความจำทั้งหมด ตรวจ source hash, artifact hash, minify/mangle, secret/source map และพฤติกรรมทั้ง source/หลัง build โดยไม่เขียน `dist`, `index.html` หรือ `sw.js` ที่ราก Operation ที่ไม่รองรับหรือ build ล้มเหลวทำให้ suite ล้มเหลว ไม่มีการใช้ artifact เก่าสวมผล

งานนี้ยังไม่สร้างไฟล์เผยแพร่จริงและไม่ merge/release ผล self-test และผลตรวจ Edge mobile ระบุใน STATUS.md รอ Antigravity ตรวจที่ Gate 12 ไม่มีภาพอ้างอิงแนบ จึงออกแบบตามข้อกำหนดและยังเทียบภาพไม่ได้ Safe-area ตรวจ CSS และ desktop emulation เท่านั้น ยังต้องตรวจอุปกรณ์ iOS/Android ที่มีรอยบากและโปรแกรมอ่านหน้าจอจริง
