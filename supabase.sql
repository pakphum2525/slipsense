-- ============================================================================
-- SlipSense (Smart Receipt Expense Tracker) — Supabase Database Schema & RLS
-- ไฟล์: supabase.sql
-- วิธีใช้: คัดลอกโค้ดทั้งหมดในไฟล์นี้ไปวางและกด Run ใน Supabase SQL Editor
-- คุณสมบัติ: ออกแบบให้รันซ้ำได้ (Idempotent) โดยไม่ทำลายข้อมูลที่มีอยู่แล้ว
-- ============================================================================

BEGIN;

-- 1. เปิดใช้งาน Extension สำหรับสร้าง UUID (มีเป็นค่าเริ่มต้นใน Supabase)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 2. ตารางหลัก: public.transactions (เก็บข้อมูลรายรับและรายจ่ายของผู้ใช้)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  merchant TEXT NOT NULL CHECK (char_length(btrim(merchant)) >= 1 AND char_length(merchant) <= 255),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0 AND amount <= 9999999999.99),
  currency VARCHAR(3) NOT NULL DEFAULT 'THB' CHECK (currency ~ '^[A-Z]{3}$'),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL CHECK (char_length(btrim(category)) >= 1 AND char_length(category) <= 100),
  fund_bucket TEXT NOT NULL DEFAULT 'general_expense' CHECK (fund_bucket IN ('investment_stock', 'home_building', 'fixed_expense', 'emergency_personal', 'general_expense', 'dan_insurance')),
  items_summary TEXT NOT NULL DEFAULT '' CHECK (char_length(items_summary) <= 2000),
  purpose_analysis TEXT NOT NULL DEFAULT '' CHECK (char_length(purpose_analysis) <= 2000),
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('receipt', 'transfer_slip', 'manual')),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- รองรับการอัปเกรดตารางที่มีอยู่เดิมแบบ Idempotent (เพิ่มคอลัมน์ fund_bucket สำหรับกระปุกเงินเดือน 6 ส่วน)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS fund_bucket TEXT NOT NULL DEFAULT 'general_expense'
  CHECK (fund_bucket IN ('investment_stock', 'home_building', 'fixed_expense', 'emergency_personal', 'general_expense', 'dan_insurance'));

-- แทนที่ CHECK กระปุกเดิมภายใต้ transaction
DO $$
DECLARE bucket_constraint RECORD;
BEGIN
  FOR bucket_constraint IN
    SELECT c.conname FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'public.transactions'::regclass AND c.contype = 'c' AND a.attname = 'fund_bucket'
      AND c.conkey = ARRAY[a.attnum]::smallint[]
      AND pg_get_constraintdef(c.oid) LIKE '%investment_stock%'
      AND pg_get_constraintdef(c.oid) LIKE '%general_expense%'
  LOOP
    EXECUTE format('ALTER TABLE public.transactions DROP CONSTRAINT %I', bucket_constraint.conname);
  END LOOP;
  ALTER TABLE public.transactions ADD CONSTRAINT transactions_fund_bucket_check
    CHECK (fund_bucket IN ('investment_stock', 'home_building', 'fixed_expense', 'emergency_personal', 'general_expense', 'dan_insurance'));
END $$;

COMMENT ON TABLE public.transactions IS 'ตารางธุรกรรมรายรับ-รายจ่ายของผู้ใช้แต่ละบัญชีในระบบ SlipSense';
COMMENT ON COLUMN public.transactions.id IS 'UUID ประจำรายการ (สร้างจากฝั่ง Client เพื่อรองรับ Idempotent Upsert เมื่อซิงก์ซ้ำ)';
COMMENT ON COLUMN public.transactions.user_id IS 'รหัสผู้ใช้เจ้าของข้อมูล อ้างอิง auth.users(id)';
COMMENT ON COLUMN public.transactions.transaction_date IS 'วันที่เกิดรายการตามเขตเวลาประเทศไทย (YYYY-MM-DD)';
COMMENT ON COLUMN public.transactions.amount IS 'จำนวนเงินเป็นค่าบวกเสมอ (ใช้คอลัมน์ type แยกรายรับ/รายจ่าย)';
COMMENT ON COLUMN public.transactions.fund_bucket IS 'กระปุกเงินเดือน 6 ส่วน (investment_stock, home_building, fixed_expense, emergency_personal, general_expense, dan_insurance)';
COMMENT ON COLUMN public.transactions.purpose_analysis IS 'ผลการวิเคราะห์วัตถุประสงค์ของการซื้อจาก AI ที่ผู้ใช้ตรวจสอบแล้ว';

-- ============================================================================
-- 3. ตารางบันทึกการเรียกใช้งาน AI: public.ai_usage_logs (สำหรับควบคุม Rate Limit และค่าใช้จ่าย)
-- หมายเหตุ: เก็บเฉพาะเวลา สถานะ และชื่อโมเดล ห้ามเก็บภาพใบเสร็จหรือข้อมูลการเงินส่วนบุคคล
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model_used TEXT NOT NULL DEFAULT 'gemini-2.5-flash' CHECK (char_length(model_used) <= 100),
  status_code INTEGER NOT NULL CHECK (status_code >= 100 AND status_code <= 599),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.ai_usage_logs IS 'บันทึกจำนวนครั้งการเรียกใช้ AI วิเคราะห์ใบเสร็จต่อผู้ใช้ เพื่อจำกัด Rate Limit และควบคุมค่าใช้จ่าย';

-- ============================================================================
-- 4. Indexes สำหรับเพิ่มประสิทธิภาพการค้นหาและกรองข้อมูล
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON public.transactions (user_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date
  ON public.transactions (user_id, type, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_category
  ON public.transactions (user_id, category);

CREATE INDEX IF NOT EXISTS idx_transactions_user_fund_bucket
  ON public.transactions (user_id, fund_bucket, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_updated
  ON public.transactions (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_created
  ON public.ai_usage_logs (user_id, created_at DESC);

-- ============================================================================
-- 5. Functions & Triggers สำหรับอัปเดต updated_at และป้องกันการเปลี่ยนเจ้าของรายการ
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_transactions_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ห้ามเปลี่ยนเจ้าของข้อมูล (user_id) ไม่ว่ากรณีใด
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'ไม่อนุญาตให้เปลี่ยนเจ้าของรายการ (user_id is immutable)';
  END IF;

  -- รักษาเวลาสร้างเดิมเสมอ
  NEW.created_at := OLD.created_at;

  -- อัปเดตเวลาแก้ไขล่าสุดเป็น UTC เสมอ
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transactions_before_update ON public.transactions;
CREATE TRIGGER trg_transactions_before_update
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_transactions_before_update();

-- ฟังก์ชันจองโควตาการเรียกใช้ AI แบบ Atomic (ป้องกัน Race Condition เมื่อเรียกพร้อมกันหลายคำขอ)
CREATE OR REPLACE FUNCTION public.consume_ai_rate_limit(
  p_limit INTEGER DEFAULT 20,
  p_model TEXT DEFAULT 'gemini-2.5-flash'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_used_count INTEGER;
  v_log_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: ต้องเข้าสู่ระบบก่อนใช้งาน AI';
  END IF;

  -- ล็อกระดับ Transaction ต่อผู้ใช้หนึ่งคนเพื่อป้องกันการอ่านจำนวนโควตาพร้อมกัน (Atomic Quota Lock)
  PERFORM pg_advisory_xact_lock(hashtext('ai_quota_' || v_user_id::text));

  SELECT COUNT(*)::INTEGER
  INTO v_used_count
  FROM public.ai_usage_logs
  WHERE user_id = v_user_id
    AND created_at >= (timezone('utc', now()) - interval '1 hour');

  IF v_used_count >= GREATEST(1, p_limit) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used_count', v_used_count,
      'limit', GREATEST(1, p_limit)
    );
  END IF;

  INSERT INTO public.ai_usage_logs (user_id, model_used, status_code)
  VALUES (v_user_id, COALESCE(NULLIF(btrim(p_model), ''), 'gemini-2.5-flash'), 200)
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'used_count', v_used_count + 1,
    'limit', GREATEST(1, p_limit),
    'log_id', v_log_id
  );
END;
$$;

-- ============================================================================
-- 6. Row Level Security (RLS) & Policies
-- ============================================================================
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs FORCE ROW LEVEL SECURITY;

-- ลบ Policy เดิมก่อนสร้างใหม่เพื่อให้รันซ้ำได้ปลอดภัย
DROP POLICY IF EXISTS "transactions_select_own" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert_own" ON public.transactions;
DROP POLICY IF EXISTS "transactions_update_own" ON public.transactions;
DROP POLICY IF EXISTS "transactions_delete_own" ON public.transactions;

-- Policy 1: อ่านได้เฉพาะรายการของตนเอง
CREATE POLICY "transactions_select_own"
  ON public.transactions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy 2: เพิ่มได้เฉพาะรายการที่ระบุ user_id เป็นตนเอง
CREATE POLICY "transactions_insert_own"
  ON public.transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy 3: แก้ไขได้เฉพาะรายการของตนเอง และหลังแก้ไขต้องยังเป็นของตนเอง
CREATE POLICY "transactions_update_own"
  ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy 4: ลบได้เฉพาะรายการของตนเอง
CREATE POLICY "transactions_delete_own"
  ON public.transactions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policies สำหรับ public.ai_usage_logs (อนุญาตให้ผู้ใช้อ่านและบันทึกสถิติของตนเองผ่าน JWT ใน Edge Function แต่ห้ามลบหรือแก้ไขเพื่อล้างโควตา)
DROP POLICY IF EXISTS "ai_usage_logs_select_own" ON public.ai_usage_logs;
DROP POLICY IF EXISTS "ai_usage_logs_insert_own" ON public.ai_usage_logs;

CREATE POLICY "ai_usage_logs_select_own"
  ON public.ai_usage_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "ai_usage_logs_insert_own"
  ON public.ai_usage_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 7. การจำกัดสิทธิ์ระดับตาราง (Table Grants)
-- ปิดสิทธิ์ของ anon และ public ทั้งหมด อนุญาตเฉพาะผู้ใช้ที่ยืนยันตัวตนแล้ว (authenticated)
-- ============================================================================
REVOKE ALL ON TABLE public.transactions FROM PUBLIC;
REVOKE ALL ON TABLE public.transactions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transactions TO authenticated;
GRANT ALL ON TABLE public.transactions TO service_role;

REVOKE ALL ON TABLE public.ai_usage_logs FROM PUBLIC;
REVOKE ALL ON TABLE public.ai_usage_logs FROM anon;
GRANT SELECT, INSERT ON TABLE public.ai_usage_logs TO authenticated;
GRANT ALL ON TABLE public.ai_usage_logs TO service_role;

REVOKE ALL ON FUNCTION public.consume_ai_rate_limit(INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_ai_rate_limit(INTEGER, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_rate_limit(INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_rate_limit(INTEGER, TEXT) TO service_role;

-- ============================================================================
-- 8. ตั้งค่า Supabase Realtime สำหรับซิงก์ข้อมูลข้ามอุปกรณ์แบบทันที
-- ============================================================================
ALTER TABLE public.transactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'transactions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
    END IF;
  END IF;
END
$$;

COMMIT;
