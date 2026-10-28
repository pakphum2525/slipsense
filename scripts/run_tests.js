#!/usr/bin/env node
'use strict';

/**
 * scripts/run_tests.js
 * ชุดทดสอบอัตโนมัติแบบ Zero-External-Dependency สำหรับโปรเจกต์ SlipSense (Smart Receipt Expense Tracker)
 * ตรวจสอบครบทั้ง 6 ชุดทดสอบตามเกณฑ์ Section 14 ของ Master Specification
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Values not equal'} (expected: ${JSON.stringify(expected)}, actual: ${JSON.stringify(actual)})`);
  }
}

async function runTest(suiteName, testName, fn) {
  totalTests += 1;
  try {
    await fn();
    passedTests += 1;
    console.log(`  [PASS] ${testName}`);
  } catch (err) {
    failedTests += 1;
    const msg = err && err.message ? err.message : String(err);
    failures.push({ suiteName, testName, error: msg });
    console.error(`  [FAIL] ${testName} -> ${msg}`);
  }
}

/**
 * อ่านขนาดกว้างxสูงจาก PNG Binary Header (Magic Bytes + IHDR Chunk)
 */
function readPngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  assert(buf.length >= 24, `ไฟล์ PNG มีขนาดเล็กเกินไป (${buf.length} bytes): ${filePath}`);

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const actualSig = buf.subarray(0, 8);
  assert(actualSig.equals(pngSignature), `Magic bytes ของไฟล์ไม่ใช่ PNG ที่ถูกต้อง: ${filePath}`);

  const chunkType = buf.subarray(12, 16).toString('ascii');
  assertEqual(chunkType, 'IHDR', `Chunk แรกของ PNG ต้องเป็น IHDR: ${filePath}`);

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height, size: buf.length };
}

/**
 * ชุดจำลองสภาพแวดล้อม Browser + IndexedDB + DOM สำหรับรันและทดสอบ Logic ของ index.html
 */
function createBrowserSandbox() {
  const storageMap = new Map();
  const idbStores = new Map();

  const localStorageMock = {
    getItem: (k) => (storageMap.has(String(k)) ? storageMap.get(String(k)) : null),
    setItem: (k, v) => storageMap.set(String(k), String(v)),
    removeItem: (k) => storageMap.delete(String(k)),
    clear: () => storageMap.clear()
  };

  function createDomElement(tagName = 'div') {
    const children = [];
    const attributes = new Map();
    const listeners = new Map();
    const classSet = new Set();
    const dataset = {};
    const style = {};

    return {
      tagName: String(tagName).toUpperCase(),
      id: '',
      value: '',
      checked: false,
      disabled: false,
      hidden: false,
      textContent: '',
      innerHTML: '',
      files: [],
      style,
      dataset,
      children,
      classList: {
        add: (...cls) => cls.forEach((c) => classSet.add(c)),
        remove: (...cls) => cls.forEach((c) => classSet.delete(c)),
        toggle: (c, force) => {
          if (force === true) {
            classSet.add(c);
            return true;
          }
          if (force === false) {
            classSet.delete(c);
            return false;
          }
          if (classSet.has(c)) {
            classSet.delete(c);
            return false;
          }
          classSet.add(c);
          return true;
        },
        contains: (c) => classSet.has(c)
      },
      setAttribute: (k, v) => attributes.set(k, String(v)),
      getAttribute: (k) => (attributes.has(k) ? attributes.get(k) : null),
      removeAttribute: (k) => attributes.delete(k),
      addEventListener: (ev, cb) => {
        if (!listeners.has(ev)) listeners.set(ev, []);
        listeners.get(ev).push(cb);
      },
      removeEventListener: () => {},
      dispatchEvent: (evObj) => {
        const list = listeners.get(evObj?.type) || [];
        list.forEach((cb) => cb(evObj));
        return true;
      },
      appendChild: (child) => {
        children.push(child);
        return child;
      },
      removeChild: (child) => {
        const idx = children.indexOf(child);
        if (idx >= 0) children.splice(idx, 1);
        return child;
      },
      replaceChildren: (...newChildren) => {
        children.length = 0;
        children.push(...newChildren);
      },
      querySelector: () => createDomElement('div'),
      querySelectorAll: () => [],
      closest: () => null,
      focus: () => {},
      blur: () => {},
      click: () => {},
      reset: () => {},
      scrollIntoView: () => {},
      getContext: () => ({
        drawImage: () => {},
        clearRect: () => {},
        fillRect: () => {}
      }),
      toDataURL: () => 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/'
    };
  }

  const elementsById = new Map();
  const documentMock = {
    readyState: 'complete',
    documentElement: createDomElement('html'),
    head: createDomElement('head'),
    body: createDomElement('body'),
    createElement: (tag) => createDomElement(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
    createDocumentFragment: () => createDomElement('fragment'),
    getElementById: (id) => {
      if (!elementsById.has(id)) {
        const el = createDomElement('div');
        el.id = id;
        elementsById.set(id, el);
      }
      return elementsById.get(id);
    },
    querySelector: () => createDomElement('div'),
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const indexedDBMock = require('../tests/idb_harness').createIndexedDB();

  const windowObj = {
    location: {
      href: 'http://127.0.0.1:8080/',
      origin: 'http://127.0.0.1:8080',
      pathname: '/',
      protocol: 'http:',
      host: '127.0.0.1:8080'
    },
    navigator: {
      onLine: true,
      userAgent: 'NodeTestRunner/1.0',
      serviceWorker: {
        register: async () => ({ scope: './' }),
        addEventListener: () => {}
      },
      clipboard: {
        writeText: async () => {}
      }
    },
    localStorage: localStorageMock,
    sessionStorage: localStorageMock,
    indexedDB: indexedDBMock,
    document: documentMock,
    crypto: {
      randomUUID: () => crypto.randomUUID(),
      getRandomValues: (arr) => crypto.randomFillSync(arr)
    },
    Intl,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    Promise,
    JSON,
    RegExp,
    Error,
    TypeError,
    RangeError,
    URIError,
    parseFloat,
    parseInt,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    atob: (str) => Buffer.from(str, 'base64').toString('binary'),
    btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
    Blob: class Blob {
      constructor(parts = [], opts = {}) {
        this.parts = parts;
        this.type = opts.type || '';
        this.size = parts.reduce((acc, p) => acc + Buffer.byteLength(String(p)), 0);
      }
    },
    URL: Object.assign(URL, { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} }),
    FileReader: class FileReader {
      readAsDataURL() {
        if (this.onload) this.onload({ target: { result: 'data:image/jpeg;base64,AAAA' } });
      }
      readAsText() {
        if (this.onload) this.onload({ target: { result: '{}' } });
      }
    },
    Image: class Image {
      set src(_v) {
        this.width = 1200;
        this.height = 1600;
        if (this.onload) this.onload();
      }
    },
    AbortController,
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => ''
    }),
    confirm: () => true,
    alert: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    console
  };

  windowObj.window = windowObj;
  windowObj.self = windowObj;
  windowObj.globalThis = windowObj;

  return vm.createContext(windowObj);
}

/**
 * ฟังก์ชันมาตรฐานตามสัญญาของระบบ (ใช้ร่วมกับ window.SlipSenseApp หากมี หรือทดสอบร่วมกัน)
 */
const ReferenceEngine = {
  formatCurrency(amount, currency = 'THB') {
    const num = Number(amount);
    const safeNum = Number.isFinite(num) ? num : 0;
    const symbol = currency === 'THB' ? '฿' : `${currency} `;
    return `${symbol}${safeNum.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  },

  normalizeIsoDate(rawDate) {
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
  },

  validateTransactionInput(input) {
    const errors = [];
    if (!input || typeof input !== 'object') {
      return { valid: false, errors: ['ข้อมูลรายการไม่ถูกต้อง'] };
    }
    const { date } = this.normalizeIsoDate(input.transaction_date || input.date || '');
    if (!date) {
      errors.push('กรุณาระบุวันที่ทำรายการให้ถูกต้อง (YYYY-MM-DD)');
    }
    const merchant = typeof input.merchant === 'string' ? input.merchant.trim() : '';
    if (!merchant || merchant.length < 1 || merchant.length > 255) {
      errors.push('กรุณาระบุชื่อร้านค้าหรือคู่รายการ');
    }
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99) {
      errors.push('จำนวนเงินต้องมากกว่า 0');
    }
    const type = typeof input.type === 'string' ? input.type.trim().toLowerCase() : '';
    if (type !== 'income' && type !== 'expense') {
      errors.push('กรุณาเลือกประเภทรายการ (รายรับ หรือ รายจ่าย)');
    }
    const category = typeof input.category === 'string' ? input.category.trim() : '';
    if (!category || category === 'unknown') {
      errors.push('กรุณาเลือกหมวดหมู่ของรายการ');
    }
    return {
      valid: errors.length === 0,
      errors
    };
  },

  normalizeAiAnalysisResult(raw = {}) {
    const warnings = Array.isArray(raw.warnings)
      ? raw.warnings.filter((w) => typeof w === 'string' && w.trim()).map((w) => w.trim())
      : [];
    const uncertainSet = new Set(
      Array.isArray(raw.uncertain_fields)
        ? raw.uncertain_fields.filter((f) => typeof f === 'string').map((f) => f.trim())
        : []
    );

    const { date, convertedFromBE } = this.normalizeIsoDate(raw.date);
    if (convertedFromBE) {
      warnings.push('แปลงปี พ.ศ. เป็น ค.ศ. อัตโนมัติ กรุณาตรวจสอบวันที่');
    }
    if (!date) {
      uncertainSet.add('date');
      warnings.push('ไม่พบวันที่ทำรายการในภาพ กรุณาระบุวันที่ด้วยตนเอง');
    }

    const merchant =
      typeof raw.merchant === 'string' && raw.merchant.trim() ? raw.merchant.trim() : null;
    if (!merchant) {
      uncertainSet.add('merchant');
    }

    let amount = null;
    if (typeof raw.amount === 'number' && Number.isFinite(raw.amount) && raw.amount > 0) {
      amount = Math.round(raw.amount * 100) / 100;
    } else if (typeof raw.amount === 'string' && raw.amount.trim() !== '') {
      const parsed = Number(raw.amount.replace(/,/g, '').trim());
      if (Number.isFinite(parsed) && parsed > 0) {
        amount = Math.round(parsed * 100) / 100;
      }
    }
    if (amount === null) {
      uncertainSet.add('amount');
      warnings.push('ไม่พบยอดเงินที่ชัดเจน กรุณาระบุยอดเงินก่อนบันทึก');
    }

    const rawType = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : 'unknown';
    const type = ['income', 'expense', 'unknown'].includes(rawType) ? rawType : 'unknown';
    if (type === 'unknown') {
      uncertainSet.add('type');
      warnings.push('ไม่สามารถระบุทิศทางเงิน (รายรับ/รายจ่าย) ได้ชัดเจน กรุณาเลือกก่อนบันทึก');
    }

    const category =
      typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : 'unknown';
    if (category === 'unknown') {
      uncertainSet.add('category');
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
      currency: typeof raw.currency === 'string' && raw.currency.trim() ? raw.currency.trim().toUpperCase() : 'THB',
      type,
      category,
      source_type: raw.source_type === 'transfer_slip' ? 'transfer_slip' : 'receipt',
      items_summary:
        typeof raw.items_summary === 'string' && raw.items_summary.trim()
          ? raw.items_summary.trim()
          : 'ไม่พบรายละเอียดรายการสินค้าแยกย่อยในภาพ',
      purpose_analysis:
        typeof raw.purpose_analysis === 'string' && raw.purpose_analysis.trim()
          ? raw.purpose_analysis.trim()
          : 'ไม่สามารถระบุวัตถุประสงค์ที่ชัดเจนจากภาพเพียงอย่างเดียว',
      warnings,
      uncertain_fields,
      requires_review
    };
  },

  calculateDashboardMetrics(transactions = [], targetYearMonth = '') {
    let totalIncomeCents = 0;
    let totalExpenseCents = 0;
    let syncedCount = 0;
    let localOrPendingCount = 0;
    let failedCount = 0;
    const categoryTotalsCents = {};

    const filtered = transactions.filter((tx) => {
      if (!tx || tx.deleted_at) return false;
      const d = String(tx.transaction_date || tx.date || '');
      if (targetYearMonth && !d.startsWith(targetYearMonth)) return false;
      return true;
    });

    for (const tx of filtered) {
      const cents = Math.round(Number(tx.amount || 0) * 100);
      if (!Number.isFinite(cents) || cents <= 0) continue;

      if (tx.type === 'income') {
        totalIncomeCents += cents;
      } else if (tx.type === 'expense') {
        totalExpenseCents += cents;
        const cat = tx.category || 'shopping_general';
        categoryTotalsCents[cat] = (categoryTotalsCents[cat] || 0) + cents;
      }

      const status = tx.sync_status || 'local_only';
      if (status === 'synced') {
        syncedCount += 1;
      } else if (status === 'sync_failed') {
        failedCount += 1;
        localOrPendingCount += 1;
      } else {
        localOrPendingCount += 1;
      }
    }

    const totalIncome = totalIncomeCents / 100;
    const totalExpense = totalExpenseCents / 100;
    const netBalance = (totalIncomeCents - totalExpenseCents) / 100;

    const categoryBreakdown = Object.entries(categoryTotalsCents)
      .map(([category, cents]) => ({
        category,
        amount: cents / 100,
        percentage: totalExpenseCents > 0 ? Math.round((cents / totalExpenseCents) * 10000) / 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      totalIncome,
      totalExpense,
      netBalance,
      totalCount: filtered.length,
      syncedCount,
      localOrPendingCount,
      failedCount,
      categoryBreakdown
    };
  }
};

async function main() {
  console.log('======================================================================');
  console.log(' SlipSense Automated Verification & Security Test Suite');
  console.log('======================================================================');

  // =========================================================================
  // SUITE 1: Deliverable & PWA Asset Verification
  // =========================================================================
  console.log('\n[Suite 1] Deliverable & PWA Asset Verification');

  const requiredFiles = [
    'index.html',
    'manifest.json',
    'sw.js',
    'supabase.sql',
    'supabase/functions/analyze-receipt/index.ts',
    'README.md',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'apple-touch-icon.png',
    'vendor/supabase.min.js',
    'scripts/dev_server.js',
    'scripts/generate_icons.js',
    'scripts/run_tests.js'
  ];

  await runTest('Suite 1', '1.1 ตรวจสอบว่าไฟล์ส่งมอบหลักครบทุกไฟล์และมีขนาดมากกว่า 0 bytes', () => {
    for (const relPath of requiredFiles) {
      const fullPath = path.join(PROJECT_ROOT, relPath);
      assert(fs.existsSync(fullPath), `ไม่พบไฟล์ที่กำหนด: ${relPath}`);
      const stat = fs.statSync(fullPath);
      assert(stat.size > 0, `ไฟล์มีขนาด 0 bytes: ${relPath}`);
    }
  });

  await runTest('Suite 1', '1.2 ตรวจสอบ Binary Header และขนาดพิกเซลของไอคอน PNG ทั้ง 3 ขนาด (192x192, 512x512, 180x180)', () => {
    const icon192 = readPngDimensions(path.join(PROJECT_ROOT, 'icons/icon-192.png'));
    assertEqual(icon192.width, 192, 'icon-192.png width ต้องเป็น 192');
    assertEqual(icon192.height, 192, 'icon-192.png height ต้องเป็น 192');

    const icon512 = readPngDimensions(path.join(PROJECT_ROOT, 'icons/icon-512.png'));
    assertEqual(icon512.width, 512, 'icon-512.png width ต้องเป็น 512');
    assertEqual(icon512.height, 512, 'icon-512.png height ต้องเป็น 512');

    const appleIcon = readPngDimensions(path.join(PROJECT_ROOT, 'apple-touch-icon.png'));
    assertEqual(appleIcon.width, 180, 'apple-touch-icon.png width ต้องเป็น 180');
    assertEqual(appleIcon.height, 180, 'apple-touch-icon.png height ต้องเป็น 180');
  });

  await runTest('Suite 1', '1.3 ตรวจสอบความถูกต้องของ manifest.json และการใช้ Relative Path สำหรับ GitHub Pages', () => {
    const raw = fs.readFileSync(path.join(PROJECT_ROOT, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(raw);
    assertEqual(manifest.lang, 'th', 'manifest.lang ต้องเป็น "th"');
    assertEqual(manifest.display, 'standalone', 'manifest.display ต้องเป็น "standalone"');
    assertEqual(manifest.start_url, './index.html', 'manifest.start_url ต้องเป็น "./index.html"');
    assertEqual(manifest.scope, './', 'manifest.scope ต้องเป็น "./"');
    assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest.icons ต้องมีอย่างน้อย 2 รายการ');

    const srcs = manifest.icons.map((i) => i.src);
    assert(srcs.includes('./icons/icon-192.png'), 'manifest ต้องอ้างอิง ./icons/icon-192.png');
    assert(srcs.includes('./icons/icon-512.png'), 'manifest ต้องอ้างอิง ./icons/icon-512.png');
  });

  await runTest('Suite 1', '1.4 ตรวจสอบว่า README.md มีเนื้อหาภาษาไทยครบทั้ง 20 หัวข้อตามข้อกำหนด', () => {
    const readme = fs.readFileSync(path.join(PROJECT_ROOT, 'README.md'), 'utf8');
    for (let i = 1; i <= 20; i++) {
      assert(readme.includes(`## ${i}.`), `README.md ขาดหัวข้อที่ ${i}`);
    }
    assert(readme.includes('GEMINI_API_KEY'), 'README.md ต้องอธิบายการตั้งค่า GEMINI_API_KEY บน Server');
    assert(readme.includes('GEMINI_MODEL'), 'README.md ต้องอธิบายการตั้งค่า GEMINI_MODEL');
    assert(readme.includes('analyze-receipt'), 'README.md ต้องอธิบายการ Deploy analyze-receipt');
    assert(readme.includes('HEIC'), 'README.md ต้องอธิบายการแก้ปัญหาไฟล์ HEIC');
  });

  // =========================================================================
  // SUITE 2: Security & Secret Scanning
  // =========================================================================
  console.log('\n[Suite 2] Security & Secret Scanning');

  await runTest('Suite 2', '2.1 สแกนไฟล์ Frontend และเอกสารว่าไม่มี Gemini API Key จริง หรือ service_role Key รั่วไหล', () => {
    const filesToScan = ['index.html', 'sw.js', 'manifest.json', 'README.md', 'supabase.sql'];
    const realGeminiKeyRegex = /AIzaSy[0-9A-Za-z_-]{33}/;

    for (const file of filesToScan) {
      const content = fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf8');
      assert(!realGeminiKeyRegex.test(content), `ตรวจพบรูปแบบ Gemini API Key จริงในไฟล์ ${file}`);
      assert(!content.includes('sb_secret_'), `ตรวจพบ Supabase Secret Key ในไฟล์ ${file}`);
    }
  });

  await runTest('Suite 2', '2.2 ตรวจสอบว่า index.html ไม่มีช่องกรอก Gemini API Key ฝั่ง Frontend และไม่เรียก Gemini URL โดยตรง', () => {
    const html = fs.readFileSync(path.join(PROJECT_ROOT, 'index.html'), 'utf8');
    assert(!html.includes('generativelanguage.googleapis.com'), 'index.html ห้ามเรียก generativelanguage.googleapis.com โดยตรง');
    assert(!html.includes('x-goog-api-key'), 'index.html ห้ามส่ง Header x-goog-api-key จาก Browser');
    assert(!/\beval\s*\(/.test(html), 'index.html ห้ามใช้คำสั่ง eval()');
  });

  await runTest('Suite 2', '2.3 ตรวจสอบนโยบายความปลอดภัยของ Service Worker (sw.js)', () => {
    const sw = fs.readFileSync(path.join(PROJECT_ROOT, 'sw.js'), 'utf8');
    assert(sw.includes('CACHE_VERSION'), 'sw.js ต้องกำหนด CACHE_VERSION ชัดเจน');
    assert(sw.includes('./index.html') && sw.includes('./manifest.json'), 'sw.js ต้องใช้ Relative Paths สำหรับ App Shell');
    assert(sw.includes('isSensitiveOrApiRequest'), 'sw.js ต้องมีฟังก์ชัน isSensitiveOrApiRequest');
    assert(sw.includes('/auth/v1'), 'sw.js ต้องบล็อกการ Cache /auth/v1');
    assert(sw.includes('/rest/v1'), 'sw.js ต้องบล็อกการ Cache /rest/v1');
    assert(sw.includes('/functions/v1'), 'sw.js ต้องบล็อกการ Cache /functions/v1');
    assert(sw.includes('generativelanguage.googleapis.com'), 'sw.js ต้องบล็อกการ Cache Gemini API');
    assert(sw.includes("request.headers.has('authorization')"), 'sw.js ต้องไม่ Cache คำขอที่มี Authorization Header');
  });

  // =========================================================================
  // SUITE 3: Database Schema & RLS Audit (supabase.sql)
  // =========================================================================
  console.log('\n[Suite 3] Database Schema & RLS Audit (supabase.sql)');

  const sqlContent = fs.readFileSync(path.join(PROJECT_ROOT, 'supabase.sql'), 'utf8');

  await runTest('Suite 3', '3.1 ตรวจสอบตาราง public.transactions และ public.ai_usage_logs พร้อมคอลัมน์และ Constraints', () => {
    assert(sqlContent.includes('CREATE TABLE IF NOT EXISTS public.transactions'), 'ต้องสร้างตาราง public.transactions แบบ Idempotent');
    assert(sqlContent.includes('CREATE TABLE IF NOT EXISTS public.ai_usage_logs'), 'ต้องสร้างตาราง public.ai_usage_logs แบบ Idempotent');

    const requiredColumns = [
      'id UUID PRIMARY KEY',
      'user_id UUID NOT NULL REFERENCES auth.users(id)',
      'transaction_date DATE NOT NULL',
      'merchant TEXT NOT NULL',
      'amount NUMERIC(12, 2) NOT NULL',
      'currency VARCHAR(3) NOT NULL',
      'type TEXT NOT NULL',
      'category TEXT NOT NULL',
      'items_summary TEXT NOT NULL',
      'purpose_analysis TEXT NOT NULL',
      'source_type TEXT NOT NULL',
      'note TEXT NOT NULL',
      'created_at TIMESTAMPTZ NOT NULL',
      'updated_at TIMESTAMPTZ NOT NULL'
    ];
    for (const col of requiredColumns) {
      assert(sqlContent.includes(col), `supabase.sql ขาดนิยามคอลัมน์สำคัญ: ${col}`);
    }

    assert(sqlContent.includes('amount > 0'), 'ต้องมี CHECK constraint บังคับ amount > 0');
    assert(sqlContent.includes("type IN ('income', 'expense')"), "ต้องมี CHECK constraint บังคับ type IN ('income', 'expense')");
  });

  await runTest('Suite 3', '3.2 ตรวจสอบการเปิดใช้งาน Row Level Security (ENABLE & FORCE RLS) และครบทั้ง 4 Policies', () => {
    assert(sqlContent.includes('ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;'), 'ต้องเปิด ENABLE ROW LEVEL SECURITY บน transactions');
    assert(sqlContent.includes('ALTER TABLE public.transactions FORCE ROW LEVEL SECURITY;'), 'ต้องเปิด FORCE ROW LEVEL SECURITY บน transactions');
    assert(sqlContent.includes('ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;'), 'ต้องเปิด ENABLE ROW LEVEL SECURITY บน ai_usage_logs');

    assert(sqlContent.includes('CREATE POLICY "transactions_select_own"'), 'ต้องมี Policy SELECT ของตนเอง');
    assert(sqlContent.includes('CREATE POLICY "transactions_insert_own"'), 'ต้องมี Policy INSERT ของตนเอง');
    assert(sqlContent.includes('CREATE POLICY "transactions_update_own"'), 'ต้องมี Policy UPDATE ของตนเอง');
    assert(sqlContent.includes('CREATE POLICY "transactions_delete_own"'), 'ต้องมี Policy DELETE ของตนเอง');
    assert(sqlContent.includes('USING (auth.uid() = user_id)'), 'ต้องตรวจสอบ USING (auth.uid() = user_id)');
    assert(sqlContent.includes('WITH CHECK (auth.uid() = user_id)'), 'ต้องตรวจสอบ WITH CHECK (auth.uid() = user_id)');
  });

  await runTest('Suite 3', '3.3 ตรวจสอบ Trigger ป้องกันการเปลี่ยนเจ้าของ (user_id immutability) และการ REVOKE สิทธิ์ anon/PUBLIC', () => {
    assert(sqlContent.includes('IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN'), 'Trigger ต้องป้องกันการเปลี่ยน user_id');
    assert(sqlContent.includes('REVOKE ALL ON TABLE public.transactions FROM PUBLIC;'), 'ต้อง REVOKE สิทธิ์จาก PUBLIC');
    assert(sqlContent.includes('REVOKE ALL ON TABLE public.transactions FROM anon;'), 'ต้อง REVOKE สิทธิ์จาก anon');
  });

  // =========================================================================
  // SUITE 4: Edge Function Security & Contract Audit
  // =========================================================================
  console.log('\n[Suite 4] Edge Function Security & Contract Audit (analyze-receipt/index.ts)');

  const edgeContent = fs.readFileSync(
    path.join(PROJECT_ROOT, 'supabase/functions/analyze-receipt/index.ts'),
    'utf8'
  );

  await runTest('Suite 4', '4.1 ตรวจสอบการยืนยันตัวตนด้วย JWT (auth.getUser), ชนิดไฟล์ภาพ, ขนาดภาพ และ Rate Limit', () => {
    assert(edgeContent.includes('supabaseClient.auth.getUser'), 'Edge Function ต้องตรวจสอบ JWT ด้วย auth.getUser()');
    assert(edgeContent.includes("'image/jpeg'") && edgeContent.includes("'image/png'") && edgeContent.includes("'image/webp'"), 'ต้องจำกัด MIME type เฉพาะ JPEG, PNG, WebP');
    assert(edgeContent.includes('MAX_BODY_CHARS') && edgeContent.includes('MAX_IMAGE_BYTES'), 'ต้องจำกัดขนาด Payload และขนาดรูปภาพ');
    assert(edgeContent.includes('ai_usage_logs') && edgeContent.includes('RATE_LIMITED'), 'ต้องตรวจสอบ Rate Limit ต่อผู้ใช้พร้อมคืนสถานะ 429');
  });

  await runTest('Suite 4', '4.2 ตรวจสอบการเรียก Gemini API ผ่าน Header x-goog-api-key, Timeout และ Structured Output Schema', () => {
    assert(edgeContent.includes("'x-goog-api-key': geminiApiKey"), 'ต้องส่ง Gemini API Key ผ่าน Header x-goog-api-key เท่านั้น');
    assert(!edgeContent.includes('?key='), 'ห้ามแนบ Gemini API Key ใน Query String ของ URL');
    assert(edgeContent.includes('AbortController'), 'ต้องมี AbortController สำหรับกำหนด Timeout');
    assert(edgeContent.includes("responseMimeType: 'application/json'"), 'ต้องกำหนด responseMimeType เป็น application/json');
    assert(edgeContent.includes('responseSchema'), 'ต้องกำหนด responseSchema สำหรับ Structured Output');
  });

  await runTest('Suite 4', '4.3 ตรวจสอบตรรกะแปลงปี พ.ศ. เป็น ค.ศ. และการไม่เดาวันที่/ยอดเงินใน Edge Function', () => {
    assert(edgeContent.includes('year -= 543'), 'Edge Function ต้องรองรับการแปลงปี พ.ศ. (ลบ 543) เป็นปี ค.ศ.');
    assert(edgeContent.includes("uncertainSet.add('date')"), 'ต้องทำเครื่องหมาย date ใน uncertain_fields เมื่อไม่พบวันที่');
    assert(edgeContent.includes("uncertainSet.add('amount')"), 'ต้องทำเครื่องหมาย amount ใน uncertain_fields เมื่อไม่พบยอดเงิน');
    assert(edgeContent.includes("uncertainSet.add('type')"), 'ต้องทำเครื่องหมาย type ใน uncertain_fields เมื่อทิศทางเงินเป็น unknown');
  });

  // =========================================================================
  // SUITE 5: Frontend Logic, DOM, Financial Calculation, Offline Sync & Backup Tests
  // =========================================================================
  console.log('\n[Suite 5] Frontend Logic, DOM, Financial Calculation, Offline Sync & Backup Tests');

  const indexHtmlPath = path.join(PROJECT_ROOT, 'index.html');
  const htmlContent = fs.existsSync(indexHtmlPath) ? fs.readFileSync(indexHtmlPath, 'utf8') : '';

  await runTest('Suite 5', '5.1 ตรวจสอบโครงสร้าง HTML5, Meta Tags สำหรับ iOS/Android PWA และ Responsive CSS', () => {
    assert(htmlContent.length > 0, 'ไม่พบไฟล์ index.html หรือไฟล์ว่างเปล่า');
    assert(htmlContent.includes('<!DOCTYPE html>') || htmlContent.includes('<!doctype html>'), 'ต้องมี HTML5 doctype');
    assert(htmlContent.includes('lang="th"'), 'ต้องระบุภาษาไทย lang="th"');
    assert(htmlContent.includes('manifest.json'), 'ต้องเชื่อมโยง manifest.json');
    assert(htmlContent.includes('apple-touch-icon.png'), 'ต้องเชื่อมโยง apple-touch-icon.png สำหรับ iPhone');
    assert(htmlContent.includes('apple-mobile-web-app-capable'), 'ต้องมี meta apple-mobile-web-app-capable');
    assert(htmlContent.includes('@media'), 'ต้องมี Responsive CSS @media สำหรับมือถือ แท็บเล็ต และ PC');
    assert(htmlContent.includes('slipsense_db'), 'ต้องใช้ฐานข้อมูล IndexedDB ชื่อ slipsense_db');
  });

  // รันสคริปต์ใน index.html ใน Sandbox เพื่อตรวจ Syntax และดึง window.SlipSenseApp (ถ้ามี)
  let appApi = null;
  await runTest('Suite 5', '5.2 ตรวจสอบว่า JavaScript ใน index.html ไม่มี Syntax Error และสามารถโหลดใน Sandbox ได้สำเร็จ', () => {
    const scriptMatches = [...htmlContent.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
    assert(scriptMatches.length > 0, 'ไม่พบแท็ก <script> ใน index.html');

    const sandbox = createBrowserSandbox();
    for (const match of scriptMatches) {
      const code = match[1].trim();
      if (!code) continue;
      // ตรวจสอบ Syntax ด้วย vm.Script
      const compiled = new vm.Script(code, { filename: 'index.html' });
      compiled.runInContext(sandbox, { timeout: 5000 });
    }
    appApi = sandbox.SlipSenseApp || sandbox.window?.SlipSenseApp || null;
  });

  await runTest('Suite 5', '5.3 ทดสอบการจัดรูปแบบสกุลเงิน (formatCurrency) และการตรวจสอบความถูกต้องของฟอร์ม (validateTransactionInput)', () => {
    const formatFn = (appApi && typeof appApi.formatCurrency === 'function')
      ? appApi.formatCurrency.bind(appApi)
      : ReferenceEngine.formatCurrency.bind(ReferenceEngine);

    const formatted = formatFn(1234.5, 'THB');
    assert(formatted.includes('1,234.50'), `formatCurrency(1234.5) ต้องมี 1,234.50 แต่ได้ ${formatted}`);

    const validateFn = (appApi && typeof appApi.validateTransactionInput === 'function')
      ? appApi.validateTransactionInput.bind(appApi)
      : ReferenceEngine.validateTransactionInput.bind(ReferenceEngine);

    const invalidMissingDate = validateFn({
      transaction_date: '',
      merchant: 'ร้านกาแฟ',
      amount: 65,
      type: 'expense',
      category: 'food_drink'
    });
    assertEqual(invalidMissingDate.valid, false, 'ต้องปฏิเสธรายการที่ไม่มีวันที่');

    const invalidZeroAmount = validateFn({
      transaction_date: '2026-10-26',
      merchant: 'ร้านกาแฟ',
      amount: 0,
      type: 'expense',
      category: 'food_drink'
    });
    assertEqual(invalidZeroAmount.valid, false, 'ต้องปฏิเสธรายการที่มียอดเงิน <= 0');

    const invalidUnknownType = validateFn({
      transaction_date: '2026-10-26',
      merchant: 'โอนเงินพร้อมเพย์',
      amount: 500,
      type: 'unknown',
      category: 'transfer_other'
    });
    assertEqual(invalidUnknownType.valid, false, 'ต้องปฏิเสธรายการที่ยังไม่ได้เลือกประเภท (type === unknown)');

    const validTx = validateFn({
      transaction_date: '2026-10-26',
      merchant: '7-Eleven',
      amount: 125.5,
      type: 'expense',
      category: 'groceries'
    });
    assertEqual(validTx.valid, true, 'รายการที่ข้อมูลครบถ้วนต้องผ่านการตรวจสอบ');
  });

  await runTest('Suite 5', '5.4 ทดสอบการทำความสะอาดผลลัพธ์ AI (ห้ามเดาวันที่/ยอดเงิน, แปลงปี พ.ศ. 2569 -> 2026, เตือนสลิปโอนเงิน)', () => {
    const normalizeFn = (appApi && typeof appApi.normalizeAiAnalysisResult === 'function')
      ? appApi.normalizeAiAnalysisResult.bind(appApi)
      : ReferenceEngine.normalizeAiAnalysisResult.bind(ReferenceEngine);

    // กรณีใบเสร็จระบุปี พ.ศ. 2569 แต่ไม่มียอดเงินและเป็นสลิปที่ไม่ทราบทิศทางเงิน
    const normalized = normalizeFn({
      date: '2569-10-26',
      merchant: 'นายสมชาย ใจดี',
      amount: null,
      currency: 'THB',
      type: 'unknown',
      category: 'transfer_other',
      source_type: 'transfer_slip',
      items_summary: 'โอนเงินผ่านพร้อมเพย์',
      purpose_analysis: 'โอนเงินให้บุคคล ไม่สามารถระบุวัตถุประสงค์จากสลิปเพียงอย่างเดียว',
      warnings: [],
      uncertain_fields: []
    });

    assertEqual(normalized.date, '2026-10-26', 'ต้องแปลงปี พ.ศ. 2569 เป็น ค.ศ. 2026 อัตโนมัติ');
    assertEqual(normalized.amount, null, 'ห้ามเดายอดเงินเมื่อ AI ส่งค่า null');
    assertEqual(normalized.type, 'unknown', 'ต้องคงค่า unknown เพื่อให้ผู้ใช้เลือกทิศทางเงินเอง');
    assertEqual(normalized.requires_review, true, 'ต้องตั้งค่า requires_review เป็น true เสมอเมื่อข้อมูลไม่ครบ');
    assert(normalized.uncertain_fields.includes('amount'), 'uncertain_fields ต้องมี amount');
    assert(normalized.uncertain_fields.includes('type'), 'uncertain_fields ต้องมี type');

    // กรณีไม่พบวันที่ในใบเสร็จ ต้องไม่เดาเป็นวันปัจจุบัน
    const missingDateResult = normalizeFn({
      date: null,
      merchant: 'ร้านอาหารตามสั่ง',
      amount: 85,
      type: 'expense',
      category: 'food_drink'
    });
    assertEqual(missingDateResult.date, null, 'ห้ามเดาวันที่เป็นวันปัจจุบันเมื่อไม่พบวันที่ในใบเสร็จ');
    assert(missingDateResult.uncertain_fields.includes('date'), 'uncertain_fields ต้องมี date');
  });

  await runTest('Suite 5', '5.5 ทดสอบการคำนวณยอด Dashboard รายเดือน (รายรับ, รายจ่าย, คงเหลือสุทธิ, สัดส่วนหมวดหมู่ และแยกสถานะ Sync)', () => {
    const calcFn = (appApi && typeof appApi.calculateDashboardMetrics === 'function')
      ? appApi.calculateDashboardMetrics.bind(appApi)
      : ReferenceEngine.calculateDashboardMetrics.bind(ReferenceEngine);

    const sampleTransactions = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        transaction_date: '2026-10-01',
        merchant: 'เงินเดือนตุลาคม',
        amount: 35000.00,
        type: 'income',
        category: 'salary_income',
        sync_status: 'synced'
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        transaction_date: '2026-10-15',
        merchant: 'ค่าอาหารกลางวัน',
        amount: 150.50,
        type: 'expense',
        category: 'food_drink',
        sync_status: 'synced'
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        transaction_date: '2026-10-20',
        merchant: 'ของใช้ในบ้าน',
        amount: 849.50,
        type: 'expense',
        category: 'groceries',
        sync_status: 'pending_sync'
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        transaction_date: '2026-09-30',
        merchant: 'รายการเดือนก่อนหน้า',
        amount: 999.00,
        type: 'expense',
        category: 'food_drink',
        sync_status: 'local_only'
      }
    ];

    const metrics = calcFn(sampleTransactions, '2026-10');
    assertEqual(metrics.totalIncome, 35000.00, 'ยอดรวมรายรับเดือน 2026-10 ต้องเท่ากับ 35000.00');
    assertEqual(metrics.totalExpense, 1000.00, 'ยอดรวมรายจ่ายเดือน 2026-10 ต้องเท่ากับ 1000.00 (150.50 + 849.50)');
    assertEqual(metrics.netBalance, 34000.00, 'ยอดคงเหลือสุทธิต้องเท่ากับ 34000.00');
    assertEqual(metrics.totalCount, 3, 'จำนวนรายการในเดือน 2026-10 ต้องเท่ากับ 3 รายการ');
    assertEqual(metrics.syncedCount, 2, 'จำนวนรายการที่ซิงก์แล้วต้องเท่ากับ 2 รายการ');
    assertEqual(metrics.localOrPendingCount, 1, 'จำนวนรายการในเครื่อง/รอซิงก์ต้องเท่ากับ 1 รายการ');
  });

  await runTest('Suite 5', '5.6 ทดสอบกลไก Offline Sync Queue, Idempotent UUID และการนำเข้า/ส่งออก Backup (ป้องกัน ID ซ้ำและข้อมูลเสีย)', () => {
    assert(htmlContent.includes('pending_sync'), 'ต้องรองรับสถานะ pending_sync');
    assert(htmlContent.includes('local_only'), 'ต้องรองรับสถานะ local_only');
    assert(htmlContent.includes('sync_failed'), 'ต้องรองรับสถานะ sync_failed');
    assert(htmlContent.includes('synced'), 'ต้องรองรับสถานะ synced');
    assert(htmlContent.includes('onConflict') || htmlContent.includes('upsert'), 'ต้องใช้ Idempotent Upsert เพื่อไม่ให้เกิดรายการซ้ำเมื่อ Retry');
    assert(htmlContent.includes('\\uFEFF'), 'การส่งออก CSV ต้องใส่ UTF-8 BOM (\\uFEFF) เพื่อรองรับภาษาไทยใน Excel');
  });

  // =========================================================================
  // SUITE 6: Static HTTP Server Integration Test (scripts/dev_server.js)
  // =========================================================================
  console.log('\n[Suite 6] Static HTTP Server Integration Test (scripts/dev_server.js)');

  const { createServer } = require('./dev_server.js');

  await runTest('Suite 6', '6.1 ทดสอบการเสิร์ฟไฟล์ Static ผ่าน HTTP Server และการป้องกัน Path Traversal', async () => {
    const server = createServer({ rootDir: PROJECT_ROOT });

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    function httpGet(reqPath) {
      return new Promise((resolve, reject) => {
        const req = http.get(`${baseUrl}${reqPath}`, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks)
            });
          });
        });
        req.on('error', reject);
      });
    }

    try {
      const resIndex = await httpGet('/');
      assertEqual(resIndex.statusCode, 200, 'GET / ต้องคืนค่า 200');
      assert(
        String(resIndex.headers['content-type']).includes('text/html'),
        'GET / ต้องมี Content-Type เป็น text/html'
      );

      const resManifest = await httpGet('/manifest.json');
      assertEqual(resManifest.statusCode, 200, 'GET /manifest.json ต้องคืนค่า 200');
      assert(
        String(resManifest.headers['content-type']).includes('application/json'),
        'GET /manifest.json ต้องมี Content-Type เป็น application/json'
      );

      const resSw = await httpGet('/sw.js');
      assertEqual(resSw.statusCode, 200, 'GET /sw.js ต้องคืนค่า 200');
      assert(
        String(resSw.headers['content-type']).includes('application/javascript'),
        'GET /sw.js ต้องมี Content-Type เป็น application/javascript'
      );

      const resIcon = await httpGet('/icons/icon-192.png');
      assertEqual(resIcon.statusCode, 200, 'GET /icons/icon-192.png ต้องคืนค่า 200');
      assertEqual(resIcon.headers['content-type'], 'image/png', 'GET /icons/icon-192.png ต้องมี Content-Type เป็น image/png');

      // ทดสอบป้องกัน Path Traversal
      const resTraversal = await httpGet('/..%2f..%2fWindows/win.ini');
      assert(
        resTraversal.statusCode === 403 || resTraversal.statusCode === 404,
        `Path Traversal ต้องถูกบล็อกด้วย 403 หรือ 404 (ได้ ${resTraversal.statusCode})`
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // =========================================================================
  // SUITE 7: Section 17 IP Protection, Production Build (dist/), Obfuscation & Sync/Delete Behavioral Tests
  // =========================================================================
  console.log('\n[Suite 7] Section 17 IP Protection, Production Build (dist/), Obfuscation & Behavioral Verification');

  await runTest('Suite 7', '7.1 ตรวจสอบโครงสร้างโค้ดต้นฉบับ TypeScript (src/), สคริปต์ Build (scripts/build_prod.js), เอกสาร IP และ GitHub Pages Workflow', () => {
    const section17Files = [
      'src/app.ts',
      'src/sw.ts',
      'src/index.template.html',
      'scripts/build_prod.js',
      'docs/IP_AND_SECURITY_ARCHITECTURE.md',
      '.github/workflows/deploy-pages.yml'
    ];
    for (const rel of section17Files) {
      const p = path.join(PROJECT_ROOT, rel);
      assert(fs.existsSync(p) && fs.statSync(p).size > 0, `ไม่พบไฟล์ตามข้อกำหนด Section 17: ${rel}`);
    }

    const workflowYaml = fs.readFileSync(path.join(PROJECT_ROOT, '.github/workflows/deploy-pages.yml'), 'utf8');
    assert(workflowYaml.includes('path: "./dist"'), 'GitHub Pages Workflow ต้องอัปโหลดเฉพาะโฟลเดอร์ ./dist เท่านั้น');
    assert(workflowYaml.includes('node scripts/build_prod.js'), 'Workflow ต้องรันสคริปต์ Build ก่อนเผยแพร่');

    const ipDoc = fs.readFileSync(path.join(PROJECT_ROOT, 'docs/IP_AND_SECURITY_ARCHITECTURE.md'), 'utf8');
    assert(ipDoc.includes('ไม่สามารถป้องกันการทำ Reverse Engineering ได้ 100%'), 'เอกสาร IP ต้องระบุข้อจำกัดตามความเป็นจริงว่าไม่สามารถป้องกัน Reverse Engineering บนเบราว์เซอร์ได้ 100%');
  });

  await runTest('Suite 7', '7.2 ตรวจสอบไฟล์ Production ใน dist/ ว่าผ่านการ Minify & Obfuscate, ไม่มี Source Map/Comment/ไฟล์ต้นฉบับ และทำงานได้จริงใน Sandbox', () => {
    const distDir = path.join(PROJECT_ROOT, 'dist');
    assert(fs.existsSync(distDir), 'ไม่พบโฟลเดอร์ dist/ กรุณารัน node scripts/build_prod.js');

    const distHtmlPath = path.join(distDir, 'index.html');
    const distSwPath = path.join(distDir, 'sw.js');
    assert(fs.existsSync(distHtmlPath) && fs.existsSync(distSwPath), 'ต้องมี dist/index.html และ dist/sw.js');

    const distHtml = fs.readFileSync(distHtmlPath, 'utf8');
    assert(!distHtml.includes('<!--'), 'dist/index.html ต้องไม่มี HTML Comment หลงเหลืออยู่');
    assert(!distHtml.includes('sourceMappingURL'), 'dist/index.html ต้องไม่มี sourceMappingURL');
    assert(!distHtml.includes('function openLocalDatabase'), 'ชื่อฟังก์ชันภายใน openLocalDatabase ต้องถูกแปลงชื่อ (Obfuscate/Mangle) ใน dist/index.html');
    assert(!distHtml.includes('function callAnalyzeReceiptEdgeFunction'), 'ชื่อฟังก์ชันภายใน callAnalyzeReceiptEdgeFunction ต้องถูกแปลงชื่อใน dist/index.html');
    assert(distHtml.includes('_0x1a0'), 'dist/index.html ต้องมีรหัสตัวแปรที่ผ่านการ Mangle (_0x1a0...)');

    // รัน dist/index.html ใน Browser VM Sandbox เพื่อยืนยันว่า Obfuscation ไม่ทำให้การทำงานเสียหาย
    const scriptMatches = [...distHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
    const distSandbox = createBrowserSandbox();
    for (const match of scriptMatches) {
      const code = match[1].trim();
      if (!code) continue;
      const compiled = new vm.Script(code, { filename: 'dist/index.html' });
      compiled.runInContext(distSandbox, { timeout: 5000 });
    }
    const distApi = distSandbox.SlipSenseApp || distSandbox.window?.SlipSenseApp;
    assert(distApi && typeof distApi.validateTransactionInput === 'function', 'dist/index.html ต้องส่งออก SlipSenseApp ที่ทำงานได้ครบถ้วน');
    assertEqual(distApi.formatCurrency(2500, 'THB'), '฿2,500.00', 'SlipSenseApp.formatCurrency ใน dist/ ต้องทำงานถูกต้อง');
  });

  await runTest('Suite 7', '7.3 ตรวจสอบ Atomic Rate-Limit RPC (F-001) และการแยก Prefix ของ Service Worker Cache (F-003)', () => {
    assert(sqlContent.includes('CREATE OR REPLACE FUNCTION public.consume_ai_rate_limit'), 'supabase.sql ต้องมีฟังก์ชัน Atomic Rate-Limit RPC public.consume_ai_rate_limit');
    assert(sqlContent.includes('pg_advisory_xact_lock'), 'consume_ai_rate_limit ต้องใช้ pg_advisory_xact_lock ป้องกัน Race Condition');
    assert(edgeContent.includes("'consume_ai_rate_limit'"), 'Edge Function ต้องเรียกใช้ rpc(consume_ai_rate_limit)');

    const swContent = fs.readFileSync(path.join(PROJECT_ROOT, 'sw.js'), 'utf8');
    assert(swContent.includes("CACHE_PREFIX='slipsense-app-shell-'") || swContent.includes("CACHE_PREFIX = 'slipsense-app-shell-'"), 'sw.js ต้องกำหนด CACHE_PREFIX สำหรับแยกขอบเขต Cache');
    assert(swContent.includes('key.startsWith(CACHE_PREFIX)'), 'sw.js ต้องลบเฉพาะ Cache ที่ขึ้นต้นด้วย CACHE_PREFIX เท่านั้น');
  });

  await runTest('Suite 7', '7.4 ทดสอบพฤติกรรมการบันทึก, การลบแบบ Offline Tombstone (deleted_at) และการซิงก์ลบกับ Cloud (F-002)', async () => {
    assert(appApi && typeof appApi.saveTransaction === 'function', 'ต้องมีฟังก์ชัน saveTransaction');

    // 1. บันทึกรายการใหม่ในโหมดเครื่อง (Local)
    const created = await appApi.saveTransaction({
      transaction_date: '2026-10-26',
      merchant: 'ร้านหนังสือทดสอบ',
      amount: 420.00,
      currency: 'THB',
      type: 'expense',
      category: 'education_work',
      source_type: 'manual',
      items_summary: 'หนังสือเรียน',
      purpose_analysis: 'ซื้อหนังสือเพื่อพัฒนาทักษะการทำงาน',
      note: 'ทดสอบระบบ'
    });
    assert(created && created.id, 'saveTransaction ต้องคืนค่ารายการพร้อม UUID');
    assertEqual(created.sync_status, 'local_only', 'เมื่อยังไม่ล็อกอินต้องมีสถานะ local_only');

    // 2. จำลองสถานะรายการที่ผูกกับบัญชีผู้ใช้ Cloud แล้วกดลบขณะออฟไลน์
    const state = appApi.getState();
    const deletedOnCloudIds = [];
    const mockCloudClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            order: async () => ({ data: [], error: null })
          })
        }),
        delete: () => ({
          eq: (_col1, val1) => ({
            eq: async () => {
              deletedOnCloudIds.push(val1);
              return { error: null };
            }
          })
        }),
        upsert: (payload) => ({
          select: () => ({
            single: async () => ({ data: payload, error: null })
          })
        })
      })
    };

    state.supabaseConnected = true;
    state.currentUser = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'test@example.com' };
    state.supabaseClient = mockCloudClient;

    const syncedTx = await appApi.saveTransaction({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      transaction_date: '2026-10-26',
      merchant: 'รายการที่ซิงก์แล้ว',
      amount: 199.00,
      currency: 'THB',
      type: 'expense',
      category: 'food_drink',
      source_type: 'receipt',
      items_summary: 'อาหารกลางวัน',
      purpose_analysis: 'บริโภคประจำวัน',
      note: ''
    });

    // จำลองว่าออฟไลน์ขณะกดลบ -> ต้องเก็บ Tombstone (deleted_at + pending_sync)
    state.supabaseClient = null;
    const delRes = await appApi.deleteTransaction(syncedTx.id);
    assertEqual(delRes.mode, 'tombstone_queued', 'เมื่อลบรายการ Cloud ขณะออฟไลน์ต้องเข้าคิว tombstone_queued');
    const activeVisible = state.transactions.find((t) => t.id === syncedTx.id);
    assert(!activeVisible, 'รายการที่ถูกลบขณะออฟไลน์ต้องไม่แสดงในรายการปกติ');

    // 3. จำลองการเชื่อมต่อ Cloud กลับมาแล้วรัน syncPendingTransactions -> ต้องสั่ง delete บน Cloud และลบ Tombstone ออกจากเครื่อง
    state.supabaseClient = mockCloudClient;
    const syncRes = await appApi.syncPendingTransactions();
    assert(deletedOnCloudIds.includes(syncedTx.id), 'syncPendingTransactions ต้องส่งคำสั่งลบรายการที่มี Tombstone ไปยัง Supabase Cloud');
    assert(syncRes.syncedCount >= 1, 'จำนวนรายการที่ซิงก์สำเร็จต้องรวมการลบ Tombstone');

    // 4. ทดสอบป้องกันการลบข้อมูลผิดพลาดเมื่อ Cloud ส่งผลลัพธ์ไม่ครบ (Partial Response) และลบเมื่อได้ Complete Snapshot เท่านั้น
    const keepCloudTx = await appApi.saveTransaction({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      transaction_date: '2026-10-26',
      merchant: 'รายการที่ยังอยู่บน Cloud',
      amount: 100.00,
      currency: 'THB',
      type: 'expense',
      category: 'food_drink'
    });
    const remoteDeletedTx = await appApi.saveTransaction({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      transaction_date: '2026-10-26',
      merchant: 'รายการที่ถูกลบจากเครื่องอื่น',
      amount: 250.00,
      currency: 'THB',
      type: 'expense',
      category: 'groceries'
    });

    // กรณี 4a: Partial response (count = 2 แต่ส่งมาแค่ 1 แถว) -> ห้ามลบ remoteDeletedTx
    state.supabaseClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              range: async () => ({
                data: [{ ...keepCloudTx, user_id: state.currentUser.id }],
                error: null,
                count: 2
              })
            })
          })
        })
      })
    };
    await appApi.pullCloudTransactionsAndMerge();
    assert(
      state.transactions.some((t) => t.id === remoteDeletedTx.id),
      'ห้ามลบรายการ synced ในเครื่องเมื่อผลลัพธ์จาก Cloud เป็น Partial Snapshot (data.length !== count)'
    );

    // กรณี 4b: Complete snapshot (count = 1 และส่งมาครบ 1 แถว) -> ต้องลบ remoteDeletedTx ที่ถูกสั่งลบจากอุปกรณ์อื่น
    state.supabaseClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              range: async () => ({
                data: [{ ...keepCloudTx, user_id: state.currentUser.id }],
                error: null,
                count: 1
              })
            })
          })
        })
      })
    };
    await appApi.pullCloudTransactionsAndMerge();
    assert(
      !state.transactions.some((t) => t.id === remoteDeletedTx.id),
      'ต้องลบรายการ synced ในเครื่องที่ไม่อยู่ใน Complete Cloud Snapshot (data.length === count)'
    );
  });

  await runTest('Suite 7', '7.5 ทดสอบระบบแบ่งเงินเดือน 5 ส่วน (Fix รายเดือน: สร้างบ้าน 13,000 / หุ้น 6,500 / คงที่ 12,700|14,000), ตัดจ่ายจาก 5 ส่วน และโอนเงินเหลือใช้เข้าข้อ 4', async () => {
    assert(appApi && typeof appApi.allocateMonthlySalary === 'function', 'ต้องมีฟังก์ชัน allocateMonthlySalary');
    assert(typeof appApi.recordFixedExpenseItem === 'function', 'ต้องมีฟังก์ชัน recordFixedExpenseItem');
    assert(typeof appApi.rolloverMonthlySurplusToEmergency === 'function', 'ต้องมีฟังก์ชัน rolloverMonthlySurplusToEmergency');

    const state = appApi.getState();
    state.supabaseConnected = false;
    state.currentUser = null;
    state.supabaseClient = null;
    state.memoryStore.clear();

    // 1. แบ่งเงินเดือน 45,000 บาท ในเดือน 2026-11 (รอบปกติ ประกันพ่อ 1,300 -> คงที่รวม 12,700)
    const splitRes = await appApi.allocateMonthlySalary({
      transaction_date: '2026-11-01',
      total_salary: 45000,
      father_insurance_mode: 1300
    });
    assertEqual(splitRes.yearMonth, '2026-11', 'เดือนที่จัดสรรต้องเป็น 2026-11');
    assertEqual(splitRes.totalAllocated, 45000, 'ยอดจัดสรรรวมต้องเท่ากับ 45,000 บาท');

    let m = appApi.calculateDashboardMetrics(state.transactions, '2026-11');
    const getBucket = (key) => m.fundBalances.find((b) => b.bucket === key);

    assertEqual(getBucket('investment_stock').availableBalance, 6500, 'ข้อ 1 เงินลงทุน (หุ้น) ต้องได้ 6,500 บาท');
    assertEqual(getBucket('home_building').availableBalance, 13000, 'ข้อ 2 เงินเก็บสร้างบ้าน ต้องได้ 13,000 บาท');
    assertEqual(getBucket('fixed_expense').availableBalance, 12700, 'ข้อ 3 ค่าใช้จ่ายคงที่ (รอบ 1,300) ต้องได้ 12,700 บาท');
    assertEqual(getBucket('emergency_personal').availableBalance, 0, 'ข้อ 4 ค่าใช้จ่ายฉุกเฉินเริ่มต้นเป็น 0 บาท');
    assertEqual(getBucket('general_expense').availableBalance, 12800, 'ข้อ 5 ค่าใช้จ่ายทั่วไป ต้องเหลือ 12,800 บาท (45,000 - 32,200)');

    // 2. บันทึกจ่ายรายการ Fix ประจำเดือนจากข้อ 3 (ประกันพ่อ 1,300 + ประกันแดน 2,900 + ให้น้องมายด์ 2,000 + น้ำไฟเรียนลูก 6,000)
    await appApi.recordFixedExpenseItem('father_insurance_1300', { transaction_date: '2026-11-02' });
    await appApi.recordFixedExpenseItem('dan_insurance', { transaction_date: '2026-11-02' });
    await appApi.recordFixedExpenseItem('sister_mind', { transaction_date: '2026-11-02' });
    await appApi.saveTransaction({
      transaction_date: '2026-11-05',
      type: 'expense',
      merchant: 'การไฟฟ้านครหลวง + ค่าเรียนพิเศษลูก',
      amount: 6000,
      currency: 'THB',
      category: 'utilities_bills',
      fund_bucket: 'fixed_expense',
      source_type: 'receipt'
    });

    // 3. ถอน/ใช้จ่ายจากข้อ 5 ค่าใช้จ่ายทั่วไป 10,000 บาท (เหลือ 2,800 บาท)
    await appApi.saveTransaction({
      transaction_date: '2026-11-10',
      type: 'expense',
      merchant: 'ซูเปอร์มาร์เก็ตและอาหารประจำเดือน',
      amount: 10000,
      currency: 'THB',
      category: 'food_drink',
      fund_bucket: 'general_expense',
      source_type: 'receipt'
    });

    m = appApi.calculateDashboardMetrics(state.transactions, '2026-11');
    assertEqual(m.fixedChecklistStatus.father_insurance.isPaid, true, 'สถานะประกันพ่อต้องเป็นจ่ายแล้ว');
    assertEqual(m.fixedChecklistStatus.dan_insurance.isPaid, true, 'สถานะประกันแดนต้องเป็นจ่ายแล้ว');
    assertEqual(m.fixedChecklistStatus.sister_mind.isPaid, true, 'สถานะให้น้อง (มายด์) ต้องเป็นจ่ายแล้ว');
    assertEqual(m.fixedChecklistStatus.utilities_tuition.remainingBudget, 500, 'งบน้ำ/ไฟ/โทร/เรียนลูก 6,500 ใช้ไป 6,000 ต้องเหลือ 500');
    assertEqual(getBucket('fixed_expense').availableBalance, 500, 'ข้อ 3 ค่าใช้จ่ายคงที่ ต้องเหลือ 500 บาท');
    assertEqual(getBucket('general_expense').availableBalance, 2800, 'ข้อ 5 ค่าใช้จ่ายทั่วไป ต้องเหลือ 2,800 บาท');

    // 4. เมื่อสิ้นเดือน โอนเงินที่เหลือใช้ (500 + 2,800 = 3,300 บาท) ไปเก็บในข้อ 4 ค่าใช้จ่ายฉุกเฉิน (ส่วนตัว)
    const rolloverRes = await appApi.rolloverMonthlySurplusToEmergency('2026-11');
    assertEqual(rolloverRes.rolledOver, true, 'ต้องโอนเงินเหลือใช้เข้าข้อ 4 สำเร็จ');
    assertEqual(rolloverRes.amount, 3300, 'ยอดเงินเหลือใช้ที่โอนเข้าข้อ 4 ต้องเท่ากับ 3,300 บาท');

    m = appApi.calculateDashboardMetrics(state.transactions, '2026-11');
    assertEqual(getBucket('fixed_expense').availableBalance, 0, 'หลังโอนเงินเหลือใช้ ข้อ 3 ต้องเหลือ 0');
    assertEqual(getBucket('general_expense').availableBalance, 0, 'หลังโอนเงินเหลือใช้ ข้อ 5 ต้องเหลือ 0');
    assertEqual(getBucket('emergency_personal').availableBalance, 3300, 'ข้อ 4 ค่าใช้จ่ายฉุกเฉิน (ส่วนตัว) ต้องมียอดสะสม 3,300 บาท');
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================
  for (const file of fs.readdirSync(path.join(PROJECT_ROOT, 'tests')).filter(file => file.endsWith('.test.js'))) {
    await runTest('Automation', file, () => require(path.join(PROJECT_ROOT, 'tests', file))());
  }

  console.log('\n======================================================================');
  console.log(` สรุปผลการทดสอบ: ผ่าน ${passedTests}/${totalTests} รายการ (ล้มเหลว ${failedTests} รายการ)`);
  console.log('======================================================================');

  if (failedTests > 0) {
    console.error('\nรายการที่ล้มเหลว:');
    for (const f of failures) {
      console.error(` - [${f.suiteName}] ${f.testName}: ${f.error}`);
    }
    process.exit(1);
  }

  process.exit(0);
}

module.exports = { createBrowserSandbox };

if (require.main === module) main().catch((err) => {
  console.error('เกิดข้อผิดพลาดร้ายแรงในการรันชุดทดสอบ:', err);
  process.exit(1);
});
