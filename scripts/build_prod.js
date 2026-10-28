#!/usr/bin/env node
'use strict';

/**
 * scripts/build_prod.js — ระบบ Build, Minify, Obfuscate และตรวจสอบความปลอดภัยสำหรับ Production (Section 17)
 *
 * หน้าที่หลัก:
 * 1. แปลงโค้ดต้นฉบับ TypeScript (src/app.ts, src/sw.ts) เป็น JavaScript มาตรฐานที่เบราว์เซอร์รองรับ (ผ่าน node:module stripTypeScriptTypes)
 * 2. ลบ Comment, ข้อความ Debug และช่องว่างที่ไม่จำเป็นออกจาก HTML, CSS และ JavaScript
 * 3. เปลี่ยนชื่อตัวแปรและฟังก์ชันภายใน (Identifier Mangling / Safe Obfuscation) เพื่อเพิ่มความยากในการอ่านโครงสร้าง Logic ภายใน
 *    โดยไม่กระทบต่อการทำงานของ Authentication, Validation, Accessibility, IndexedDB หรือ iOS/Android PWA
 * 4. ปิดการสร้างและเผยแพร่ Source Maps (*.map) อย่างเด็ดขาด
 * 5. แยกไฟล์สำหรับเผยแพร่จริงไว้ในโฟลเดอร์ dist/ (สำหรับ GitHub Pages) และอัปเดต index.html / sw.js ที่รากของโปรเจกต์ให้ตรงกัน
 * 6. ตรวจสอบไฟล์หลัง Build (Post-Build Security & IP Verification) ว่าไม่มี API Key, Secret, Source Map หรือไฟล์ต้นฉบับรั่วไหล
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { stripTypeScriptTypes } = require('node:module');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');

/**
 * รายชื่อตัวแปรและฟังก์ชันภายใน (Internal Identifiers) ที่สามารถเปลี่ยนชื่อ (Mangle/Obfuscate) ได้อย่างปลอดภัย
 * โดยไม่กระทบ Public API บน window.SlipSenseApp, DOM IDs หรือ Supabase SDK
 */
const INTERNAL_IDENTIFIERS_TO_MANGLE = [
  'DB_NAME',
  'DB_VERSION',
  'STORE_TRANSACTIONS',
  'SETTINGS_STORAGE_KEY',
  'CATEGORY_LABELS',
  'SOURCE_LABELS',
  'SYNC_STATUS_LABELS',
  'appState',
  'openLocalDatabase',
  'dbGetAllTransactions',
  'dbPutTransaction',
  'dbDeleteTransaction',
  'loadSettingsFromStorage',
  'saveSettingsToStorage',
  'isLikelySecretOrServiceRoleKey',
  'cleanupRealtimeSubscription',
  'setupRealtimeSubscription',
  'initSupabaseClientAndVerify',
  'callAnalyzeReceiptEdgeFunction',
  'mapRowToLocalRecord',
  'migrateLocalRecordsToCloud',
  'refreshTransactionsFromLocal',
  'renderDashboardAndHistory',
  'renderFilteredTransactionList',
  'updateStatusBannersAndPills',
  'renderDashboard',
  'getFilteredTransactions',
  'renderTransactionList',
  'openVerificationModal',
  'closeVerificationModal',
  'handleSaveVerificationForm',
  'handleDeleteTransactionClick',
  'showConfirmDialog',
  'showToast',
  'escapeHtml',
  'parseCsvLine',
  'bindUiEvents',
  'updateAuthModalView',
  'handleAuthSignIn',
  'handleAuthSignUp',
  'handleAuthPasswordReset',
  'handleAuthSignOut',
  'registerServiceWorkerSafe',
  'initApp'
];

/**
 * ลบ Comment ออกจาก JavaScript และแทนที่ชื่อตัวแปรภายในอย่างปลอดภัยโดยไม่แตะต้อง String Literal, Template Literal หรือ Regex Literal
 */
function stripCommentsAndMangleJs(jsCode, enableMangling = true) {
  const mangleMap = new Map();
  if (enableMangling) {
    INTERNAL_IDENTIFIERS_TO_MANGLE.forEach((name, idx) => {
      const hex = (0x1a0 + idx).toString(16);
      mangleMap.set(name, `_0x${hex}`);
    });
  }

  let out = '';
  let i = 0;
  const len = jsCode.length;
  let lastSignificantChar = '';

  function isRegexStartAllowed(prevChar) {
    if (!prevChar) return true;
    return '=(,[!&|:?;+-*%^~<>/{'.includes(prevChar);
  }

  while (i < len) {
    const ch = jsCode[i];
    const next = i + 1 < len ? jsCode[i + 1] : '';

    // 1. Single-line comment //
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < len && jsCode[i] !== '\n') {
        i += 1;
      }
      continue;
    }

    // 2. Multi-line comment /* ... */
    if (ch === '/' && next === '*') {
      i += 2;
      while (i + 1 < len && !(jsCode[i] === '*' && jsCode[i + 1] === '/')) {
        i += 1;
      }
      i += 2;
      continue;
    }

    // 3. Single or double quoted string
    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < len) {
        const c = jsCode[i];
        out += c;
        i += 1;
        if (c === '\\' && i < len) {
          out += jsCode[i];
          i += 1;
        } else if (c === quote) {
          break;
        }
      }
      lastSignificantChar = quote;
      continue;
    }

    // 4. Template literal `...` (mangle identifiers inside ${...} expressions)
    if (ch === '`') {
      out += ch;
      i += 1;
      while (i < len) {
        const c = jsCode[i];
        if (c === '\\' && i + 1 < len) {
          out += c + jsCode[i + 1];
          i += 2;
          continue;
        }
        if (c === '$' && i + 1 < len && jsCode[i + 1] === '{') {
          out += '${';
          i += 2;
          let braceDepth = 1;
          let exprCode = '';
          while (i < len && braceDepth > 0) {
            const ec = jsCode[i];
            if (ec === '\\' && i + 1 < len) {
              exprCode += ec + jsCode[i + 1];
              i += 2;
              continue;
            }
            if (ec === '{') braceDepth += 1;
            else if (ec === '}') {
              braceDepth -= 1;
              if (braceDepth === 0) {
                i += 1;
                break;
              }
            }
            exprCode += ec;
            i += 1;
          }
          const mangledExpr = stripCommentsAndMangleJs(exprCode, enableMangling).code;
          out += mangledExpr + '}';
          continue;
        }
        out += c;
        i += 1;
        if (c === '`') {
          break;
        }
      }
      lastSignificantChar = '`';
      continue;
    }

    // 5. Regex literal /.../flag
    if (ch === '/' && next !== '/' && next !== '*' && isRegexStartAllowed(lastSignificantChar)) {
      out += ch;
      i += 1;
      let inCharClass = false;
      while (i < len) {
        const c = jsCode[i];
        out += c;
        i += 1;
        if (c === '\\' && i < len) {
          out += jsCode[i];
          i += 1;
        } else if (c === '[') {
          inCharClass = true;
        } else if (c === ']') {
          inCharClass = false;
        } else if (c === '/' && !inCharClass) {
          while (i < len && /[a-z]/i.test(jsCode[i])) {
            out += jsCode[i];
            i += 1;
          }
          break;
        }
      }
      lastSignificantChar = '/';
      continue;
    }

    // 6. Identifier token
    if (/[A-Za-z_$]/.test(ch)) {
      let idStart = i;
      i += 1;
      while (i < len && /[A-Za-z0-9_$]/.test(jsCode[i])) {
        i += 1;
      }
      const ident = jsCode.slice(idStart, i);

      // ตรวจสอบว่าไม่ใช่ชื่อ Property หลังจุด (.)
      if (enableMangling && lastSignificantChar !== '.' && mangleMap.has(ident)) {
        out += mangleMap.get(ident);
      } else {
        out += ident;
      }
      lastSignificantChar = ident[ident.length - 1];
      continue;
    }

    // 7. Whitespace & newlines
    if (/\s/.test(ch)) {
      let hasNewline = ch === '\n' || ch === '\r';
      i += 1;
      while (i < len && /\s/.test(jsCode[i])) {
        if (jsCode[i] === '\n' || jsCode[i] === '\r') hasNewline = true;
        i += 1;
      }
      if (hasNewline) {
        if (!out.endsWith('\n')) out += '\n';
      } else {
        const prev = out.length > 0 ? out[out.length - 1] : '';
        const nextCh = i < len ? jsCode[i] : '';
        if (/[A-Za-z0-9_$]/.test(prev) && /[A-Za-z0-9_$]/.test(nextCh)) {
          out += ' ';
        } else if ((prev === '+' && nextCh === '+') || (prev === '-' && nextCh === '-')) {
          out += ' ';
        }
      }
      continue;
    }

    out += ch;
    lastSignificantChar = ch;
    i += 1;
  }

  // ลบบรรทัดว่างซ้ำซ้อน
  const compactLines = out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return {
    code: compactLines.join('\n'),
    mangledCount: mangleMap.size
  };
}

/**
 * ย่อขนาด CSS (ลบ Comment และช่องว่างเกินจำเป็น)
 */
function minifyCss(cssText) {
  return cssText
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>~])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

/**
 * ลบ HTML Comment และย่อขนาดบล็อก <style> ในไฟล์แม่แบบ HTML
 */
function buildProductionHtml(templateHtml, compiledAppJs) {
  let output = templateHtml;

  // แทนที่ Placeholder ก่อนลบ HTML comment
  output = output.replace('/* __SLIPSENSE_APP_BUNDLE_PLACEHOLDER__ */', () => compiledAppJs);

  // ลบ HTML comments ทั้งหมด (<!-- ... -->)
  output = output.replace(/<!--[\s\S]*?-->/g, '');

  // ย่อขนาด CSS ใน <style>...</style>
  output = output.replace(/<style>([\s\S]*?)<\/style>/i, (_match, cssBody) => {
    return `<style>${minifyCss(cssBody)}</style>`;
  });

  // ลบบรรทัดว่างซ้ำซ้อนนอก <script>
  output = output.replace(/\n{3,}/g, '\n\n');
  return output;
}

/**
 * คัดลอกไฟล์ไบนารีหรือข้อความไปยังปลายทาง
 */
function copyFileEnsureDir(srcPath, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
}

/**
 * ตรวจสอบความปลอดภัยและทรัพย์สินทางปัญญาของโฟลเดอร์ dist/ หลัง Build
 */
function verifyDistSecurityAndIp(distDir) {
  const forbiddenExtensions = ['.ts', '.map', '.sql', '.env', '.log'];
  const forbiddenSubstrings = [
    'sourceMappingURL',
    'sb_secret_',
    'AIzaSy',
    '/* __SLIPSENSE_APP_BUNDLE_PLACEHOLDER__ */'
  ];

  const allFiles = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        allFiles.push(full);
      }
    }
  }
  walk(distDir);

  for (const file of allFiles) {
    const ext = path.extname(file).toLowerCase();
    if (forbiddenExtensions.includes(ext)) {
      throw new Error(`[Security Gate Failed] พบไฟล์ต้องห้ามใน dist/: ${path.relative(PROJECT_ROOT, file)}`);
    }

    if (['.html', '.js', '.json'].includes(ext)) {
      const content = fs.readFileSync(file, 'utf8');
      for (const bad of forbiddenSubstrings) {
        if (content.includes(bad)) {
          throw new Error(`[Security Gate Failed] พบรูปแบบข้อมูลต้องห้าม (${bad}) ในไฟล์ ${path.relative(PROJECT_ROOT, file)}`);
        }
      }
    }
  }

  return allFiles.map((f) => ({
    path: path.relative(distDir, f).replace(/\\/g, '/'),
    bytes: fs.statSync(f).size,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
  }));
}

function main() {
  console.log('======================================================================');
  console.log(' SlipSense Production Build & IP Protection Pipeline (Section 17)');
  console.log('======================================================================');

  const appTsPath = path.join(SRC_DIR, 'app.ts');
  const swTsPath = path.join(SRC_DIR, 'sw.ts');
  const templateHtmlPath = path.join(SRC_DIR, 'index.template.html');

  if (!fs.existsSync(appTsPath) || !fs.existsSync(swTsPath) || !fs.existsSync(templateHtmlPath)) {
    throw new Error('ไม่พบไฟล์ต้นฉบับใน src/ (ต้องมี src/app.ts, src/sw.ts, src/index.template.html)');
  }

  // 1. ล้างและสร้างโฟลเดอร์ dist/ ใหม่
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // 2. แปลง TypeScript (src/app.ts) -> JavaScript + ลบ Comment + Obfuscate/Mangle ตัวแปรภายใน
  const rawAppTs = fs.readFileSync(appTsPath, 'utf8');
  const strippedAppJs = stripTypeScriptTypes(rawAppTs);
  const { code: compiledAppJs, mangledCount } = stripCommentsAndMangleJs(strippedAppJs, true);

  // 3. แปลง TypeScript (src/sw.ts) -> JavaScript + ลบ Comment
  const rawSwTs = fs.readFileSync(swTsPath, 'utf8');
  const strippedSwJs = stripTypeScriptTypes(rawSwTs);
  const { code: compiledSwJs } = stripCommentsAndMangleJs(strippedSwJs, false);

  // 4. สร้างไฟล์ HTML สำหรับ Production
  const rawTemplateHtml = fs.readFileSync(templateHtmlPath, 'utf8');
  const prodHtml = buildProductionHtml(rawTemplateHtml, compiledAppJs);

  // 5. เขียนไฟล์ลง dist/ และซิงก์ไฟล์รันไทม์ที่รากโปรเจกต์
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), prodHtml, 'utf8');
  fs.writeFileSync(path.join(DIST_DIR, 'sw.js'), compiledSwJs + '\n', 'utf8');

  fs.writeFileSync(path.join(PROJECT_ROOT, 'index.html'), prodHtml, 'utf8');
  fs.writeFileSync(path.join(PROJECT_ROOT, 'sw.js'), compiledSwJs + '\n', 'utf8');

  // 6. คัดลอก Static Assets ที่จำเป็นต่อการทำงานของ PWA ไปยัง dist/ เท่านั้น (ไม่คัดลอก src/, supabase/, docs/)
  const staticAssets = [
    'manifest.json',
    'apple-touch-icon.png',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'vendor/supabase.min.js'
  ];

  for (const rel of staticAssets) {
    copyFileEnsureDir(path.join(PROJECT_ROOT, rel), path.join(DIST_DIR, rel));
  }

  // สร้างไฟล์ .nojekyll ใน dist/ เพื่อให้ GitHub Pages เสิร์ฟไฟล์ทั้งหมดอย่างถูกต้อง
  fs.writeFileSync(path.join(DIST_DIR, '.nojekyll'), '', 'utf8');

  // 7. ตรวจสอบความปลอดภัยและขนาดไฟล์หลัง Build
  const distArtifacts = verifyDistSecurityAndIp(DIST_DIR);

  const buildManifest = {
    source_sha256: crypto.createHash('sha256').update(JSON.stringify([
      rawAppTs, rawSwTs, rawTemplateHtml,
      fs.readFileSync(path.join(PROJECT_ROOT, 'manifest.json'), 'utf8')
    ])).digest('hex'),
    node_version: process.version,
    source_stats: {
      app_ts_bytes: Buffer.byteLength(rawAppTs, 'utf8'),
      sw_ts_bytes: Buffer.byteLength(rawSwTs, 'utf8')
    },
    production_stats: {
      compiled_app_js_bytes: Buffer.byteLength(compiledAppJs, 'utf8'),
      compiled_sw_js_bytes: Buffer.byteLength(compiledSwJs, 'utf8'),
      dist_index_html_bytes: Buffer.byteLength(prodHtml, 'utf8'),
      mangled_internal_identifiers: mangledCount,
      source_maps_generated: false
    },
    artifacts: distArtifacts
  };

  fs.writeFileSync(
    path.join(DIST_DIR, 'BUILD_MANIFEST.json'),
    JSON.stringify(buildManifest, null, 2),
    'utf8'
  );

  console.log(`  [OK] TypeScript -> JS (src/app.ts): ${buildManifest.source_stats.app_ts_bytes} bytes -> ${buildManifest.production_stats.compiled_app_js_bytes} bytes`);
  console.log(`  [OK] Mangled Internal Identifiers: ${mangledCount} symbols`);
  console.log(`  [OK] TypeScript -> JS (src/sw.ts):  ${buildManifest.source_stats.sw_ts_bytes} bytes -> ${buildManifest.production_stats.compiled_sw_js_bytes} bytes`);
  console.log(`  [OK] Production dist/index.html:    ${buildManifest.production_stats.dist_index_html_bytes} bytes (Zero comments, Zero source maps)`);
  console.log(`  [OK] Security & IP Gate:            PASSED (${distArtifacts.length} deployable files in dist/)`);
  console.log('======================================================================');
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('[BUILD FAILED]', err && err.message ? err.message : err);
    process.exit(1);
  }
}

module.exports = { main, stripCommentsAndMangleJs, minifyCss, verifyDistSecurityAndIp };
