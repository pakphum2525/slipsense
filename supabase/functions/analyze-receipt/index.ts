/**
 * supabase/functions/analyze-receipt/index.ts
 * Supabase Edge Function สำหรับวิเคราะห์ภาพใบเสร็จและสลิปโอนเงินด้วย Google Gemini API
 *
 * มาตรการความปลอดภัย:
 * 1. เก็บ GEMINI_API_KEY และ GEMINI_MODEL ไว้ใน Supabase Edge Function Secrets เท่านั้น ห้ามส่งกลับ Client
 * 2. ตรวจสอบ JWT ของผู้ใช้ผ่าน Supabase Auth ทุกครั้ง ปฏิเสธผู้ใช้ที่ไม่ได้เข้าสู่ระบบ (401)
 * 3. จำกัดขนาดภาพ ชนิดไฟล์ (JPEG/PNG/WebP) และจำกัดจำนวนครั้งการเรียกใช้งานต่อผู้ใช้ (Rate Limit)
 * 4. ไม่บันทึกภาพ Base64 หรือข้อมูลการเงินส่วนบุคคลลง Console Log
 * 5. ตรวจสอบและกรองผลลัพธ์ JSON ตาม Schema ซ้ำก่อนส่งกลับ Frontend
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const MAX_BODY_CHARS = 5_500_000; // ~4 MB Base64 payload
const MAX_IMAGE_BYTES = 3_800_000; // ~3.8 MB binary image size
const GEMINI_TIMEOUT_MS = 25_000;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const ALLOWED_TYPES = new Set(['expense', 'income', 'unknown']);
const ALLOWED_SOURCE_TYPES = new Set(['receipt', 'transfer_slip', 'unknown']);
const ALLOWED_CATEGORIES = new Set([
  'food_drink',
  'groceries',
  'transport',
  'utilities_bills',
  'shopping_general',
  'home_repair',
  'health_medical',
  'education_work',
  'entertainment',
  'transfer_other',
  'salary_income',
  'business_income',
  'refund_other_income',
  'unknown'
]);

// In-memory sliding window สำรองกรณีตาราง ai_usage_logs ยังไม่ได้รันหรือใช้ร่วมกันใน Instance เดียว
const memoryRateWindow = new Map<string, number[]>();

function buildCorsHeaders(reqOrigin: string | null): Record<string, string> {
  const configuredOrigins = (Deno.env.get('ALLOWED_ORIGIN') || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let allowOrigin = '*';
  if (!configuredOrigins.includes('*')) {
    if (reqOrigin && configuredOrigins.includes(reqOrigin)) {
      allowOrigin = reqOrigin;
    } else if (configuredOrigins.length > 0) {
      allowOrigin = configuredOrigins[0];
    }
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private'
    }
  });
}

/**
 * แปลงและตรวจสอบวันที่ให้อยู่ในรูปแบบ YYYY-MM-DD (ค.ศ.)
 * หาก AI ส่งปี พ.ศ. (เช่น 2568, 2569) มา จะแปลงเป็น ค.ศ. อัตโนมัติ
 */
function normalizeIsoDate(rawDate: unknown): { date: string | null; convertedFromBE: boolean } {
  if (typeof rawDate !== 'string') return { date: null, convertedFromBE: false };
  const trimmed = rawDate.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return { date: null, convertedFromBE: false };

  let year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  let convertedFromBE = false;

  if (year >= 2480 && year <= 2650) {
    year -= 543;
    convertedFromBE = true;
  }

  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return { date: null, convertedFromBE: false };
  }

  const normalized = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const dt = new Date(`${normalized}T00:00:00Z`);
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() + 1 !== month ||
    dt.getUTCDate() !== day
  ) {
    return { date: null, convertedFromBE: false };
  }

  return { date: normalized, convertedFromBE };
}

/**
 * ตรวจสอบและทำความสะอาดข้อมูลที่ได้จาก Gemini ให้ตรงตามสัญญาข้อมูล (Data Contract)
 */
function normalizeAndValidateAiResult(raw: Record<string, unknown>) {
  const warnings: string[] = Array.isArray(raw.warnings)
    ? raw.warnings.filter((w): w is string => typeof w === 'string' && w.trim().length > 0).map((w) => w.trim().slice(0, 300))
    : [];

  const uncertainSet = new Set<string>(
    Array.isArray(raw.uncertain_fields)
      ? raw.uncertain_fields.filter((f): f is string => typeof f === 'string').map((f) => f.trim())
      : []
  );

  // 1. วันที่ทำรายการ (ห้ามเดาเป็นวันปัจจุบันหากไม่พบในภาพ)
  const { date, convertedFromBE } = normalizeIsoDate(raw.date);
  if (convertedFromBE) {
    warnings.push('แปลงปี พ.ศ. ในใบเสร็จเป็นปี ค.ศ. อัตโนมัติ กรุณาตรวจสอบวันที่อีกครั้ง');
  }
  if (!date) {
    uncertainSet.add('date');
    if (!warnings.some((w) => w.includes('วันที่'))) {
      warnings.push('ไม่พบวันที่ทำรายการที่ชัดเจนในภาพ กรุณาระบุวันที่ก่อนบันทึก');
    }
  }

  // 2. ร้านค้าหรือคู่รายการ
  let merchant: string | null = null;
  if (typeof raw.merchant === 'string' && raw.merchant.trim().length > 0) {
    merchant = raw.merchant.trim().slice(0, 200);
  } else {
    uncertainSet.add('merchant');
    if (!warnings.some((w) => w.includes('ร้านค้า') || w.includes('ผู้รับ'))) {
      warnings.push('อ่านชื่อร้านค้าหรือคู่รายการไม่ชัดเจน กรุณาตรวจสอบ');
    }
  }

  // 3. ยอดเงิน (ห้ามเดายอดเงินหากอ่านไม่ชัด)
  let amount: number | null = null;
  if (typeof raw.amount === 'number' && Number.isFinite(raw.amount) && raw.amount > 0 && raw.amount <= 9999999999.99) {
    amount = Math.round(raw.amount * 100) / 100;
  } else if (typeof raw.amount === 'string' && raw.amount.trim() !== '') {
    const parsed = Number(raw.amount.replace(/,/g, '').trim());
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 9999999999.99) {
      amount = Math.round(parsed * 100) / 100;
    }
  }
  if (amount === null) {
    uncertainSet.add('amount');
    if (!warnings.some((w) => w.includes('ยอดเงิน') || w.includes('จำนวนเงิน'))) {
      warnings.push('ไม่พบยอดเงินที่ชัดเจนในภาพ กรุณากรอกจำนวนเงินด้วยตนเอง');
    }
  }

  // 4. สกุลเงิน
  let currency = 'THB';
  if (typeof raw.currency === 'string' && /^[A-Za-z]{3}$/.test(raw.currency.trim())) {
    currency = raw.currency.trim().toUpperCase();
  }

  // 5. ประเภทรายการ (expense | income | unknown)
  const rawType = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : 'unknown';
  const type = ALLOWED_TYPES.has(rawType) ? rawType : 'unknown';
  if (type === 'unknown') {
    uncertainSet.add('type');
    if (!warnings.some((w) => w.includes('รายรับ') || w.includes('รายจ่าย') || w.includes('ทิศทาง'))) {
      warnings.push('ไม่สามารถระบุได้ชัดเจนว่าเป็นรายรับหรือรายจ่าย กรุณาเลือกประเภทรายการก่อนบันทึก');
    }
  }

  // 6. หมวดหมู่
  const rawCategory = typeof raw.category === 'string' ? raw.category.trim().toLowerCase() : 'unknown';
  const category = ALLOWED_CATEGORIES.has(rawCategory) ? rawCategory : 'unknown';
  if (category === 'unknown') {
    uncertainSet.add('category');
  }

  // 7. แหล่งที่มาของเอกสาร
  const rawSource = typeof raw.source_type === 'string' ? raw.source_type.trim().toLowerCase() : 'unknown';
  const source_type = ALLOWED_SOURCE_TYPES.has(rawSource) ? rawSource : 'receipt';

  // 8. สรุปรายการสินค้าและวิเคราะห์วัตถุประสงค์
  const items_summary =
    typeof raw.items_summary === 'string' && raw.items_summary.trim().length > 0
      ? raw.items_summary.trim().slice(0, 1000)
      : 'ไม่พบรายละเอียดรายการสินค้าแยกย่อยในภาพ';

  const purpose_analysis =
    typeof raw.purpose_analysis === 'string' && raw.purpose_analysis.trim().length > 0
      ? raw.purpose_analysis.trim().slice(0, 1000)
      : 'ไม่สามารถระบุวัตถุประสงค์ที่ชัดเจนจากภาพเพียงอย่างเดียว กรุณาตรวจสอบหรือระบุเพิ่มเติม';

  // 9. แนะนำกระปุกเงินเดือน 6 ส่วน (fund_bucket) เบื้องต้นตามประเภทใบเสร็จและคำสำคัญ
  const combinedText = `${merchant || ''} ${items_summary} ${purpose_analysis}`.toLowerCase();
  let fund_bucket = 'general_expense';
  if (/ประกัน\s*แดน|\[fixed_item:dan_insurance\]/.test(combinedText)) {
    fund_bucket = 'dan_insurance';
  } else if (/หุ้น|หลักทรัพย์|กองทุน|ปันผล|ตลาดหลักทรัพย์|streaming|settrade|innovestx|dime|ks\b/.test(combinedText)) {
    fund_bucket = 'investment_stock';
  } else if (category === 'home_repair' || /สร้างบ้าน|วัสดุก่อสร้าง|ปูน|เหล็ก|ไทวัสดุ|โฮมโปร|ดูโฮม|เมกาโฮม|ผู้รับเหมา|ช่างบ้าน/.test(combinedText)) {
    fund_bucket = 'home_building';
  } else if (
    category === 'utilities_bills' ||
    /ประกัน|ค่าน้ำ|ค่าไฟ|การไฟฟ้า|การประปา|โทรศัพท์|อินเทอร์เน็ต|เน็[ตท]|เรียนพิเศษ|ค่าเทอม|กวดวิชา|มายด์|น้องมายด์/.test(combinedText)
  ) {
    fund_bucket = 'fixed_expense';
  } else if (category === 'health_medical' || /ฉุกเฉิน|โรงพยาบาล|คลินิก/.test(combinedText)) {
    fund_bucket = 'emergency_personal';
  }

  const uncertain_fields = Array.from(uncertainSet);
  const requires_review =
    Boolean(raw.requires_review) ||
    uncertain_fields.length > 0 ||
    warnings.length > 0 ||
    date === null ||
    amount === null ||
    type === 'unknown';

  return {
    date,
    merchant,
    amount,
    currency,
    type,
    category,
    fund_bucket,
    source_type: source_type === 'unknown' ? 'receipt' : source_type,
    items_summary,
    purpose_analysis,
    warnings,
    uncertain_fields,
    requires_review
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const corsHeaders = buildCorsHeaders(origin);

  // รองรับ CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { error: 'Method Not Allowed: รองรับเฉพาะคำขอแบบ POST เท่านั้น', code: 'METHOD_NOT_ALLOWED' },
      405,
      corsHeaders
    );
  }

  const contentType = (req.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return jsonResponse(
      { error: 'รูปแบบคำขอไม่ถูกต้อง ต้องเป็น application/json', code: 'INVALID_CONTENT_TYPE' },
      415,
      corsHeaders
    );
  }

  // 1. ตรวจสอบการยืนยันตัวตนของผู้ใช้ (Authentication Validation)
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse(
      { error: 'กรุณาเข้าสู่ระบบก่อนใช้งานการวิเคราะห์ใบเสร็จด้วย AI', code: 'UNAUTHORIZED' },
      401,
      corsHeaders
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse(
      { error: 'ตั้งค่าสภาพแวดล้อมของ Supabase บน Server ไม่ครบถ้วน', code: 'SERVER_MISCONFIGURED' },
      500,
      corsHeaders
    );
  }

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const jwt = authHeader.slice(7).trim();
  const { data: authData, error: authError } = await supabaseClient.auth.getUser(jwt);
  if (authError || !authData?.user) {
    return jsonResponse(
      { error: 'เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่อีกครั้ง', code: 'INVALID_SESSION' },
      401,
      corsHeaders
    );
  }

  const userId = authData.user.id;

  // 2. อ่านและตรวจสอบขนาดข้อมูลนำเข้า
  let rawText = '';
  try {
    rawText = await req.text();
  } catch (_e) {
    return jsonResponse(
      { error: 'ไม่สามารถอ่านข้อมูลคำขอได้', code: 'BAD_REQUEST' },
      400,
      corsHeaders
    );
  }

  if (rawText.length > MAX_BODY_CHARS) {
    return jsonResponse(
      { error: 'ไฟล์ภาพมีขนาดใหญ่เกินกำหนด กรุณาย่อภาพหรือเลือกรูปที่มีขนาดเล็กลง', code: 'PAYLOAD_TOO_LARGE' },
      413,
      corsHeaders
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawText);
  } catch (_e) {
    return jsonResponse(
      { error: 'ข้อมูล JSON ที่ส่งมาไม่ถูกต้อง', code: 'INVALID_JSON' },
      400,
      corsHeaders
    );
  }

  const geminiApiKey = (Deno.env.get('GEMINI_API_KEY') || '').trim();
  const geminiModel = (Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash').trim();
  const rateLimitPerHour = Math.max(
    1,
    Number.parseInt(Deno.env.get('AI_RATE_LIMIT_PER_HOUR') || '20', 10) || 20
  );

  // รองรับโหมดตรวจสอบสถานะความพร้อมของ AI จากหน้า Settings โดยไม่เปิดเผย API Key
  if (payload.action === 'health') {
    if (!geminiApiKey) {
      return jsonResponse(
        {
          ready: false,
          status: 'unconfigured',
          message: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Supabase Edge Function Secrets'
        },
        200,
        corsHeaders
      );
    }
    return jsonResponse(
      {
        ready: true,
        status: 'ready',
        model: geminiModel,
        rateLimitPerHour,
        message: 'AI พร้อมใช้งานผ่าน Supabase Edge Function'
      },
      200,
      corsHeaders
    );
  }

  if (!geminiApiKey) {
    return jsonResponse(
      {
        error: 'ระบบยังไม่ได้ตั้งค่า GEMINI_API_KEY บนฝั่ง Server (Supabase Edge Function Secrets)',
        code: 'AI_NOT_CONFIGURED'
      },
      503,
      corsHeaders
    );
  }

  // 3. ตรวจสอบชนิดไฟล์และข้อมูล Base64 ของรูปภาพ
  const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType.trim().toLowerCase() : '';
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return jsonResponse(
      {
        error: 'ชนิดไฟล์ภาพไม่รองรับ กรุณาใช้ไฟล์ JPEG, PNG หรือ WebP (หากเป็นไฟล์ HEIC กรุณาแปลงเป็น JPEG ก่อน)',
        code: 'UNSUPPORTED_MEDIA_TYPE'
      },
      415,
      corsHeaders
    );
  }

  let imageBase64 = typeof payload.imageBase64 === 'string' ? payload.imageBase64.trim() : '';
  if (imageBase64.includes(',')) {
    imageBase64 = imageBase64.split(',').pop() || '';
  }
  imageBase64 = imageBase64.replace(/\s+/g, '');

  if (!imageBase64 || imageBase64.length < 64 || !/^[A-Za-z0-9+/=]+$/.test(imageBase64)) {
    return jsonResponse(
      { error: 'ข้อมูลรูปภาพไม่ถูกต้องหรือเสียหาย กรุณาเลือกรูปใหม่อีกครั้ง', code: 'INVALID_IMAGE_DATA' },
      400,
      corsHeaders
    );
  }

  const estimatedBytes = Math.floor((imageBase64.length * 3) / 4);
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    return jsonResponse(
      { error: 'ขนาดภาพหลังแปลงเกินขีดจำกัด (สูงสุด 3.8 MB) กรุณาย่อภาพก่อนส่งวิเคราะห์', code: 'IMAGE_TOO_LARGE' },
      413,
      corsHeaders
    );
  }

  // 4. จองและตรวจสอบ Rate Limit ต่อผู้ใช้แบบ Atomic (ทั้งในหน่วยความจำและฐานข้อมูล)
  const nowMs = Date.now();
  const oneHourAgoMs = nowMs - 3600_000;
  const userTimestamps = (memoryRateWindow.get(userId) || []).filter((t) => t > oneHourAgoMs);
  if (userTimestamps.length >= rateLimitPerHour) {
    return jsonResponse(
      {
        error: `คุณใช้งาน AI ถึงขีดจำกัด (${rateLimitPerHour} ครั้งต่อชั่วโมง) กรุณารอสักครู่หรือกรอกรายการด้วยตนเอง`,
        code: 'RATE_LIMITED'
      },
      429,
      corsHeaders
    );
  }

  // เรียก RPC จองโควตาแบบ Atomic บนตาราง ai_usage_logs ก่อนเรียก Gemini API (Fail-Closed 100%)
  const { data: quotaData, error: quotaRpcError } = await supabaseClient.rpc(
    'consume_ai_rate_limit',
    {
      p_limit: rateLimitPerHour,
      p_model: geminiModel
    }
  );

  if (quotaRpcError || !quotaData || typeof (quotaData as Record<string, unknown>).allowed !== 'boolean') {
    return jsonResponse(
      {
        error: 'ไม่สามารถตรวจสอบและจองโควตาการใช้งาน AI แบบ Atomic ได้ กรุณาตรวจสอบว่าได้รัน supabase.sql ล่าสุดแล้ว',
        code: 'QUOTA_CHECK_FAILED'
      },
      503,
      corsHeaders
    );
  }

  if ((quotaData as Record<string, unknown>).allowed !== true) {
    return jsonResponse(
      {
        error: `คุณใช้งาน AI ถึงขีดจำกัด (${rateLimitPerHour} ครั้งต่อชั่วโมง) กรุณารอสักครู่หรือกรอกรายการด้วยตนเอง`,
        code: 'RATE_LIMITED'
      },
      429,
      corsHeaders
    );
  }

  userTimestamps.push(nowMs);
  memoryRateWindow.set(userId, userTimestamps);

  // 5. เตรียม Prompt และ JSON Schema สำหรับ Gemini Structured Output
  const systemInstruction = `คุณคือผู้เชี่ยวชาญการอ่านใบเสร็จรับเงิน ใบกำกับภาษี และสลิปโอนเงินของประเทศไทยสำหรับระบบบัญชีรายรับ-รายจ่าย
กฎเหล็กที่ต้องปฏิบัติตามอย่างเคร่งครัด:
1. ห้ามแต่งหรือเดาข้อมูลที่ไม่ปรากฏในภาพโดยเด็ดขาด
2. หากไม่พบวันที่ทำรายการในภาพ ให้คืนค่า date เป็น null และเพิ่ม "date" ใน uncertain_fields ห้ามใช้วันที่ปัจจุบันแทนเด็ดขาด หากในใบเสร็จเป็นปี พ.ศ. (เช่น 2568, 2569) ให้แปลงเป็นปี ค.ศ. (ลบ 543) ในรูปแบบ YYYY-MM-DD
3. หากไม่พบยอดเงินรวมสุทธิ หรือตัวเลขเลือนรางจนไม่แน่ใจ ให้คืนค่า amount เป็น null และเพิ่ม "amount" ใน uncertain_fields ห้ามเดาตัวเลข
4. การระบุ type ("expense", "income", "unknown"):
   - กรณีใบเสร็จซื้อสินค้า ใบกำกับภาษี ค่าอาหาร ค่าน้ำมัน ค่าบริการทั่วไป ให้ระบุเป็น "expense"
   - กรณีสลิปโอนเงินธนาคารหรือพร้อมเพย์: ห้ามสรุปว่าเป็นรายจ่ายจากคำว่า "โอนเงินสำเร็จ" เพียงอย่างเดียว เพราะผู้ใช้ส่วนใหญ่อาจถ่ายสลิปที่ตนเองโอนออก (expense) หรือได้รับสลิปที่ผู้อื่นโอนเข้ามาให้ (income) หากในภาพไม่มีบริบทที่ชี้ชัดว่าเป็นเงินเข้าหรือเงินออกของเจ้าของบัญชี ให้ตั้ง type เป็น "unknown" และเพิ่มคำเตือนใน warnings เพื่อให้ผู้ใช้เลือกเอง
5. การวิเคราะห์ purpose_analysis (ภาษาไทย):
   - ต้องแยกสิ่งที่เห็นจริงในใบเสร็จออกจากข้อสันนิษฐานอย่างชัดเจน
   - ใช้ถ้อยคำที่แสดงความเป็นไปได้ เช่น "ซื้อ... คาดว่าใช้สำหรับ..." หรือ "โอนเงินให้... ไม่สามารถระบุวัตถุประสงค์จากสลิปเพียงอย่างเดียว"
   - ห้ามยืนยันวัตถุประสงค์ส่วนบุคคลเกินกว่าหลักฐานที่ปรากฏในรายการสินค้า`;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      date: {
        type: 'STRING',
        nullable: true,
        description: 'วันที่ทำรายการรูปแบบ YYYY-MM-DD (ปี ค.ศ.) หรือ null หากไม่พบในภาพ'
      },
      merchant: {
        type: 'STRING',
        nullable: true,
        description: 'ชื่อร้านค้า บริษัท ผู้รับเงิน หรือคู่รายการ หรือ null หากไม่พบ'
      },
      amount: {
        type: 'NUMBER',
        nullable: true,
        description: 'ยอดเงินสุทธิเป็นจำนวนบวก หรือ null หากไม่พบหรือไม่ชัดเจน'
      },
      currency: {
        type: 'STRING',
        description: 'รหัสสกุลเงิน 3 ตัวอักษร เช่น THB'
      },
      type: {
        type: 'STRING',
        enum: ['expense', 'income', 'unknown'],
        description: 'ประเภทรายการ: expense (รายจ่าย), income (รายรับ), หรือ unknown หากไม่แน่ใจทิศทางเงิน'
      },
      category: {
        type: 'STRING',
        enum: [
          'food_drink',
          'groceries',
          'transport',
          'utilities_bills',
          'shopping_general',
          'home_repair',
          'health_medical',
          'education_work',
          'entertainment',
          'transfer_other',
          'salary_income',
          'business_income',
          'refund_other_income',
          'unknown'
        ],
        description: 'หมวดหมู่ของรายการ'
      },
      source_type: {
        type: 'STRING',
        enum: ['receipt', 'transfer_slip', 'unknown'],
        description: 'ชนิดเอกสารในภาพ: receipt (ใบเสร็จ) หรือ transfer_slip (สลิปโอนเงิน)'
      },
      items_summary: {
        type: 'STRING',
        description: 'สรุปรายการสินค้าหรือบริการที่ปรากฏในภาพแบบกระชับ (ภาษาไทย)'
      },
      purpose_analysis: {
        type: 'STRING',
        description: 'วิเคราะห์วัตถุประสงค์ของการซื้อหรือทำรายการจากหลักฐานที่เห็นจริงโดยแยกข้อเท็จจริงกับข้อสันนิษฐาน (ภาษาไทย)'
      },
      warnings: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'รายการคำเตือนหรือจุดที่ภาพไม่ชัด/ต้องให้ผู้ใช้ตรวจสอบ (ภาษาไทย)'
      },
      uncertain_fields: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'รายชื่อฟิลด์ที่ไม่แน่ใจ เช่น date, amount, merchant, type, category'
      },
      requires_review: {
        type: 'BOOLEAN',
        description: 'true เมื่อมีข้อมูลไม่ครบถ้วนหรือต้องการให้ผู้ใช้ตรวจสอบยืนยัน'
      }
    },
    required: [
      'currency',
      'type',
      'category',
      'source_type',
      'items_summary',
      'purpose_analysis',
      'warnings',
      'uncertain_fields',
      'requires_review'
    ]
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      geminiModel
    )}:generateContent`;

    const geminiRes = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey
      },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: imageBase64
                }
              },
              {
                text: 'กรุณาอ่านข้อมูลจากภาพใบเสร็จหรือสลิปนี้และส่งออกตาม JSON Schema ที่กำหนด หากภาพไม่ใช่ใบเสร็จหรือสลิป ให้ตั้ง date=null, amount=null, type="unknown" และแจ้งใน warnings'
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema
        }
      })
    });

    clearTimeout(timeoutId);

    if (!geminiRes.ok) {
      if (geminiRes.status === 429) {
        return jsonResponse(
          {
            error: 'บริการ Gemini AI มีผู้ใช้งานหนาแน่นหรือเกินโควตาชั่วคราว กรุณารอสักครู่แล้วลองใหม่ หรือกรอกข้อมูลด้วยตนเอง',
            code: 'GEMINI_RATE_LIMIT'
          },
          429,
          corsHeaders
        );
      }
      if (geminiRes.status === 400 || geminiRes.status === 403) {
        return jsonResponse(
          {
            error: 'ไม่สามารถเรียกใช้โมเดล AI ได้ กรุณาตรวจสอบการตั้งค่า GEMINI_API_KEY และ GEMINI_MODEL บน Server',
            code: 'GEMINI_CONFIG_ERROR'
          },
          502,
          corsHeaders
        );
      }
      return jsonResponse(
        {
          error: `บริการ AI ตอบกลับด้วยสถานะผิดพลาด (${geminiRes.status}) กรุณาลองใหม่หรือกรอกข้อมูลด้วยตนเอง`,
          code: 'GEMINI_UPSTREAM_ERROR'
        },
        502,
        corsHeaders
      );
    }

    const geminiPayload = await geminiRes.json();
    const rawJsonText =
      geminiPayload?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!rawJsonText || typeof rawJsonText !== 'string') {
      return jsonResponse(
        {
          error: 'AI ไม่สามารถอ่านข้อความจากภาพนี้ได้ กรุณาถ่ายภาพใหม่ให้ชัดเจนขึ้นหรือกรอกข้อมูลด้วยตนเอง',
          code: 'EMPTY_AI_RESPONSE'
        },
        422,
        corsHeaders
      );
    }

    let parsedResult: Record<string, unknown>;
    try {
      parsedResult = JSON.parse(rawJsonText);
    } catch (_parseErr) {
      return jsonResponse(
        {
          error: 'ผลลัพธ์จาก AI มีรูปแบบ JSON ไม่สมบูรณ์ กรุณาลองวิเคราะห์ใหม่อีกครั้ง',
          code: 'INVALID_AI_SCHEMA'
        },
        422,
        corsHeaders
      );
    }

    const validatedData = normalizeAndValidateAiResult(parsedResult);

    return jsonResponse(
      {
        ok: true,
        model: geminiModel,
        data: validatedData
      },
      200,
      corsHeaders
    );
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isAbort = err instanceof Error && err.name === 'AbortError';
    if (isAbort) {
      return jsonResponse(
        {
          error: 'การวิเคราะห์ภาพใช้เวลานานเกินกำหนด (Timeout) กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
          code: 'AI_TIMEOUT'
        },
        504,
        corsHeaders
      );
    }
    return jsonResponse(
      {
        error: 'เกิดข้อผิดพลาดในการเชื่อมต่อบริการวิเคราะห์ใบเสร็จ กรุณาลองใหม่อีกครั้ง',
        code: 'INTERNAL_EDGE_ERROR'
      },
      500,
      corsHeaders
    );
  }
});
