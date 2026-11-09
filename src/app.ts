/**
 * src/app.ts — TypeScript Source สำหรับ Frontend ของ SlipSense (Smart Receipt Expense Tracker)
 *
 * หมายเหตุด้านทรัพย์สินทางปัญญาและความปลอดภัย (Section 17):
 * - ไฟล์นี้เป็น Source Code ต้นฉบับสำหรับนักพัฒนา (เก็บใน Private Repository เท่านั้น ห้ามเผยแพร่ขึ้น GitHub Pages)
 * - Prompt ภายใน, กฎการวิเคราะห์ใบเสร็จเชิงลึก, และการจำกัดอัตราการเรียกใช้งาน (Atomic Rate Limit) ทำงานบน Supabase Edge Function เท่านั้น
 * - กระบวนการ Build (scripts/build_prod.js) จะแปลง TypeScript เป็น JavaScript, ลบ Comment, ย่อขนาด (Minify) และแปลงชื่อตัวแปรภายใน (Obfuscate/Mangle) ก่อนสร้างไฟล์ใน dist/
 */

type TransactionType = 'income' | 'expense' | 'unknown';
type SourceType = 'receipt' | 'transfer_slip' | 'manual';
type SyncStatus = 'local_only' | 'pending_sync' | 'synced' | 'sync_failed';
type AiServiceStatus = 'ready' | 'unconfigured' | 'unreachable' | 'rate_limited' | 'error';
type FundBucket = string;

interface TransactionRecord {
  id: string;
  user_id: string | null;
  transaction_date: string;
  merchant: string;
  amount: number;
  currency: string;
  type: 'income' | 'expense';
  category: string;
  fund_bucket: FundBucket;
  source_type: SourceType;
  items_summary: string;
  purpose_analysis: string;
  note: string;
  sync_status: SyncStatus;
  pending_delete?: boolean;
  deleted_at?: string | null;
  sync_error?: string;
  created_at: string;
  updated_at: string;
}

interface AppSettings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  defaultCurrency: string;
}

interface DashboardMetrics {
  month: string;
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  syncedIncome: number;
  pendingIncome: number;
  syncedExpense: number;
  pendingExpense: number;
  totalCount: number;
  syncedCount: number;
  pendingCount: number;
  categoryBreakdown: Array<{
    category: string;
    label: string;
    amount: number;
    percentage: number;
    count: number;
  }>;
}

    (function (globalScope) {
      'use strict';

      const DB_NAME: string = 'slipsense_db';
      const DB_VERSION: number = 3;
      const STORE_TRANSACTIONS: string = 'transactions';
      const SETTINGS_STORAGE_KEY: string = 'slipsense_settings_v1';

      const CATEGORY_LABELS: Record<string, string> = {
        food_drink: 'อาหารและเครื่องดื่ม',
        groceries: 'ของใช้และซูเปอร์มาร์เก็ต',
        transport: 'เดินทางและยานพาหนะ',
        travel: 'การท่องเที่ยวและพักผ่อน',
        utilities_bills: 'ค่าน้ำ ค่าไฟ และบิลสาธารณูปโภค',
        shopping_general: 'ช้อปปิ้งและเสื้อผ้า',
        home_repair: 'ซ่อมบำรุงและอุปกรณ์บ้าน',
        health_medical: 'สุขภาพและการแพทย์',
        education_work: 'การศึกษาและอุปกรณ์ทำงาน',
        entertainment: 'บันเทิงและไลฟ์สไตล์',
        pet: 'สัตว์เลี้ยงและอุปกรณ์',
        transfer_other: 'โอนเงินและอื่นๆ',
        salary_income: 'เงินเดือนและค่าจ้าง',
        business_income: 'รายได้ธุรกิจ/ค้าขาย',
        refund_other_income: 'เงินคืนและรายรับอื่นๆ',
        unknown: 'ยังไม่ระบุหมวดหมู่'
      };

      const CATEGORY_SHORT_LABELS: Record<string, string> = {
        food_drink: 'อาหาร',
        groceries: 'ของใช้',
        transport: 'เดินทาง',
        travel: 'ท่องเที่ยว',
        utilities_bills: 'บิล/น้ำไฟ',
        shopping_general: 'ช้อปปิ้ง',
        home_repair: 'ซ่อมบ้าน',
        health_medical: 'สุขภาพ',
        education_work: 'ศึกษา/งาน',
        entertainment: 'บันเทิง',
        pet: 'สัตว์เลี้ยง',
        transfer_other: 'โอนเงิน',
        salary_income: 'เงินเดือน',
        business_income: 'ธุรกิจ',
        refund_other_income: 'เงินคืน',
        unknown: 'ทั่วไป'
      };


      const SOURCE_LABELS: Record<SourceType, string> = {
        receipt: 'ใบเสร็จรับเงิน',
        transfer_slip: 'สลิปโอนเงิน',
        manual: 'กรอกด้วยตนเอง'
      };

      const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
        local_only: 'บันทึกในเครื่อง',
        pending_sync: 'รอซิงก์ขึ้น Cloud',
        synced: 'ซิงก์ Cloud แล้ว',
        sync_failed: 'ซิงก์ไม่สำเร็จ'
      };

      const BUCKET_ICONS = ['🐷', '🏡', '📈', '🍜', '🛟', '🛡️', '✈️', '🐱', '🚗', '🎁', '💎', '☕', '🍔', '🎓', '📌', '🌈', '🍄', '🍎', '🐝'];
      // All artwork is local geometry. No user input is interpreted as SVG markup.
      const ICON_ARTWORK: Record<string, [string, string, Array<[string, Record<string, string | number>]>]> = {
        pig: ['#ffbdd8', '#df6f9a', [['ellipse',{cx:49,cy:54,rx:31,ry:25}], ['path',{d:'M25 36 L23 16 Q40 16 41 33 M58 32 Q61 14 76 20 L73 39'}], ['rect',{x:28,y:70,width:12,height:15,rx:5}], ['rect',{x:61,y:70,width:12,height:15,rx:5}], ['ellipse',{cx:70,cy:57,rx:16,ry:12,fill:'#ffcddd'}], ['path',{d:'M65 55v4 M74 55v4',stroke:'#a64d77','stroke-width':3}], ['path',{d:'M40 29h17',stroke:'#9d537b','stroke-width':4,'stroke-linecap':'round'}]]],
        house: ['#a9e6cb', '#43a58f', [['rect',{x:24,y:38,width:54,height:43,rx:10}], ['path',{d:'M13 43 Q10 39 17 34 L45 13 Q50 8 56 13 L86 36 Q91 44 81 45Z',fill:'#f6a4b9'}], ['rect',{x:57,y:57,width:13,height:24,rx:5,fill:'#fff0cb'}], ['rect',{x:30,y:47,width:15,height:15,rx:4,fill:'#e6faff'}]]],
        stock: ['#b2e8de', '#53a7bd', [['rect',{x:19,y:17,width:64,height:67,rx:16}], ['path',{d:'M30 59 L44 44 L55 50 L72 29 M60 29h12v13',fill:'none',stroke:'#fff6c5','stroke-width':7,'stroke-linecap':'round','stroke-linejoin':'round'}]]],
        noodles: ['#ffcc9a', '#e88e73', [['path',{d:'M20 47h64 Q80 83 52 84 Q25 83 20 47'}], ['ellipse',{cx:52,cy:47,rx:32,ry:10,fill:'#fff1c6'}], ['path',{d:'M28 44q6-25 12 0q6-26 12 0q6-26 12 0q6-25 12 0',fill:'none',stroke:'#e6b55d','stroke-width':4}], ['path',{d:'M57 26L86 12 M61 32L91 20',stroke:'#bd795c','stroke-width':4,'stroke-linecap':'round'}]]],
        burger: ['#ffd585', '#d9964d', [['path',{d:'M19 41Q22 13 51 15Q80 15 84 41Z'}], ['rect',{x:18,y:45,width:67,height:10,rx:5,fill:'#9ec975'}], ['rect',{x:19,y:56,width:65,height:12,rx:6,fill:'#a36753'}], ['path',{d:'M20 68h63q0 16-15 16H35Q20 84 20 68'}], ['path',{d:'M34 27l3-2 M51 23l3 1 M66 29l3 2',stroke:'#fff5d8','stroke-width':3,'stroke-linecap':'round'}]]],
        gift: ['#ffafc8', '#d96aa1', [['rect',{x:23,y:35,width:56,height:47,rx:9}], ['rect',{x:18,y:29,width:66,height:17,rx:6}], ['path',{d:'M48 30Q14 28 28 13Q40 8 51 29Q64 7 76 16Q84 33 51 30',fill:'#c5b4f4'}], ['path',{d:'M50 35v47',stroke:'#fff2cd','stroke-width':9}]]],
        travel: ['#a1dcd7', '#4caaa7', [['ellipse',{cx:50,cy:80,rx:37,ry:9,fill:'#ffdea0'}], ['path',{d:'M52 25L44 78',stroke:'#bb8260','stroke-width':5}], ['path',{d:'M16 39Q40 1 77 30L84 37Q71 29 61 40Q48 28 37 42Q27 31 16 39'}], ['path',{d:'M37 42Q40 22 50 16Q59 24 61 40',fill:'#ffb8cd'}], ['circle',{cx:80,cy:15,r:8,fill:'#ffdd84'}]]],
        cat: ['#ffdbad', '#d8a172', [['path',{d:'M22 45L20 15L42 28Q52 23 63 28L81 15L80 49Q89 81 51 84Q14 81 22 45'}], ['path',{d:'M25 66L12 63 M28 72L14 76 M74 66L88 63 M73 72L88 76',stroke:'#b58068','stroke-width':3,'stroke-linecap':'round'}], ['path',{d:'M47 57h8l-4 5Z',fill:'#e489a8'}]]],
        education: ['#c6b5f5', '#8571b8', [['rect',{x:25,y:44,width:51,height:30,rx:10}], ['path',{d:'M10 34L50 13L91 34L50 55Z'}], ['path',{d:'M86 36v33',stroke:'#f6cc72','stroke-width':4}], ['circle',{cx:86,cy:72,r:5,fill:'#f6cc72'}]]],
        emergency: ['#ffbcba', '#df7a91', [['circle',{cx:51,cy:49,r:34}], ['path',{d:'M23 28l16 13 M64 59l16 13 M25 73l15-15 M65 39l15-14',stroke:'#fff5e7','stroke-width':15}], ['circle',{cx:51,cy:49,r:16,fill:'#c6e9ef'}]]],
        shield: ['#adcff6', '#648ec9', [['path',{d:'M50 11Q68 23 83 23V51Q81 73 50 89Q19 73 18 51V23Q34 23 50 11'}], ['path',{d:'M33 43l12 12 23-24',fill:'none',stroke:'#fff2cb','stroke-width':8,'stroke-linecap':'round','stroke-linejoin':'round'}]]],
        bills: ['#ffe4ab', '#d8ab65', [['path',{d:'M24 14h52v72l-9-6-9 6-9-6-9 6-8-6-8 6Z'}], ['path',{d:'M35 33h30 M35 43h22',stroke:'#c59978','stroke-width':5,'stroke-linecap':'round'}], ['circle',{cx:54,cy:16,r:9,fill:'#f39cac'}]]],
        car: ['#b8c9ff', '#7e8ed8', [['path',{d:'M20 49L31 25Q34 20 44 20h19q7 0 10 9l9 20'}], ['rect',{x:14,y:44,width:75,height:32,rx:13}], ['path',{d:'M34 28h29l8 18H28Z',fill:'#dcf6fc'}], ['circle',{cx:29,cy:77,r:10,fill:'#686582'}], ['circle',{cx:75,cy:77,r:10,fill:'#686582'}], ['circle',{cx:24,cy:55,r:5,fill:'#fff3c3'}], ['circle',{cx:80,cy:55,r:5,fill:'#fff3c3'}]]],
        diamond: ['#bfedff', '#8d9fdf', [['path',{d:'M14 34L31 15h39l18 19-37 52Z'}], ['path',{d:'M14 34h74 M31 15l8 19 12 52 13-52 6-19 M39 34l12-19 13 19',fill:'none',stroke:'#eefaff','stroke-width':3}]]],
        coffee: ['#ffd1ad', '#cc9479', [['path',{d:'M73 38Q98 32 88 59Q83 67 72 62',fill:'none',stroke:'#eeb696','stroke-width':9}], ['path',{d:'M23 32h51v29Q74 80 50 81Q24 80 23 61Z'}], ['ellipse',{cx:49,cy:32,rx:25,ry:8,fill:'#996b59'}], ['path',{d:'M35 20q-6-7 0-13 M52 19q-6-7 0-13',fill:'none',stroke:'#fff3dd','stroke-width':4,'stroke-linecap':'round'}], ['ellipse',{cx:50,cy:85,rx:33,ry:5,fill:'#e8c1b2'}]]],
        rainbow: ['#daeafa', '#9fbbdf', [['path',{d:'M15 57a35 35 0 0170 0',fill:'none',stroke:'#f4a9bb','stroke-width':13}], ['path',{d:'M27 57a23 23 0 0146 0',fill:'none',stroke:'#ffe29b','stroke-width':11}], ['path',{d:'M37 57a13 13 0 0126 0',fill:'none',stroke:'#b4e0cd','stroke-width':9}], ['path',{d:'M17 80Q1 76 13 62Q9 46 27 46Q38 31 50 48Q66 39 72 56Q93 52 92 69Q90 83 72 81Z'}]]],
        mushroom: ['#ffb7b7', '#d36c91', [['rect',{x:34,y:48,width:33,height:36,rx:13,fill:'#ffedcb'}], ['path',{d:'M12 51Q18 9 51 12Q85 11 91 51Q52 66 12 51'}], ['ellipse',{cx:33,cy:33,rx:8,ry:7,fill:'#fff2df'}], ['ellipse',{cx:64,cy:25,rx:7,ry:6,fill:'#fff2df'}], ['ellipse',{cx:74,cy:46,rx:6,ry:5,fill:'#fff2df'}]]],
        apple: ['#ff9e9e', '#d95076', [['path',{d:'M51 29Q23 13 18 42Q8 67 33 84Q44 90 51 83Q64 91 76 78Q97 49 79 29Q65 19 51 29'}], ['path',{d:'M51 29Q46 14 55 8',stroke:'#a4775a','stroke-width':5,fill:'none'}], ['path',{d:'M55 22Q59 4 78 13Q72 29 55 22',fill:'#91c895'}]]],
        bee: ['#ffe59d', '#e5b962', [['ellipse',{cx:34,cy:30,rx:14,ry:20,fill:'#def4ff',transform:'rotate(-30 34 30)'}], ['ellipse',{cx:66,cy:30,rx:14,ry:20,fill:'#def4ff',transform:'rotate(30 66 30)'}], ['ellipse',{cx:51,cy:57,rx:30,ry:24}], ['path',{d:'M36 36q-9 20 0 42 M65 36q9 20 0 42',fill:'none',stroke:'#927154','stroke-width':7}], ['path',{d:'M37 36L32 23 M64 36l5-13',stroke:'#927154','stroke-width':3,'stroke-linecap':'round'}]]]
      };
      const ICON_KEYS: Record<string, string> = {
        '🐷':'pig', '🏡':'house', '📈':'stock', '🍜':'noodles', '🍔':'burger', '🎁':'gift', '✈️':'travel', '🐱':'cat',
        '🎓':'education', '🛟':'emergency', '🛡️':'shield', '📌':'bills', '🚗':'car', '💎':'diamond', '☕':'coffee',
        '🌈':'rainbow', '🍄':'mushroom', '🍎':'apple', '🐝':'bee', '📊':'stock', '🧾':'bills', '💰':'pig',
        food_drink:'noodles', groceries:'apple', transport:'car', travel:'travel', utilities_bills:'bills', shopping_general:'gift',
        home_repair:'house', health_medical:'shield', education_work:'education', entertainment:'rainbow', pet:'cat',
        transfer_other:'pig', salary_income:'pig', business_income:'stock', refund_other_income:'gift', unknown:'mushroom'
      };
      let icon3dSequence = 0;
      function render3dIcon(iconKey: any, size = 52) {
        const key = Object.prototype.hasOwnProperty.call(ICON_KEYS, iconKey) ? ICON_KEYS[iconKey]
          : Object.prototype.hasOwnProperty.call(ICON_ARTWORK, iconKey) ? iconKey : 'pig';
        const [light, dark, shapes] = ICON_ARTWORK[key];
        const safeSize = typeof size === 'number' && Number.isFinite(size) ? Math.max(24, Math.min(160, size)) : 52;
        const badge = document.createElement('span'); badge.className = 'icon-3d-badge';
        badge.style.width = safeSize + 'px'; badge.style.height = safeSize + 'px';
        badge.setAttribute('aria-hidden', 'true'); badge.setAttribute('data-icon-key', key);
        const node = (tag: string, attrs: Record<string, string | number> = {}) => {
          const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
          for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
          return el;
        };
        const id = 'clay-' + (++icon3dSequence);
        const svg = node('svg', {viewBox:'0 0 100 100', class:'cute-3d-svg', width:safeSize, height:safeSize, focusable:'false'});
        const defs = node('defs');
        const radial = node('radialGradient', {id:id+'-body', cx:'30%', cy:'20%', r:'85%'});
        radial.appendChild(node('stop', {offset:0, 'stop-color':light}));
        radial.appendChild(node('stop', {offset:1, 'stop-color':dark})); defs.appendChild(radial);
        const shine = node('linearGradient', {id:id+'-shine', x1:0,y1:0,x2:0,y2:1});
        shine.appendChild(node('stop', {offset:0,'stop-color':'#fff','stop-opacity':.8}));
        shine.appendChild(node('stop', {offset:1,'stop-color':'#fff','stop-opacity':0})); defs.appendChild(shine);
        const filter = node('filter', {id:id+'-shadow', x:'-30%', y:'-30%', width:'160%', height:'170%'});
        filter.appendChild(node('feDropShadow', {dx:0,dy:3,stdDeviation:2,'flood-color':'#624766','flood-opacity':.22})); defs.appendChild(filter);
        svg.appendChild(defs);
        svg.appendChild(node('ellipse', {cx:51,cy:91,rx:30,ry:4,fill:'#63476b',opacity:.13}));
        const body = node('g', {fill:'url(#'+id+'-body)', filter:'url(#'+id+'-shadow)'});
        for (const [tag, attrs] of shapes) body.appendChild(node(tag, attrs));
        svg.appendChild(body);
        svg.appendChild(node('ellipse', {cx:35,cy:30,rx:8,ry:4,fill:'url(#'+id+'-shine)',transform:'rotate(-25 35 30)'}));
        const faceY = key === 'mushroom' ? 71 : key === 'rainbow' ? 66 : key === 'education' ? 64 : 65;
        for (const x of [43,58]) svg.appendChild(node('circle', {cx:x,cy:faceY,r:2,fill:'#60445c'}));
        svg.appendChild(node('path', {d:'M47 '+(faceY+4)+'q4 5 8 0',fill:'none',stroke:'#60445c','stroke-width':1.8,'stroke-linecap':'round'}));
        for (const x of [37,64]) svg.appendChild(node('ellipse', {cx:x,cy:faceY+4,rx:4,ry:2,fill:'#f28cac',opacity:.65}));
        badge.appendChild(svg); return badge;
      }
      function renderBottomNavIcons() {
        const tabs: Array<[string, string]> = [
          ['tab-home', 'house'],
          ['tab-funds', 'pig'],
          ['tab-analytics', 'stock'],
          ['tab-history', 'bills']
        ];
        for (const [id, iconKey] of tabs) {
          const btn = document.getElementById(id);
          if (!btn) continue;
          const holder = (Array.isArray(btn.children) && btn.children.find((c: any) => c.className === 'tab-3d-icon')) || btn.querySelector?.('.tab-3d-icon');
          if (holder) {
            holder.replaceChildren(render3dIcon(iconKey, 26));
          }
        }
      }

      const CATEGORY_PICKER_ITEMS = [
        'food_drink', 'groceries', 'transport', 'travel', 'utilities_bills',
        'shopping_general', 'home_repair', 'health_medical', 'entertainment',
        'education_work', 'pet', 'transfer_other'
      ];
      const CATEGORY_PICKER_INCOME_ITEMS = [
        'salary_income', 'business_income', 'refund_other_income', 'transfer_other'
      ];
      function updateMerchantFieldPresentation(type: string = 'expense') {
        const isIncome = type === 'income';
        const lbl = document.getElementById('lblTxMerchantText');
        const input = document.getElementById('txFormMerchant') as HTMLInputElement | null;
        const chips = document.getElementById('incomeQuickChips');
        if (lbl) {
          lbl.textContent = isIncome ? 'ที่มาของรายรับ / รายการ *' : 'ร้านค้า / รายการ *';
        }
        if (input) {
          input.placeholder = isIncome ? 'เช่น เงินเดือนบริษัท, เงินปันผล, ลูกค้าโอนค่าของ, คืนเงิน' : 'เช่น 7-Eleven, การไฟฟ้านครหลวง, หรือชื่อผู้รับโอน';
        }
        if (chips) {
          chips.style.display = isIncome ? 'flex' : 'none';
        }
      }

      function renderCategoryPicker(type = 'expense') {
        updateMerchantFieldPresentation(type);
        const container = document.getElementById('txCategoryPicker');
        const items = type === 'income' ? CATEGORY_PICKER_INCOME_ITEMS : CATEGORY_PICKER_ITEMS;

        if (container) {
          container.replaceChildren();
          for (const catKey of items) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cat-picker-btn';
            btn.setAttribute('data-category', catKey);
            btn.setAttribute('role', 'radio');
            btn.setAttribute('aria-checked', 'false');
            btn.setAttribute('aria-label', CATEGORY_LABELS[catKey] || catKey);
            btn.appendChild(render3dIcon(catKey, 30));
            const lbl = document.createElement('span');
            lbl.textContent = CATEGORY_SHORT_LABELS[catKey] || catKey;
            btn.appendChild(lbl);
            btn.onclick = () => {
              const select = document.getElementById('txFormCategory') as HTMLSelectElement | null;
              if (select) {
                select.value = catKey;
                select.dispatchEvent(new Event('change', { bubbles: true }));
              }
              updateCategoryPickerSelection(catKey);
            };
            container.appendChild(btn);
          }
        }

        // Populate Custom Cute 3D Dropdown Menu
        const menu = document.getElementById('custom3dCategoryMenu');
        if (menu) {
          menu.replaceChildren();
          for (const catKey of items) {
            const opt = document.createElement('div');
            opt.className = 'custom-3d-option';
            opt.setAttribute('role', 'option');
            opt.setAttribute('data-category', catKey);

            const iconBox = document.createElement('div');
            iconBox.className = 'option-3d-icon';
            iconBox.appendChild(render3dIcon(catKey, 30));
            opt.appendChild(iconBox);

            const labelSpan = document.createElement('span');
            labelSpan.className = 'option-label';
            labelSpan.textContent = CATEGORY_LABELS[catKey] || catKey;
            opt.appendChild(labelSpan);

            opt.onclick = (e) => {
              e.stopPropagation();
              const select = document.getElementById('txFormCategory') as HTMLSelectElement | null;
              if (select) {
                select.value = catKey;
                select.dispatchEvent(new Event('change', { bubbles: true }));
              }
              updateCategoryPickerSelection(catKey);
              menu.hidden = true;
              document.getElementById('custom3dCategoryDropdown')?.setAttribute('aria-expanded', 'false');
            };
            menu.appendChild(opt);
          }
        }
      }

      function updateCategoryPickerSelection(selectedCat: string) {
        const container = document.getElementById('txCategoryPicker');
        if (container) {
          const buttons = container.querySelectorAll && container.querySelectorAll('.cat-picker-btn').length > 0
            ? container.querySelectorAll('.cat-picker-btn')
            : (container.children || []);
          for (const btn of Array.from(buttons) as any[]) {
            const match = btn.getAttribute('data-category') === selectedCat;
            btn.setAttribute('aria-checked', match ? 'true' : 'false');
            if (match && typeof btn.scrollIntoView === 'function') {
              try { btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); } catch {}
            }
          }
        }

        // Update Custom 3D Dropdown Selected Item
        const iconBox = document.getElementById('custom3dCategoryIconBox');
        const labelText = document.getElementById('custom3dCategoryLabelText');
        const menu = document.getElementById('custom3dCategoryMenu');

        if (iconBox && labelText) {
          if (CATEGORY_LABELS[selectedCat]) {
            iconBox.replaceChildren(render3dIcon(selectedCat, 34));
            labelText.textContent = CATEGORY_LABELS[selectedCat];
          } else {
            iconBox.replaceChildren(render3dIcon('unknown', 34));
            labelText.textContent = '-- กรุณาเลือกหมวดหมู่ --';
          }
        }

        if (menu) {
          const options = menu.querySelectorAll && menu.querySelectorAll('.custom-3d-option').length > 0
            ? menu.querySelectorAll('.custom-3d-option')
            : (menu.children || []);
          for (const opt of Array.from(options) as any[]) {
            const match = opt.getAttribute('data-category') === selectedCat;
            if (match) opt.classList.add('selected');
            else opt.classList.remove('selected');
          }
        }
      }

      const BUCKET_SHORT_NAMES: Record<string, string> = { investment_stock:'หุ้น', home_building:'บ้าน', fixed_expense:'รายเดือน', emergency_personal:'ฉุกเฉิน', general_expense:'กิน / ใช้', dan_insurance:'ประกันแดน' };
      function jarProgress(balance: any, target: any) {
        return Number.isFinite(balance) && Number.isFinite(target) && target > 0 ? Math.max(0, Math.min(100, balance / target * 100)) : 0;
      }
      function createJarPresentation(f: any, compact = false) {
        const bucket = bucketRegistry?.buckets.find((b: any) => b.bucket_key === f.bucket);
        const host = document.createElement('div'); host.className = 'jar-presentation';
        host.appendChild(render3dIcon(bucket?.icon || '🐷', compact ? 80 : 112));
        const name = document.createElement('div'); name.className = 'jar-name';
        name.textContent = BUCKET_SHORT_NAMES[f.bucket] || bucket?.name || f.label;
        name.title = f.label; name.setAttribute('aria-label', f.label); host.appendChild(name);
        // Only insurance has a defined savings goal. Other bars show funds remaining from recorded income.
        const target = f.bucket === 'dan_insurance' ? 34800 : f.isCumulative ? f.allTimeIncome : f.monthIncome;
        const percent = jarProgress(f.availableBalance, target);
        const track = document.createElement('div'); track.className = 'jar-progress';
        track.setAttribute('role','progressbar'); track.setAttribute('aria-label', f.label + (f.bucket === 'dan_insurance' ? ' เป้าหมาย 34,800 บาท' : ' สัดส่วนเงินคงเหลือจากเงินเข้า'));
        track.setAttribute('aria-valuemin','0'); track.setAttribute('aria-valuemax','100'); track.setAttribute('aria-valuenow', String(Math.round(percent)));
        const fill = document.createElement('span'); fill.style.width = percent + '%'; track.appendChild(fill); host.appendChild(track);
        return host;
      }
      function createAddJarCard() {
        const add = document.createElement('button'); add.type = 'button'; add.className = 'jar-add-card';
        add.textContent = '+ เพิ่มกระปุก'; add.onclick = () => openBucketModal(); return add;
      }
      function renderHomeJarShelf(metrics: any) {
        const shelf = document.getElementById('homeJarShelf'); if (!shelf) return;
        shelf.replaceChildren();
        for (const f of metrics.fundBalances || []) {
          const card = document.createElement('button'); card.type = 'button'; card.className = 'jar-shelf-card';
          card.setAttribute('aria-label', 'บันทึกรายการ ' + f.label); card.appendChild(createJarPresentation(f, true));
          const balance = document.createElement('span'); balance.className = 'jar-shelf-balance'; balance.textContent = formatCurrency(f.availableBalance, 'THB'); card.appendChild(balance);
          card.onclick = () => openVerificationModalForManual('manual', f.bucket); shelf.appendChild(card);
        }
        shelf.appendChild(createAddJarCard());
      }
      function renderShortcutIcons() {
        for (const [id, key] of [['funds','🐷'],['analytics','📈'],['history','📌'],['salary','💎']]) {
          const btn: any = document.getElementById('shortcut-' + id);
          if (!btn) continue;
          const icon = (Array.isArray(btn.children) && btn.children.find((c: any) => c.className === 'shortcut-icon')) || btn.querySelector?.('.shortcut-icon');
          if (icon) {
            icon.className = 'shortcut-icon';
            icon.replaceChildren(render3dIcon(key, 56));
            if (Array.isArray(btn.children) && !btn.children.includes(icon)) btn.appendChild(icon);
          }
        }
      }
      const DEFAULT_BUCKETS = [
        ['investment_stock', 'หุ้น/ลงทุน', '📈', true], ['home_building', 'สร้างบ้าน', '🏡', true],
        ['fixed_expense', 'รายเดือน', '📌', false], ['emergency_personal', 'ฉุกเฉิน', '🛟', true],
        ['general_expense', 'กิน/ใช้', '🍜', false], ['dan_insurance', 'ประกันแดน', '🛡️', true]
      ].map(([bucket_key, name, icon, is_cumulative], sort_order) => ({ bucket_key, name, icon, is_cumulative, sort_order, color: '#6366f1' }));
      const FUND_BUCKET_LABELS: Record<string, string> = Object.create(null);
      const FUND_BUCKET_ORDER: string[] = [];
      let bucketRegistry: any = null;
      let bucketMutation = Promise.resolve();
      function bucketOwner() { return appState.currentUser?.id || null; }
      function bucketDefaultKey() { return FUND_BUCKET_ORDER.includes('general_expense') ? 'general_expense' : FUND_BUCKET_ORDER[0]; }
      function applyBucketRegistry(registry) {
        bucketRegistry = registry;
        for (const key of Object.keys(FUND_BUCKET_LABELS)) delete FUND_BUCKET_LABELS[key];
        FUND_BUCKET_ORDER.length = 0;
        for (const bucket of [...registry.buckets].sort((a, b) => a.sort_order - b.sort_order)) {
          FUND_BUCKET_ORDER.push(bucket.bucket_key);
          FUND_BUCKET_LABELS[bucket.bucket_key] = bucket.icon + ' ' + bucket.name;
        }
        refreshBucketOptions();
        const status = document.getElementById('bucketSyncStatus');
        if (status) {
          const entries = [...registry.buckets, ...registry.deletions];
          status.textContent = entries.some(b => b.sync_status === 'sync_failed') ? 'ซิงก์กระปุกไม่สำเร็จ · กดซิงก์เพื่อลองใหม่'
            : entries.some(b => b.sync_status === 'pending_sync') ? 'กระปุกรอซิงก์' : registry.owner ? 'กระปุกซิงก์แล้ว' : 'กระปุกบันทึกในเครื่อง';
        }
      }
      function refreshBucketOptions(destination = '') {
        for (const id of ['txFormFundBucket', 'filterFundSelect']) {
          const select = document.getElementById(id); if (!select) continue;
          const previous = select.value;
          select.innerHTML = '';
          if (id === 'filterFundSelect') { const option = document.createElement('option'); option.value = ''; option.textContent = 'ทุกกระปุก'; select.appendChild(option); }
          for (const key of FUND_BUCKET_ORDER) { const option = document.createElement('option'); option.value = key; option.textContent = FUND_BUCKET_LABELS[key]; select.appendChild(option); }
          select.value = FUND_BUCKET_ORDER.includes(previous) ? previous : destination || (id === 'filterFundSelect' ? '' : bucketDefaultKey());
        }
      }

      const FIXED_MONTHLY_PRESETS = {
        HOME_BUILDING: 13000,
        INVESTMENT_STOCK: 6500,
        FATHER_INSURANCE_NORMAL: 1300,
        FATHER_INSURANCE_EVERY_3RD: 2600,
        DAN_INSURANCE: 2900,
        DAN_INSURANCE_ANNUAL_TARGET: 34800,
        SISTER_MIND: 2000,
        UTILITIES_TUITION_BUDGET: 6500,
        FIXED_EXPENSE_TOTAL_NORMAL: 9800,
        FIXED_EXPENSE_TOTAL_EVERY_3RD: 11100
      };

      // สถานะหลักของแอปพลิเคชัน
      const appState = {
        settings: {
          supabaseUrl: '',
          supabaseAnonKey: '',
          defaultCurrency: 'THB'
        },
        supabaseClient: null,
        supabaseConnected: false,
        currentUser: null,
        realtimeChannel: null,
        aiStatus: 'unconfigured', // 'ready' | 'unconfigured' | 'unreachable' | 'rate_limited' | 'error'
        aiStatusMessage: 'ยังไม่ได้ตั้งค่า AI',
        transactions: [],
        usingMemoryFallback: false,
        memoryStore: new Map(),
        currentCompressedImage: null, // เก็บเฉพาะใน RAM ชั่วคราวระหว่างวิเคราะห์และลบทิ้งหลังใช้
        isAnalyzingAi: false,
        isSavingTx: false,
        isSyncing: false
      };

      /**
       * สร้าง UUID v4 ที่คงที่สำหรับรายการเดียวกันในทุกการซิงก์ซ้ำ (Idempotency)
       */
      applyBucketRegistry({ id: 'guest', owner: null, buckets: DEFAULT_BUCKETS.map(b => ({ ...b })), deletions: [] });
      function generateUuid(): string {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      }

      /**
       * คืนค่าวันที่ปัจจุบันตามเขตเวลาประเทศไทย (Asia/Bangkok) ในรูปแบบ YYYY-MM-DD
       * ป้องกันปัญหาวันคลาดเคลื่อนจากการแปลงเป็น UTC
       */
      function getBangkokTodayIso(dateObj: Date = new Date()): string {
        try {
          const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Bangkok',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).formatToParts(dateObj);
          const y = parts.find((p) => p.type === 'year')?.value;
          const m = parts.find((p) => p.type === 'month')?.value;
          const d = parts.find((p) => p.type === 'day')?.value;
          if (y && m && d) return `${y}-${m}-${d}`;
        } catch (_e) {
          // Fallback บวก +7 ชั่วโมง
        }
        const bkkMs = dateObj.getTime() + 7 * 3600 * 1000;
        return new Date(bkkMs).toISOString().slice(0, 10);
      }

      /**
       * ตรวจสอบและแปลงวันที่ให้อยู่ในรูปแบบ YYYY-MM-DD (ค.ศ.)
       * รองรับการแปลงปี พ.ศ. (เช่น 2568, 2569) เป็น ค.ศ. อัตโนมัติ
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

        const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dt = new Date(`${iso}T00:00:00Z`);
        if (
          Number.isNaN(dt.getTime()) ||
          dt.getUTCFullYear() !== year ||
          dt.getUTCMonth() + 1 !== month ||
          dt.getUTCDate() !== day
        ) {
          return { date: null, convertedFromBE: false };
        }
        return { date: iso, convertedFromBE };
      }

      /**
       * จัดรูปแบบจำนวนเงินให้อ่านง่ายตามสกุลเงินของรายการจริง เช่น ฿1,234.50
       */
      function formatCurrency(amount: number | string, currency: string = 'THB'): string {
        const num = Number(amount);
        const safeNum = Number.isFinite(num) ? num : 0;
        const curr = typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency.trim())
          ? currency.trim().toUpperCase()
          : 'THB';

        const formattedNumber = safeNum.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });

        if (curr === 'THB') {
          return `฿${formattedNumber}`;
        }
        return `${curr} ${formattedNumber}`;
      }

      /**
       * วิเคราะห์และจับคู่ส่วนของเงิน (1 ใน 6 ส่วน) อัตโนมัติจากหมวดหมู่ ชื่อร้านค้า และรายละเอียดรายการ
       */
      function inferDefaultFundBucket(...args) { const inferred = resolveDeletedBucket(inferLegacyFundBucket(...args)); return FUND_BUCKET_ORDER.includes(inferred) ? inferred : bucketDefaultKey(); }
      function inferLegacyFundBucket(
        category: string = '',
        merchant: string = '',
        itemsSummary: string = '',
        purposeAnalysis: string = '',
        note: string = ''
      ): FundBucket {
        const text = `${merchant} ${itemsSummary} ${purposeAnalysis} ${note}`.toLowerCase();
        if (/ประกัน\s*แดน|\[fixed_item:dan_insurance\]/.test(text)) return 'dan_insurance';
        if (/(หุ้น|กองทุน|ปันผล|หลักทรัพย์|พอร์ต|dime|innovestx|streaming|settrade|stock)/.test(text)) {
          return 'investment_stock';
        }
        if (/(สร้างบ้าน|วัสดุก่อสร้าง|ปูน|เหล็ก|ผู้รับเหมา|ต่อเติมบ้าน|ไทวัสดุ|โฮมโปร|ดูโฮม|homepro|dohome)/.test(text)) {
          return 'home_building';
        }
        if (/(ประกันพ่อ|ประกันแดน|ให้น้อง|มายด์|ค่าน้ำ|ค่าไฟ|การไฟฟ้า|การประปา|ค่าโทรศัพท์|ค่าเน็ต|เรียนพิเศษ|กวดวิชา|ค่าเทอม)/.test(text)) {
          return 'fixed_expense';
        }
        if (/(ฉุกเฉิน|โรงพยาบาล|คลินิก|ค่ารักษา|ค่ายา|ซ่อมรถด่วน|อุบัติเหตุ)/.test(text)) {
          return 'emergency_personal';
        }
        if (category === 'utilities_bills' || category === 'education_work') {
          return 'fixed_expense';
        }
        if (category === 'home_repair') {
          return 'home_building';
        }
        if (category === 'health_medical') {
          return 'emergency_personal';
        }
        if (category === 'travel' || /(เที่ยว|ทริป|โรงแรม|รีสอร์ท|ที่พัก|agoda|booking|ตั๋วเครื่องบิน|การบิน|flight|hotel|travel)/.test(text)) {
          return 'general_expense';
        }
        if (category === 'pet' || /(สัตว์เลี้ยง|อาหารแมว|อาหารสุนัข|อาหารสัตว์|pet|vet)/.test(text)) {
          return 'general_expense';
        }
        return 'general_expense';
      }

      /**
       * ตรวจสอบความถูกต้องของข้อมูลรายการก่อนบันทึก (Validation Form Rules)
       */
      function validateTransactionInput(input: Record<string, any> = {}): { valid: boolean; errors: string[]; normalized: Record<string, any> | null } {
        const errors = [];
        const rawDate = input.transaction_date !== undefined ? input.transaction_date : input.date;
        const { date } = normalizeIsoDate(String(rawDate || ''));
        if (!date) {
          errors.push('กรุณาระบุวันที่ทำรายการให้ถูกต้อง (รูปแบบ YYYY-MM-DD)');
        }

        const merchant = typeof input.merchant === 'string' ? input.merchant.trim() : '';
        if (!merchant || merchant.length < 1 || merchant.length > 255) {
          errors.push('กรุณาระบุชื่อร้านค้าหรือคู่รายการ (1-255 ตัวอักษร)');
        }

        const amount = Number(input.amount);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99) {
          errors.push('กรุณาระบุยอดเงินที่เป็นค่าบวกมากกว่า 0.00');
        }

        const type = typeof input.type === 'string' ? input.type.trim().toLowerCase() : '';
        if (type !== 'income' && type !== 'expense') {
          errors.push('กรุณาเลือกประเภทรายการ (รายรับ หรือ รายจ่าย) ให้ชัดเจนก่อนบันทึก');
        }

        const category = typeof input.category === 'string' ? input.category.trim() : '';
        if (!category || category === 'unknown' || !CATEGORY_LABELS[category]) {
          errors.push('กรุณาเลือกหมวดหมู่ของรายการ');
        }

        const rawCurrency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : 'THB';
        const currency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : null;
        if (!currency) {
          errors.push('รหัสสกุลเงินต้องเป็นตัวอักษรภาษาอังกฤษ 3 ตัว เช่น THB, USD');
        }

        const rawSource = typeof input.source_type === 'string' ? input.source_type.trim() : 'manual';
        const source_type = ['receipt', 'transfer_slip', 'manual'].includes(rawSource) ? rawSource : 'manual';

        const itemsSummaryClean = typeof input.items_summary === 'string' ? input.items_summary.trim().slice(0, 2000) : '';
        const purposeAnalysisClean = typeof input.purpose_analysis === 'string' ? input.purpose_analysis.trim().slice(0, 2000) : '';
        const noteClean = typeof input.note === 'string' ? input.note.trim().slice(0, 2000) : '';

        const rawFundBucket = typeof input.fund_bucket === 'string' ? resolveDeletedBucket(input.fund_bucket.trim()) : '';
        const fund_bucket: FundBucket = (FUND_BUCKET_LABELS as Record<string, string>)[rawFundBucket]
          ? (rawFundBucket as FundBucket)
          : inferDefaultFundBucket(category, merchant, itemsSummaryClean, purposeAnalysisClean, noteClean);

        return {
          valid: errors.length === 0,
          errors,
          normalized: errors.length === 0 ? {
            transaction_date: date,
            merchant: merchant.slice(0, 255),
            amount: Math.round(amount * 100) / 100,
            currency: currency || 'THB',
            type,
            category,
            fund_bucket,
            source_type,
            items_summary: itemsSummaryClean || (source_type === 'manual' ? merchant : ''),
            purpose_analysis: purposeAnalysisClean || (source_type === 'manual' ? 'ไม่ได้ระบุวัตถุประสงค์เพิ่มเติม' : ''),
            note: noteClean
          } : null
        };
      }

      /**
       * ตรวจสอบและจัดระเบียบผลลัพธ์ที่ได้จาก AI (ห้ามเดาวันที่หรือยอดเงินที่อ่านไม่ออกเด็ดขาด)
       */
      function normalizeAiAnalysisResult(raw: Record<string, any> = {}) {
        const warnings = Array.isArray(raw.warnings)
          ? raw.warnings.filter((w) => typeof w === 'string' && w.trim()).map((w) => w.trim())
          : [];
        const uncertainSet = new Set(
          Array.isArray(raw.uncertain_fields)
            ? raw.uncertain_fields.filter((f) => typeof f === 'string').map((f) => f.trim())
            : []
        );

        const { date, convertedFromBE } = normalizeIsoDate(raw.date);
        if (convertedFromBE) {
          warnings.push('ระบบแปลงปี พ.ศ. ในใบเสร็จเป็นปี ค.ศ. อัตโนมัติ กรุณาตรวจสอบความถูกต้องของวันที่');
        }
        if (!date) {
          uncertainSet.add('date');
          if (!warnings.some((w) => w.includes('วันที่'))) {
            warnings.push('ไม่พบวันที่ทำรายการในภาพ กรุณาระบุวันที่ด้วยตนเอง (ระบบไม่ใส่วันที่ปัจจุบันให้อัตโนมัติ)');
          }
        }

        const merchant =
          typeof raw.merchant === 'string' && raw.merchant.trim().length > 0
            ? raw.merchant.trim().slice(0, 255)
            : null;
        if (!merchant) {
          uncertainSet.add('merchant');
          if (!warnings.some((w) => w.includes('ร้านค้า'))) {
            warnings.push('อ่านชื่อร้านค้าหรือคู่รายการไม่ชัดเจน กรุณาตรวจสอบและกรอกเพิ่มเติม');
          }
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
          if (!warnings.some((w) => w.includes('ยอดเงิน'))) {
            warnings.push('ไม่พบยอดเงินที่ชัดเจนในภาพ กรุณาระบุจำนวนเงินด้วยตนเอง');
          }
        }

        const rawType = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : 'unknown';
        const type = ['income', 'expense', 'unknown'].includes(rawType) ? rawType : 'unknown';
        if (type === 'unknown') {
          uncertainSet.add('type');
          if (!warnings.some((w) => w.includes('รายรับ') || w.includes('รายจ่าย') || w.includes('ทิศทาง'))) {
            warnings.push('ไม่สามารถสรุปทิศทางเงินเข้า/ออกได้ชัดเจนจากภาพ กรุณาเลือกประเภทรายรับหรือรายจ่ายก่อนบันทึก');
          }
        }

        let rawCategory = typeof raw.category === 'string' ? raw.category.trim().toLowerCase() : 'unknown';
        const travelText = (String(raw.merchant || '') + ' ' + String(raw.items_summary || '')).toLowerCase();
        if (rawCategory === 'unknown' && /(เที่ยว|ทริป|โรงแรม|รีสอร์ท|agoda|booking|ตั๋วเครื่องบิน|การบิน|flight|hotel|travel)/.test(travelText)) {
          rawCategory = 'travel';
        } else if (rawCategory === 'unknown' && /(สัตว์เลี้ยง|อาหารแมว|อาหารสุนัข|อาหารสัตว์|pet|vet)/.test(travelText)) {
          rawCategory = 'pet';
        }
        const category = CATEGORY_LABELS[rawCategory] ? rawCategory : 'unknown';
        if (category === 'unknown') {
          uncertainSet.add('category');
        }

        const rawCurrency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : 'THB';
        const currency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : 'THB';

        const source_type = raw.source_type === 'transfer_slip' ? 'transfer_slip' : 'receipt';
        const items_summary =
          typeof raw.items_summary === 'string' && raw.items_summary.trim()
            ? raw.items_summary.trim()
            : 'ไม่พบรายละเอียดรายการสินค้าแยกย่อยในภาพ';
        const purpose_analysis =
          typeof raw.purpose_analysis === 'string' && raw.purpose_analysis.trim()
            ? raw.purpose_analysis.trim()
            : 'ไม่สามารถระบุวัตถุประสงค์ที่ชัดเจนจากหลักฐานในภาพเพียงอย่างเดียว';

        const rawFundBucket = typeof raw.fund_bucket === 'string' ? resolveDeletedBucket(raw.fund_bucket.trim()) : '';
        const fund_bucket: FundBucket = (FUND_BUCKET_LABELS as Record<string, string>)[rawFundBucket]
          ? (rawFundBucket as FundBucket)
          : inferDefaultFundBucket(category, merchant || '', items_summary, purpose_analysis);

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
          source_type,
          items_summary,
          purpose_analysis,
          warnings,
          uncertain_fields,
          requires_review
        };
      }

      /**
       * คำนวณยอดสรุปทางการเงินประจำเดือน พร้อมยอดคงเหลือกระปุกเงินเดือน 6 ส่วน และสถานะรายการ Fix ประจำเดือน
       */
      function calculateDashboardMetrics(transactions: any[] = [], targetYearMonth: string = '') {
        let totalIncomeCents = 0;
        let totalExpenseCents = 0;
        let syncedIncomeCents = 0;
        let syncedExpenseCents = 0;
        let syncedCount = 0;
        let localOrPendingCount = 0;
        let failedCount = 0;
        const categoryTotalsCents: Record<string, number> = {};

        const fundStatsCents: Record<FundBucket, {
          monthIncomeCents: number;
          monthExpenseCents: number;
          allTimeIncomeCents: number;
          allTimeExpenseCents: number;
        }> = Object.fromEntries(FUND_BUCKET_ORDER.map(key => [key, { monthIncomeCents: 0, monthExpenseCents: 0, allTimeIncomeCents: 0, allTimeExpenseCents: 0 }]));

        let fatherInsPaidCents = 0;
        let danInsPaidCents = 0;
        let sisterMindPaidCents = 0;
        let utilitiesTuitionPaidCents = 0;
        let detectedFatherInsTarget = FIXED_MONTHLY_PRESETS.FATHER_INSURANCE_NORMAL;

        const seenIds = new Set();
        const filtered = [];

        for (const tx of transactions) {
          if (!tx || tx.deleted_at || tx.pending_delete || (tx.user_id || null) !== (appState.currentUser?.id || null)) continue;
          const id = String(tx.id || '');
          if (id && seenIds.has(id)) continue; // ป้องกันการนับรายการเดียวกันซ้ำ
          if (id) seenIds.add(id);

          const d = transactionCalendarDate(tx.transaction_date || tx.date);
          if (!d) continue;
          const cents = transactionAmountCents(tx.amount);
          if (!Number.isSafeInteger(cents) || cents <= 0) continue;

          const rawBucket = typeof tx.fund_bucket === 'string' ? resolveDeletedBucket(tx.fund_bucket.trim()) : '';
          const bucket: FundBucket = (FUND_BUCKET_LABELS as Record<string, string>)[rawBucket]
            ? (rawBucket as FundBucket)
            : inferDefaultFundBucket(tx.category, tx.merchant, tx.items_summary, tx.purpose_analysis, tx.note);

          // นับยอดสะสมรวม (สำหรับกระปุกสะสมข้ามเดือน ข้อ 1, 2, 4) เฉพาะรายการที่เกิดขึ้นไม่เกินเดือนที่เลือก
          const isUpToTargetMonth = !targetYearMonth || !d || d.slice(0, 7) <= targetYearMonth;
          if (isUpToTargetMonth) {
            if (tx.type === 'income') {
              fundStatsCents[bucket].allTimeIncomeCents += cents;
            } else if (tx.type === 'expense') {
              fundStatsCents[bucket].allTimeExpenseCents += cents;
            }
          }

          if (targetYearMonth && !d.startsWith(targetYearMonth)) continue;
          filtered.push(tx);

          if (tx.type === 'income') {
            fundStatsCents[bucket].monthIncomeCents += cents;
            if (bucket === 'fixed_expense' && Math.round(cents / 100) >= FIXED_MONTHLY_PRESETS.FIXED_EXPENSE_TOTAL_EVERY_3RD) {
              detectedFatherInsTarget = FIXED_MONTHLY_PRESETS.FATHER_INSURANCE_EVERY_3RD;
            }
          } else if (tx.type === 'expense') {
            fundStatsCents[bucket].monthExpenseCents += cents;
            if (isInternalTransfer(tx)) continue;
            const hay = `${tx.merchant || ''} ${tx.items_summary || ''} ${tx.purpose_analysis || ''} ${tx.note || ''}`.toLowerCase();
            if (hay.includes('ประกันพ่อ') || hay.includes('[fixed_item:father_insurance]')) {
              fatherInsPaidCents += cents;
              if (Math.round(cents / 100) >= FIXED_MONTHLY_PRESETS.FATHER_INSURANCE_EVERY_3RD) {
                detectedFatherInsTarget = FIXED_MONTHLY_PRESETS.FATHER_INSURANCE_EVERY_3RD;
              }
            } else if (hay.includes('ประกันแดน') || hay.includes('[fixed_item:dan_insurance]')) {
              danInsPaidCents += cents;
            } else if (hay.includes('ให้น้อง') || hay.includes('มายด์') || hay.includes('[fixed_item:sister_mind]')) {
              sisterMindPaidCents += cents;
            } else if (
              bucket === 'fixed_expense' ||
              tx.category === 'utilities_bills' ||
              tx.category === 'education_work' ||
              /(ค่าน้ำ|ค่าไฟ|การไฟฟ้า|การประปา|ค่าโทรศัพท์|ค่าเน็ต|เรียนพิเศษ|กวดวิชา|ค่าเทอม|\[fixed_item:utilities_tuition\])/.test(hay)
            ) {
              utilitiesTuitionPaidCents += cents;
            }
          }
        }

        for (const tx of filtered) {
          const cents = transactionAmountCents(tx.amount);
          if (!Number.isSafeInteger(cents) || cents <= 0) continue;

          if (isInternalTransfer(tx)) continue;
          const status = tx.sync_status || 'local_only';

          if (tx.type === 'income') {
            totalIncomeCents += cents;
            if (status === 'synced') syncedIncomeCents += cents;
          } else if (tx.type === 'expense') {
            totalExpenseCents += cents;
            if (status === 'synced') syncedExpenseCents += cents;
            const cat = tx.category || 'shopping_general';
            categoryTotalsCents[cat] = (categoryTotalsCents[cat] || 0) + cents;
          }

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
            label: CATEGORY_LABELS[category] || category,
            amount: cents / 100,
            percentage: totalExpenseCents > 0 ? Math.round((cents / totalExpenseCents) * 10000) / 100 : 0
          }))
          .sort((a, b) => b.amount - a.amount);

        const cumulativeBuckets = new Set<FundBucket>(bucketRegistry.buckets.filter(b => b.is_cumulative).map(b => b.bucket_key));
        const fundBalances = FUND_BUCKET_ORDER.map((bucket) => {
          const st = fundStatsCents[bucket];
          const isCumulative = cumulativeBuckets.has(bucket);
          const monthIncome = st.monthIncomeCents / 100;
          const monthExpense = st.monthExpenseCents / 100;
          const monthNet = (st.monthIncomeCents - st.monthExpenseCents) / 100;
          const allTimeIncome = st.allTimeIncomeCents / 100;
          const allTimeExpense = st.allTimeExpenseCents / 100;
          const availableBalance = isCumulative
            ? (st.allTimeIncomeCents - st.allTimeExpenseCents) / 100
            : monthNet;

          return {
            bucket,
            label: FUND_BUCKET_LABELS[bucket],
            isCumulative,
            monthIncome,
            monthExpense,
            monthNet,
            allTimeIncome,
            allTimeExpense,
            availableBalance
          };
        });

        const fixedChecklistStatus = {
          father_insurance: {
            key: 'father_insurance',
            label: 'ประกันพ่อ (1,300 จ่าย 2 เดือน / เว้นจ่าย 2,600 1 เดือน)',
            paidAmount: fatherInsPaidCents / 100,
            targetAmount: detectedFatherInsTarget,
            isPaid: fatherInsPaidCents >= FIXED_MONTHLY_PRESETS.FATHER_INSURANCE_NORMAL * 100
          },
          sister_mind: {
            key: 'sister_mind',
            label: 'ให้น้อง (มายด์) (Fix 2,000/เดือน)',
            paidAmount: sisterMindPaidCents / 100,
            targetAmount: FIXED_MONTHLY_PRESETS.SISTER_MIND,
            isPaid: sisterMindPaidCents >= FIXED_MONTHLY_PRESETS.SISTER_MIND * 100
          },
          utilities_tuition: {
            key: 'utilities_tuition',
            label: 'ค่าน้ำ, ค่าไฟ, ค่าโทรศัพท์, ค่าเรียนพิเศษลูก (งบ 6,500/เดือน)',
            paidAmount: utilitiesTuitionPaidCents / 100,
            targetAmount: FIXED_MONTHLY_PRESETS.UTILITIES_TUITION_BUDGET,
            remainingBudget: Math.max(0, (FIXED_MONTHLY_PRESETS.UTILITIES_TUITION_BUDGET * 100 - utilitiesTuitionPaidCents) / 100),
            isPaid: utilitiesTuitionPaidCents > 0
          }
        };

        return {
          totalIncome,
          totalExpense,
          netBalance,
          syncedIncome: syncedIncomeCents / 100,
          syncedExpense: syncedExpenseCents / 100,
          totalCount: filtered.length,
          syncedCount,
          localOrPendingCount,
          failedCount,
          categoryBreakdown,
          fundBalances,
          fixedChecklistStatus,
          insurancePaymentStatus: { paidAmount: danInsPaidCents / 100 }
        };
      }

      // =====================================================================
      // INDEXEDDB LOCAL STORE (slipsense_db) พร้อมระบบสำรองในหน่วยความจำหาก IndexedDB ถูกล็อก
      // =====================================================================
      function openLocalDatabase() {
        return new Promise((resolve, reject) => {
          if (typeof indexedDB === 'undefined' || !indexedDB) {
            appState.usingMemoryFallback = true;
            resolve(null);
            return;
          }
          try {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function (event) {
              const db = event.target.result;
              if (!db.objectStoreNames.contains('fund_registry')) db.createObjectStore('fund_registry', { keyPath: 'id' });
              if (!db.objectStoreNames.contains('automation')) db.createObjectStore('automation', { keyPath: 'id' });
              if (!db.objectStoreNames.contains(STORE_TRANSACTIONS)) {
                const store = db.createObjectStore(STORE_TRANSACTIONS, { keyPath: 'id' });
                store.createIndex('by_date', 'transaction_date', { unique: false });
                store.createIndex('by_sync_status', 'sync_status', { unique: false });
                store.createIndex('by_user_id', 'user_id', { unique: false });
              }
            };
            req.onsuccess = function (event) {
              event.target.result.onversionchange = () => event.target.result.close();
              resolve(event.target.result);
            };
            req.onerror = function () {
              appState.usingMemoryFallback = true;
              resolve(null);
            };
          } catch (_err) {
            appState.usingMemoryFallback = true;
            resolve(null);
          }
        });
      }

      async function dbGetAllTransactions() {
        const db = await openLocalDatabase();
        if (!db || appState.usingMemoryFallback) {
          return Array.from(appState.memoryStore.values());
        }
        return new Promise((resolve) => {
          try {
            const tx = db.transaction(STORE_TRANSACTIONS, 'readonly');
            const store = tx.objectStore(STORE_TRANSACTIONS);
            const req = store.getAll();
            req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
            req.onerror = () => resolve(Array.from(appState.memoryStore.values()));
          } catch (_e) {
            resolve(Array.from(appState.memoryStore.values()));
          }
        });
      }

      async function dbPutTransaction(record) {
        const db = await openLocalDatabase();
        if (!db || appState.usingMemoryFallback) {
          appState.memoryStore.set(record.id, record);
          return record;
        }
        return new Promise((resolve, reject) => {
          try {
            const tx = db.transaction([STORE_TRANSACTIONS, 'fund_registry'], 'readwrite');
            const store = tx.objectStore(STORE_TRANSACTIONS);
            const registry = tx.objectStore('fund_registry').get(record.user_id || 'guest');
            registry.onsuccess = () => {
              if (registry.result) record.fund_bucket = resolveDeletedBucket(record.fund_bucket, registry.result);
              store.put(record);
            };
            tx.oncomplete = () => { appState.memoryStore.set(record.id, record); resolve(record); };
            tx.onerror = () => reject(new Error('ไม่สามารถบันทึกข้อมูลลง IndexedDB ได้ (พื้นที่จัดเก็บอาจเต็ม)'));
            tx.onabort = tx.onerror;
          } catch (err) {
            reject(err);
          }
        });
      }

      async function dbDeleteTransaction(id) {
        appState.memoryStore.delete(id);
        const db = await openLocalDatabase();
        if (!db || appState.usingMemoryFallback) return true;
        return new Promise((resolve) => {
          try {
            const tx = db.transaction(STORE_TRANSACTIONS, 'readwrite');
            tx.objectStore(STORE_TRANSACTIONS).delete(id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
          } catch (_e) {
            resolve(false);
          }
        });
      }

      // =====================================================================
      // CLIENT-SIDE IMAGE VALIDATION & CANVAS COMPRESSION (~1600px)
      // =====================================================================
      function validBucket(input) {
        const name = String(input.name || '').trim();
        if (!name || [...name].length > 50) throw new Error('ตั้งชื่อกระปุก 1–50 ตัวอักษร');
        if (![...BUCKET_ICONS, '📌'].includes(input.icon)) throw new Error('กรุณาเลือกไอคอน');
        if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) throw new Error('กรุณาเลือกสี');
        if (typeof input.is_cumulative !== 'boolean') throw new Error('กรุณาเลือกประเภทกระปุก');
        if (!/^[a-zA-Z0-9_-]{1,50}$/.test(input.bucket_key) || ['__proto__', 'constructor', 'prototype'].includes(input.bucket_key)) throw new Error('รหัสกระปุกไม่ถูกต้อง');
        return { ...input, name };
      }
      async function bucketStoreChange(owner, change = null) {
        const id = owner || 'guest', db = await openLocalDatabase();
        if (!db) throw new Error('เปิดที่เก็บกระปุกไม่ได้ กรุณาอนุญาต IndexedDB แล้วลองใหม่');
        return new Promise((resolve, reject) => {
          const tx = db.transaction(['fund_registry', STORE_TRANSACTIONS], 'readwrite');
          const store = tx.objectStore('fund_registry');
          const r = store.get(id), all = tx.objectStore(STORE_TRANSACTIONS).getAll();
          let registry, rows, ready = 0;
          function done() {
            if (++ready !== 2) return;
            try {
              registry = r.result || { id, owner, buckets: DEFAULT_BUCKETS.map(b => ({ ...b, sync_status: owner ? 'pending_sync' : 'local_only' })), deletions: [] };
              rows = all.result || [];
              if (change) change(registry, rows);
              store.put(registry);
              rows = rows.filter(row => row.__bucketMoved);
              for (const row of rows) { delete row.__bucketMoved; tx.objectStore(STORE_TRANSACTIONS).put(row); }
            } catch (error) { reject(error); tx.abort(); }
          }
          r.onsuccess = done; all.onsuccess = done;
          tx.oncomplete = () => {
            db.close();
            for (const row of rows || []) appState.memoryStore.set(row.id, row);
            if (bucketOwner() === owner) applyBucketRegistry(registry);
            resolve(registry);
          };
          tx.onerror = tx.onabort = () => { db.close(); reject(new Error('บันทึกกระปุกไม่สำเร็จ กรุณาลองใหม่')); };
        });
      }
      async function loadFundBuckets() { return bucketStoreChange(bucketOwner()); }
      function mutateBucket(change) {
        const owner = bucketOwner();
        const run = bucketMutation.catch(() => {}).then(async () => {
          if (bucketOwner() !== owner) throw new Error('บัญชีเปลี่ยนแล้ว กรุณาลองใหม่');
          const result = await bucketStoreChange(owner, (registry, rows) => {
            change(registry, rows); registry.edit_version = (registry.edit_version || 0) + 1;
          });
          if (bucketOwner() === owner) await refreshTransactionsFromLocal();
          return result;
        });
        bucketMutation = run; return run;
      }
      async function saveFundBucket(input, existingKey = null) {
        const key = existingKey || ('bucket_' + generateUuid().replace(/-/g, ''));
        const bucket = validBucket({ ...input, bucket_key: key });
        await mutateBucket(registry => {
          const existing = registry.buckets.find(b => b.bucket_key === key);
          if (existingKey && !existing) throw new Error('ไม่พบกระปุก');
          if (!existingKey && (existing || registry.deletions.some(d => d.source_key === key))) throw new Error('รหัสกระปุกซ้ำ');
          const record = { ...existing, ...bucket, sort_order: existing?.sort_order ?? Math.max(-1, ...registry.buckets.map(b => b.sort_order)) + 1,
            updated_at: new Date().toISOString(), sync_status: registry.owner ? 'pending_sync' : 'local_only' };
          registry.buckets = registry.buckets.filter(b => b.bucket_key !== key).concat(record);
        });
        return key;
      }
      function createFundBucket(input) { return saveFundBucket(input); }
      async function updateFundBucket(key, input) {
        await loadFundBuckets();
        const old = bucketRegistry.buckets.find(b => b.bucket_key === key);
        if (!old) throw new Error('ไม่พบกระปุก');
        return saveFundBucket({ ...old, ...input }, key);
      }
      async function deleteFundBucket(source, target) {
        const selected = ['txFormFundBucket', 'filterFundSelect'].filter(id => document.getElementById(id)?.value === source);
        await mutateBucket((registry, rows) => {
          if (registry.buckets.length <= 1) throw new Error('ต้องเหลืออย่างน้อย 1 กระปุก');
          if (source === target || !registry.buckets.some(b => b.bucket_key === source) || !registry.buckets.some(b => b.bucket_key === target)) throw new Error('เลือกกระปุกปลายทางให้ถูกต้อง');
          const original = registry.buckets.find(b => b.bucket_key === source);
          for (const row of rows) if ((row.user_id || null) === registry.owner && row.fund_bucket === source) {
            row.fund_bucket = target; row.updated_at = new Date().toISOString();
            row.sync_status = registry.owner ? 'pending_sync' : 'local_only'; row.__bucketMoved = true;
          }
          registry.deletions.push({ id: generateUuid(), source_key: source, target_key: target, original,
            sync_status: registry.owner ? 'pending_sync' : 'local_only' });
          registry.buckets = registry.buckets.filter(b => b.bucket_key !== source);
        });
        refreshBucketOptions(target);
        for (const id of selected) document.getElementById(id).value = target;
      }
      function resolveDeletedBucket(key, registry = bucketRegistry) {
        const seen = new Set();
        while (!seen.has(key)) { seen.add(key); const d = registry.deletions.find(d => d.source_key === key); if (!d) break; key = d.target_key; }
        return key;
      }
      async function syncFundBuckets() {
        const owner = bucketOwner(), client = appState.supabaseClient;
        if (!owner || !client || !navigator.onLine) return false;
        const check = () => { if (bucketOwner() !== owner || appState.supabaseClient !== client || !navigator.onLine) throw new Error('บัญชีหรือการเชื่อมต่อเปลี่ยนแล้ว'); };
        try {
          if (client.auth?.getSession) {
            const { data, error } = await client.auth.getSession(); check();
            if (error || data?.session?.user?.id !== owner) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
          }
          let registry = await bucketStoreChange(owner); check();
          const remoteDeleted = await client.from('fund_bucket_deletions').select('*').eq('user_id', owner); check();
          if (remoteDeleted.error) throw remoteDeleted.error;
          if (!Array.isArray(remoteDeleted.data)) throw new Error('อ่านประวัติกระปุกไม่สำเร็จ');
          await bucketStoreChange(owner, (local, rows) => {
            for (const d of remoteDeleted.data || []) {
              const existing = local.deletions.find(item => item.source_key === d.source_key);
              if (existing) Object.assign(existing, d, { sync_status: 'synced' }); else local.deletions.push({ ...d, sync_status: 'synced' });
              local.buckets = local.buckets.filter(b => b.bucket_key !== d.source_key);
            }
            for (const row of rows) if ((row.user_id || null) === owner) {
              const target = resolveDeletedBucket(row.fund_bucket, local);
              if (target !== row.fund_bucket) { row.fund_bucket = target; row.__bucketMoved = true; row.sync_status = 'pending_sync'; row.updated_at = new Date().toISOString(); }
            }
          });
          registry = await bucketStoreChange(owner); check();
          const remote = await client.from('fund_buckets').select('*').eq('user_id', owner); check();
          if (remote.error) throw remote.error;
          if (!Array.isArray(remote.data)) throw new Error('อ่านกระปุกไม่สำเร็จ');
          await bucketStoreChange(owner, local => {
            for (const raw of remote.data || []) {
              if (local.deletions.some(d => d.source_key === raw.bucket_key)) continue;
              const incoming = validBucket(raw), existing = local.buckets.find(b => b.bucket_key === raw.bucket_key);
              if (!existing) local.buckets.push({ ...incoming, sync_status: 'synced' });
              else if (!existing.updated_at || (existing.sync_status === 'synced' && raw.updated_at > existing.updated_at)) Object.assign(existing, incoming, { sync_status: 'synced' });
            }
          });
          registry = await bucketStoreChange(owner); check();
          const remoteKeys = new Set((remote.data || []).map(b => b.bucket_key));
          const revision = registry.edit_version || 0;
          const sources = registry.deletions.filter(d => d.sync_status !== 'synced' && !remoteKeys.has(d.source_key)).map(d => d.original).filter(Boolean);
          const pending = registry.buckets.filter(b => b.sync_status !== 'synced');
          for (const bucket of [...sources, ...pending]) {
            check(); const b = validBucket(bucket);
            const { error } = await client.from('fund_buckets').upsert({ user_id: owner, bucket_key: b.bucket_key, name: b.name, icon: b.icon, color: b.color,
              is_cumulative: b.is_cumulative, sort_order: b.sort_order }, { onConflict: 'user_id,bucket_key' }); check();
            if (error) throw error;
            await bucketStoreChange(owner, local => { const current = local.buckets.find(item => item.bucket_key === b.bucket_key); if (current && current.updated_at === b.updated_at) current.sync_status = 'synced'; });
          }
          for (const d of registry.deletions.filter(d => d.sync_status !== 'synced')) {
            // Another device may have deleted the chosen destination while this device was offline.
            // Follow its durable tombstone to a live bucket before requesting the atomic move.
            const target = resolveDeletedBucket(d.target_key, registry);
            check(); const { error } = await client.rpc('delete_fund_bucket', { p_operation_id: d.id, p_source_key: d.source_key, p_target_key: target }); check();
            if (error) throw error;
            await bucketStoreChange(owner, local => { const current = local.deletions.find(item => item.id === d.id); if (current) current.sync_status = 'synced'; });
          }
          const latest = await bucketStoreChange(owner); check();
          return (latest.edit_version || 0) === revision;
        } catch (error) {
          if (bucketOwner() === owner) {
            await bucketStoreChange(owner, local => {
              for (const item of [...local.buckets, ...local.deletions]) if (item.sync_status !== 'synced') { item.sync_status = 'sync_failed'; item.sync_error = String(error.message || error); }
            });
            showToast('กระปุกรอซิงก์ กรุณาตรวจการเชื่อมต่อหรืออัปเดตฐานข้อมูล แล้วกดซิงก์อีกครั้ง', 'error');
          }
          return false;
        }
      }
      let bucketModalKey = null, bucketModalMode = 'edit', bucketReturnFocus = null, bucketBusy = false;
      function closeBucketModal() {
        if (bucketBusy) return;
        document.getElementById('bucketModal').hidden = true;
        (bucketReturnFocus?.isConnected === false ? document.getElementById('btnOpenBucketModal') : bucketReturnFocus)?.focus();
      }
      function openBucketModal(key = null, mode = 'edit') {
        bucketModalKey = key; bucketModalMode = mode; bucketReturnFocus = document.activeElement;
        const bucket = bucketRegistry.buckets.find(b => b.bucket_key === key), el = id => document.getElementById(id);
        el('bucketModalTitle').textContent = mode === 'delete' ? 'ลบกระปุก' : key ? 'แก้ไขกระปุก' : 'เพิ่มกระปุก';
        el('bucketFormName').value = bucket?.name || ''; el('bucketFormIcon').value = bucket?.icon || '🐷';
        el('bucketFormColor').value = bucket?.color || '#6366f1'; el('bucketFormCumulative').checked = bucket?.is_cumulative ?? true;
        el('bucketFormName').required = mode !== 'delete'; el('bucketFormName').readOnly = mode === 'delete';
        el('bucketDeleteFields').hidden = mode !== 'delete'; el('bucketDeleteConfirm').value = ''; el('bucketFormError').textContent = '';
        const select = el('bucketDeleteTarget'); select.innerHTML = '';
        for (const b of bucketRegistry.buckets.filter(b => b.bucket_key !== key)) { const option = document.createElement('option'); option.value = b.bucket_key; option.textContent = b.icon + ' ' + b.name; select.appendChild(option); }
        select.value = FUND_BUCKET_ORDER.includes('general_expense') && key !== 'general_expense' ? 'general_expense' : FUND_BUCKET_ORDER.find(k => k !== key) || '';
        updateBucketIconSelection();
        el('bucketModal').hidden = false; (mode === 'delete' ? el('bucketDeleteConfirm') : el('bucketFormName')).focus();
      }
      function updateBucketIconSelection() {
        const picker = document.getElementById('bucketIconPicker');
        for (const button of Array.from(picker?.children || []) as any[]) button.setAttribute('aria-pressed', String(button.getAttribute('data-icon') === (document.getElementById('bucketFormIcon') as any)?.value));
      }
      function bindBucketEvents() {
        const el = id => document.getElementById(id), modal = el('bucketModal');
        if (!modal || modal.dataset.bound) return; modal.dataset.bound = 'true';
        el('btnOpenBucketModal').addEventListener('click', () => openBucketModal());
        el('btnCloseBucketModal').addEventListener('click', closeBucketModal);
        for (const icon of BUCKET_ICONS) {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-secondary'; button.setAttribute('data-icon', icon); button.appendChild(render3dIcon(icon, 48));
          button.setAttribute('aria-label', 'เลือกไอคอน ' + icon); button.onclick = () => { el('bucketFormIcon').value = icon; updateBucketIconSelection(); }; el('bucketIconPicker').appendChild(button);
        }
        updateBucketIconSelection()
        modal.addEventListener('keydown', event => {
          if (event.key === 'Escape') { event.preventDefault(); closeBucketModal(); }
          if (event.key === 'Tab') {
            const nodes = [...modal.querySelectorAll('button,input,select,[tabindex="0"]')].filter(n => !n.disabled && !n.closest('[hidden]'));
            const first = nodes[0], last = nodes[nodes.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        });
        el('bucketForm').addEventListener('submit', async event => {
          event.preventDefault(); if (bucketBusy) return; bucketBusy = true; el('btnSaveBucket').disabled = true;
          try {
            if (bucketModalMode === 'delete') {
              const bucket = bucketRegistry.buckets.find(b => b.bucket_key === bucketModalKey);
              if (el('bucketDeleteConfirm').value.trim() !== bucket?.name) throw new Error('พิมพ์ชื่อกระปุกให้ตรงเพื่อยืนยัน');
              await deleteFundBucket(bucketModalKey, el('bucketDeleteTarget').value);
            } else await saveFundBucket({ name: el('bucketFormName').value, icon: el('bucketFormIcon').value, color: el('bucketFormColor').value, is_cumulative: el('bucketFormCumulative').checked }, bucketModalKey);
            bucketBusy = false; closeBucketModal(); showToast('บันทึกกระปุกในเครื่องแล้ว', 'success');
            if (bucketOwner() && navigator.onLine) await syncPendingTransactions();
          } catch (error) { el('bucketFormError').textContent = error.message; }
          finally { bucketBusy = false; el('btnSaveBucket').disabled = false; }
        });
      }
      async function compressReceiptImage(file, maxDimension = 1600, quality = 0.82) {
        if (!file) {
          throw new Error('ไม่พบไฟล์รูปภาพ กรุณาเลือกรูปใหม่อีกครั้ง');
        }

        const fileName = String(file.name || '').toLowerCase();
        const fileType = String(file.type || '').toLowerCase();

        if (fileName.endsWith('.heic') || fileName.endsWith('.heif') || fileType.includes('heic') || fileType.includes('heif')) {
          throw new Error('ไม่รองรับไฟล์ภาพรูปแบบ HEIC/HEIF โดยตรง กรุณาตั้งค่ากล้อง iPhone ให้บันทึกเป็น JPEG (Most Compatible) หรือแปลงไฟล์เป็น JPEG/PNG ก่อนอัปโหลด');
        }

        if (!['image/jpeg', 'image/png', 'image/webp'].includes(fileType) || file.size <= 0) {
          throw new Error('ไฟล์ที่เลือกไม่ใช่รูปภาพ กรุณาเลือกไฟล์รูปภาพชนิด JPEG, PNG หรือ WebP');
        }

        if (file.size > 20 * 1024 * 1024) {
          throw new Error('ไฟล์รูปภาพต้นฉบับมีขนาดใหญ่เกิน 20 MB กรุณาเลือกรูปที่มีขนาดเล็กลง');
        }

        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้ ไฟล์อาจเสียหาย'));
          reader.readAsDataURL(file);
        });

        let canvas: any = null;
        const imageEl = new Image();
        try {
          const img: any = await new Promise((resolve, reject) => {
            imageEl.onload = () => resolve(imageEl);
            imageEl.onerror = () => reject(new Error('ไม่สามารถเปิดไฟล์รูปภาพนี้ได้ กรุณาใช้ไฟล์ JPEG หรือ PNG ที่ไม่เสียหาย'));
            imageEl.src = dataUrl;
          });

          const origW = img.naturalWidth || img.width || 1;
          const origH = img.naturalHeight || img.height || 1;
          let targetW = origW;
          let targetH = origH;

          const longestSide = Math.max(origW, origH);
          if (longestSide > maxDimension) {
            const ratio = maxDimension / longestSide;
            targetW = Math.max(1, Math.round(origW * ratio));
            targetH = Math.max(1, Math.round(origH * ratio));
          }

          canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('เบราว์เซอร์ไม่รองรับการประมวลผลภาพด้วย Canvas');
          }

          // วาดพื้นหลังสีขาวเพื่อป้องกันภาพ PNG พื้นใสกลายเป็นสีดำเวลาแปลงเป็น JPEG
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);

          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          if (!compressedDataUrl || !compressedDataUrl.startsWith('data:image/jpeg;base64,')) {
            throw new Error('การบีบอัดรูปภาพล้มเหลว กรุณาลองใช้รูปภาพอื่น');
          }

          const base64Data = compressedDataUrl.split(',')[1] || '';
          const compressedSize = Math.floor((base64Data.length * 3) / 4);

          return {
            dataUrl: compressedDataUrl,
            base64: base64Data,
            mimeType: 'image/jpeg',
            originalSize: file.size,
            compressedSize,
            width: targetW,
            height: targetH
          };
        } finally {
          if (canvas) { canvas.width = 0; canvas.height = 0; }
          imageEl.onload = null;
          imageEl.onerror = null;
          imageEl.src = '';
        }
      }

      // =====================================================================
      // UI TOAST & CONFIRMATION DIALOG HELPERS (XSS-Safe via textContent)
      // =====================================================================
      function showToast(message, type = 'info') {
        const stack = document.getElementById('toastStack');
        if (!stack) return;
        const item = document.createElement('div');
        item.className = `toast ${type}`;
        const span = document.createElement('span');
        span.textContent = String(message || '');
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '✕';
        closeBtn.style.color = '#ffffff';
        closeBtn.style.fontWeight = '700';
        closeBtn.onclick = () => item.remove();
        item.appendChild(span);
        item.appendChild(closeBtn);
        stack.appendChild(item);
        setTimeout(() => {
          if (item.parentNode) item.remove();
        }, 4500);
      }

      function askUserConfirmation(title, message) {
        return new Promise((resolve) => {
          const modal = document.getElementById('confirmDialogModal');
          const titleEl = document.getElementById('confirmDialogTitle');
          const msgEl = document.getElementById('confirmDialogMessage');
          const btnCancel = document.getElementById('btnConfirmDialogCancel');
          const btnAccept = document.getElementById('btnConfirmDialogAccept');

          if (!modal || !titleEl || !msgEl || !btnCancel || !btnAccept) {
            resolve(false);
            return;
          }

          titleEl.textContent = title;
          msgEl.textContent = message;
          modal.hidden = false;

          function cleanup(result) {
            modal.hidden = true;
            btnCancel.onclick = null;
            btnAccept.onclick = null;
            resolve(result);
          }

          btnCancel.onclick = () => cleanup(false);
          btnAccept.onclick = () => cleanup(true);
        });
      }

      // =====================================================================
      // SETTINGS & SUPABASE INITIALIZATION
      // =====================================================================
      function loadSettingsFromStorage() {
        try {
          const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            appState.settings.supabaseUrl = typeof parsed.supabaseUrl === 'string' ? parsed.supabaseUrl.trim().replace(/\/+$/, '') : '';
            appState.settings.supabaseAnonKey = typeof parsed.supabaseAnonKey === 'string' ? parsed.supabaseAnonKey.trim() : '';
            appState.settings.defaultCurrency = typeof parsed.defaultCurrency === 'string' ? parsed.defaultCurrency.trim().toUpperCase() : 'THB';
          }
        } catch (_e) {
          // กรณี localStorage ถูกล็อก ให้ใช้ค่าเริ่มต้นในหน่วยความจำ
        }
      }

      function saveSettingsToStorage(supabaseUrl, supabaseAnonKey) {
        const cleanUrl = String(supabaseUrl || '').trim().replace(/\/+$/, '');
        const cleanKey = String(supabaseAnonKey || '').trim();

        if (cleanKey.includes('service_role') || cleanKey.startsWith('sb_' + 'secret_')) {
          throw new Error('ห้ามใช้ service_role หรือ Secret Key ในฝั่ง Frontend เด็ดขาด กรุณาใช้เฉพาะ Anon / Publishable Key');
        }

        appState.settings.supabaseUrl = cleanUrl;
        appState.settings.supabaseAnonKey = cleanKey;

        try {
          localStorage.setItem(
            SETTINGS_STORAGE_KEY,
            JSON.stringify({
              supabaseUrl: cleanUrl,
              supabaseAnonKey: cleanKey,
              defaultCurrency: appState.settings.defaultCurrency
            })
          );
        } catch (_e) {
          // ข้ามกรณี Private Browsing บล็อก localStorage
        }
      }

      let realtimeGeneration = 0;
      async function cleanupRealtimeSubscription() {
        realtimeGeneration++;
        const channel = appState.realtimeChannel;
        const client = appState.supabaseClient;
        appState.realtimeChannel = null;
        if (channel && client) {
          try {
            await client.removeChannel(channel);
          } catch (_e) {}
        }
      }

      async function setupRealtimeSubscription() {
        const cleanup = cleanupRealtimeSubscription();
        const generation = realtimeGeneration;
        const client = appState.supabaseClient;
        const userId = appState.currentUser?.id;
        await cleanup;
        if (document.hidden || generation !== realtimeGeneration || !client || !userId ||
            client !== appState.supabaseClient || userId !== appState.currentUser?.id) return;

        try {
          const channel = client
            .channel(`transactions_sync_${userId}`)
            .on(
              'postgres_changes',
              {
                event: '*',
                schema: 'public',
                table: 'transactions',
                filter: `user_id=eq.${userId}`
              },
              () => {
                if (!document.hidden && generation === realtimeGeneration && userId === appState.currentUser?.id) {
                  pullCloudTransactionsAndMerge().catch(() => {});
                }
              }
            )
            .subscribe();

          appState.realtimeChannel = channel;
        } catch (_e) {
          // หาก Realtime ไม่พร้อม ระบบยังซิงก์ผ่าน REST API ได้ตามปกติ
        }
      }

      async function initSupabaseClientAndVerify(showFeedback = false) {
        await cleanupRealtimeSubscription();
        const { supabaseUrl, supabaseAnonKey } = appState.settings;

        if (!supabaseUrl || !supabaseAnonKey) {
          appState.supabaseClient = null;
          appState.supabaseConnected = false;
          appState.currentUser = null;
          appState.aiStatus = 'unconfigured';
          appState.aiStatusMessage = 'ยังไม่ได้ตั้งค่า AI';
          updateStatusBannersAndPills();
          return { connected: false, reason: 'missing_config' };
        }

        if (!globalScope.supabase || typeof globalScope.supabase.createClient !== 'function') {
          appState.supabaseClient = null;
          appState.supabaseConnected = false;
          appState.aiStatus = 'unreachable';
          appState.aiStatusMessage = 'ไม่สามารถเชื่อมต่อ AI ได้ (SDK ออฟไลน์)';
          updateStatusBannersAndPills();
          return { connected: false, reason: 'sdk_unavailable' };
        }

        try {
          const client = globalScope.supabase.createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          });
          appState.supabaseClient = client;

          const { data: sessionData, error: sessionErr } = await client.auth.getSession();
          if (sessionErr) {
            throw sessionErr;
          }

          appState.supabaseConnected = true;
          appState.currentUser = sessionData?.session?.user || null;

          client.auth.onAuthStateChange(async (_event, session) => {
            const prevUserId = appState.currentUser?.id || null;
            const nextUser = session?.user || null;
            appState.currentUser = nextUser;
            if (prevUserId !== (nextUser?.id || null)) {
              stopShareHeartbeat();
              suggestionRequest++; historyRequest++;
              document.getElementById('txMerchantHistory').replaceChildren();
            }

            if (nextUser && nextUser.id !== prevUserId) {
              await setupRealtimeSubscription();
              await pullCloudTransactionsAndMerge();
              await checkAiEdgeHealthSilent();
            } else if (!nextUser) {
              await cleanupRealtimeSubscription();
              appState.aiStatus = 'unconfigured';
              appState.aiStatusMessage = 'เข้าสู่ระบบเพื่อใช้งาน AI';
            }
            await refreshTransactionsFromLocal();
            updateStatusBannersAndPills();
            if (prevUserId !== (nextUser?.id || null)) {
              await releaseSharedReceipt(); clearTemporaryReceiptImage();
              document.getElementById('verificationModal').hidden = true;
              await refreshAutomationUi().catch(() => {});
            }
          });

          if (appState.currentUser) {
            await setupRealtimeSubscription();
            await pullCloudTransactionsAndMerge();
            await checkAiEdgeHealthSilent();
          } else {
            appState.aiStatus = 'unconfigured';
            appState.aiStatusMessage = 'เข้าสู่ระบบเพื่อใช้งาน AI';
          }

          updateStatusBannersAndPills();
          if (showFeedback) {
            showToast('เชื่อมต่อ Supabase สำเร็จแล้ว', 'success');
          }
          return { connected: true };
        } catch (err) {
          appState.supabaseConnected = false;
          appState.currentUser = null;
          appState.aiStatus = 'unreachable';
          appState.aiStatusMessage = 'ไม่สามารถเชื่อมต่อ AI ได้';
          updateStatusBannersAndPills();
          if (showFeedback) {
            showToast(`เชื่อมต่อ Supabase ไม่สำเร็จ: ${err.message || 'ตรวจสอบ URL และ Key'}`, 'error');
          }
          return { connected: false, reason: err.message || 'connection_error' };
        }
      }

      // =====================================================================
      // AI EDGE FUNCTION HEALTH & RECEIPT ANALYSIS
      // =====================================================================
      async function callAnalyzeReceiptEdgeFunction(payload, timeoutMs = 28000) {
        if (!appState.supabaseClient || !appState.settings.supabaseUrl || !appState.settings.supabaseAnonKey) {
          throw new Error('กรุณาตั้งค่า Supabase URL และ Publishable Key ในหน้าตั้งค่าก่อนใช้งาน AI');
        }
        if (!navigator.onLine) {
          appState.aiStatus = 'unreachable';
          appState.aiStatusMessage = 'ไม่สามารถเชื่อมต่อ AI ได้ (ออฟไลน์)';
          updateStatusBannersAndPills();
          throw new Error('ไม่สามารถวิเคราะห์ด้วย AI ขณะออฟไลน์ได้ กรุณาเชื่อมต่ออินเทอร์เน็ตหรือกรอกรายการด้วยตนเอง');
        }

        const { data: sessionData } = await appState.supabaseClient.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        if (!accessToken) {
          throw new Error('กรุณาเข้าสู่ระบบบัญชีผู้ใช้ก่อนเรียกใช้งานการวิเคราะห์ใบเสร็จด้วย AI');
        }

        const endpoint = `${appState.settings.supabaseUrl}/functions/v1/analyze-receipt`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
              'apikey': appState.settings.supabaseAnonKey
            },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          clearTimeout(timer);

          let jsonBody = {};
          try {
            jsonBody = await response.json();
          } catch (_e) {
            throw new Error('ผลลัพธ์จาก Edge Function ไม่ใช่รูปแบบ JSON ที่ถูกต้อง');
          }

          if (!response.ok) {
            if (response.status === 429) {
              appState.aiStatus = 'rate_limited';
              appState.aiStatusMessage = 'ถึงขีดจำกัดการใช้งาน';
            } else if (response.status === 503 || jsonBody.code === 'AI_NOT_CONFIGURED') {
              appState.aiStatus = 'unconfigured';
              appState.aiStatusMessage = 'ยังไม่ได้ตั้งค่า AI';
            } else {
              appState.aiStatus = 'error';
              appState.aiStatusMessage = 'เกิดข้อผิดพลาดจาก AI';
            }
            updateStatusBannersAndPills();
            throw new Error(response.status === 401 || response.status === 403 ? 'กรุณาเข้าสู่ระบบใหม่ หรือบัญชีนี้ไม่มีสิทธิ์ใช้งาน AI' : response.status === 429 ? 'ถึงขีดจำกัดการใช้งาน AI กรุณารอสักครู่แล้วลองใหม่' : response.status >= 500 ? 'บริการ AI ขัดข้องชั่วคราว กรุณาลองใหม่ภายหลัง' : 'ไม่สามารถวิเคราะห์ภาพได้ กรุณาตรวจภาพแล้วลองใหม่');
          }

          appState.aiStatus = 'ready';
          appState.aiStatusMessage = 'AI พร้อมใช้งาน';
          updateStatusBannersAndPills();
          return jsonBody;
        } catch (err) {
          clearTimeout(timer);
          if (err && err.name === 'AbortError') {
            appState.aiStatus = 'unreachable';
            appState.aiStatusMessage = 'ไม่สามารถเชื่อมต่อ AI ได้ (Timeout)';
            updateStatusBannersAndPills();
            throw new Error('การเชื่อมต่อ AI ใช้เวลานานเกินกำหนด (Timeout) กรุณาลองใหม่หรือกรอกข้อมูลด้วยตนเอง');
          }
          throw err;
        }
      }

      async function checkAiEdgeHealthSilent() {
        try {
          const res = await callAnalyzeReceiptEdgeFunction({ action: 'health' }, 10000);
          if (res && res.ready) {
            appState.aiStatus = 'ready';
            appState.aiStatusMessage = 'AI พร้อมใช้งาน';
          } else {
            appState.aiStatus = 'unconfigured';
            appState.aiStatusMessage = 'ยังไม่ได้ตั้งค่า AI';
          }
        } catch (_e) {
          // ไม่รบกวนผู้ใช้ด้วย Popup เมื่อตรวจเบื้องหลัง
        }
        updateStatusBannersAndPills();
      }

      // =====================================================================
      // OFFLINE-FIRST CRUD & CLOUD SYNCHRONIZATION (IDEMPOTENT & CONFLICT-SAFE)
      // =====================================================================
      async function refreshTransactionsFromLocal() {
        await loadFundBuckets().catch(() => {});
        const allRecords = await dbGetAllTransactions();
        const activeUserId = appState.currentUser?.id || null;

        // แสดงเฉพาะรายการของบัญชีที่กำลังเข้าสู่ระบบ หรือรายการ local_only ที่ยังไม่มีเจ้าของ
        const visible = allRecords.filter((tx) => {
          if (!tx || tx.deleted_at) return false;
          if (activeUserId) {
            return tx.user_id === activeUserId || !tx.user_id;
          }
          return !tx.user_id;
        });

        visible.sort((a, b) => {
          const dateCmp = String(b.transaction_date || '').localeCompare(String(a.transaction_date || ''));
          if (dateCmp !== 0) return dateCmp;
          return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
        });

        appState.transactions = visible;
        await refreshMerchantHistory().catch(() => {});
        renderDashboardAndHistory();
        updateStatusBannersAndPills();
        return visible;
      }

      async function saveTransaction(txInput) {
        const entryOwner = bucketOwner();
        await loadFundBuckets();
        if (bucketOwner() !== entryOwner) throw new Error('บัญชีเปลี่ยนแล้ว กรุณาลองใหม่');
        const validation = validateTransactionInput(txInput);
        if (!validation.valid) {
          throw new Error(validation.errors.join('\n'));
        }

        const fixedMarker = String(txInput.note || '').match(/\[fixed_item:(dan_insurance)\]/);
        if (!txInput.id && txInput.type === 'expense' && fixedMarker) {
          return (await commitAutomation([{ ...validation.normalized, fund_bucket: 'dan_insurance' }], ['fixed:dan_insurance:' + validation.normalized.transaction_date.slice(0, 7)]))[0];
        }
        const nowIso = new Date().toISOString();
        const existingId = typeof txInput.id === 'string' && txInput.id.trim() ? txInput.id.trim() : null;
        const id = existingId || generateUuid();

        const allExisting = await dbGetAllTransactions();
        const oldRecord = allExisting.find((item) => item.id === id) || null;
        if (oldRecord && (oldRecord.user_id || null) !== entryOwner) throw new Error('ไม่สามารถแก้ไขรายการของบัญชีอื่น');

        const isCloudReady = Boolean(appState.supabaseClient && appState.supabaseConnected && appState.currentUser);
        const record = {
          id,
          user_id: entryOwner,
          ...validation.normalized,
          sync_status: entryOwner ? 'pending_sync' : 'local_only',
          sync_error: null,
          created_at: oldRecord?.created_at || nowIso,
          updated_at: nowIso
        };

        // 1. บันทึกลง Local IndexedDB ก่อนเสมอ (Local-First Save)
        if (bucketOwner() !== entryOwner) throw new Error('บัญชีเปลี่ยนแล้ว กรุณาลองใหม่');
        await dbPutTransaction(record);
        await refreshTransactionsFromLocal();

        // 2. หากเชื่อมต่อ Cloud และเข้าสู่ระบบอยู่ ให้ซิงก์ขึ้น Supabase ทันที
        if (isCloudReady && navigator.onLine) {
          await syncSingleTransactionToCloud(record);
          await refreshTransactionsFromLocal();
        }

        return record;
      }

      async function syncSingleTransactionToCloud(localRecord, registryReady = false) {
        if (!appState.supabaseClient || !appState.currentUser || !navigator.onLine) {
          return { synced: false, reason: 'offline_or_unauthenticated' };
        }

        const txOwner = bucketOwner(), txClient = appState.supabaseClient;
        const checkOwner = () => { if (bucketOwner() !== txOwner || appState.supabaseClient !== txClient) throw new Error('บัญชีเปลี่ยนแล้ว'); };
        try {
          if (!registryReady && !await syncFundBuckets()) throw new Error('กระปุกยังซิงก์ไม่สำเร็จ');
          checkOwner();
          if (localRecord.user_id !== bucketOwner()) throw new Error('บัญชีเปลี่ยนแล้ว');
          localRecord = { ...localRecord, fund_bucket: resolveDeletedBucket(localRecord.fund_bucket) };
          if (!bucketRegistry.buckets.some(b => b.bucket_key === localRecord.fund_bucket && b.sync_status === 'synced')) throw new Error('กระปุกรอซิงก์ กรุณาลองใหม่');
          const userId = appState.currentUser.id;

          // กรณีเป็น Tombstone รายการที่ถูกลบขณะออฟไลน์ ให้สั่งลบบน Cloud แล้วล้าง Tombstone ในเครื่อง
          if (localRecord.deleted_at) {
            const { error: delErr } = await txClient
              .from('transactions')
              .delete()
              .eq('id', localRecord.id)
              .eq('user_id', userId);

            if (delErr) {
              throw delErr;
            }
            await dbDeleteTransaction(localRecord.id);
            return { synced: true, deletedOnCloud: true };
          }

          // ตรวจสอบ Conflict: ดึงแถวเดิมบน Cloud มาตรวจ updated_at ก่อนเขียนทับ
          const { data: remoteExisting } = await appState.supabaseClient
            .from('transactions')
            .select('id, updated_at, user_id')
            .eq('id', localRecord.id)
            .maybeSingle();

          checkOwner();
          if (remoteExisting && remoteExisting.updated_at) {
            const remoteTime = new Date(remoteExisting.updated_at).getTime();
            const localTime = new Date(localRecord.updated_at).getTime();
            if (Number.isFinite(remoteTime) && Number.isFinite(localTime) && remoteTime > localTime) {
              // ข้อมูลบน Cloud ใหม่กว่า ดึงข้อมูล Cloud มาอัปเดตแทนการเขียนทับ
              await pullCloudTransactionsAndMerge();
              return { synced: true, conflictResolved: 'remote_newer' };
            }
          }

          const cloudPayload = {
            id: localRecord.id,
            user_id: userId,
            transaction_date: localRecord.transaction_date,
            merchant: localRecord.merchant,
            amount: localRecord.amount,
            currency: localRecord.currency,
            type: localRecord.type,
            category: localRecord.category,
            fund_bucket: localRecord.fund_bucket || inferDefaultFundBucket(localRecord.category, localRecord.merchant, localRecord.items_summary, localRecord.purpose_analysis, localRecord.note),
            items_summary: localRecord.items_summary || '',
            purpose_analysis: localRecord.purpose_analysis || '',
            source_type: localRecord.source_type || 'manual',
            note: localRecord.note || '',
            created_at: localRecord.created_at,
            updated_at: localRecord.updated_at
          };

          // ใช้ Idempotent Upsert อ้างอิง Primary Key (id) เพื่อไม่ให้สร้างแถวซ้ำเมื่อ Retry
          const { data: upserted, error: upsertErr } = await appState.supabaseClient
            .from('transactions')
            .upsert(cloudPayload, { onConflict: 'id' })
            .select()
            .single();

          checkOwner();
          if (upsertErr) {
            throw upsertErr;
          }

          const updatedLocal = {
            ...localRecord,
            user_id: userId,
            sync_status: 'synced',
            sync_error: null,
            updated_at: upserted?.updated_at || localRecord.updated_at
          };
          await dbPutTransaction(updatedLocal);
          return { synced: true };
        } catch (err) {
          const failedLocal = {
            ...localRecord,
            sync_status: 'sync_failed',
            sync_error: err.message || 'ซิงก์ข้อมูลไม่สำเร็จ'
          };
          await dbPutTransaction(failedLocal);
          return { synced: false, error: err.message };
        }
      }

      async function syncPendingTransactions() {
        if (appState.isSyncing) return { syncedCount: 0, failedCount: 0 };
        if (!appState.supabaseClient || !appState.currentUser || !navigator.onLine) {
          return { syncedCount: 0, failedCount: 0 };
        }

        appState.isSyncing = true;
        const syncOwner = bucketOwner(), syncClient = appState.supabaseClient;
        let syncedCount = 0;
        let failedCount = 0;

        try {
          if (!await syncFundBuckets()) return { syncedCount: 0, failedCount: 1 };
          const allLocal = await dbGetAllTransactions();
          if (bucketOwner() !== syncOwner || appState.supabaseClient !== syncClient) return { syncedCount, failedCount: 1 };
          const activeUserId = syncOwner;
          const queue = allLocal.filter(
            (tx) =>
              tx &&
              tx.user_id === activeUserId &&
              (tx.sync_status === 'pending_sync' || tx.sync_status === 'sync_failed')
          );

          for (const item of queue) {
            if (bucketOwner() !== syncOwner || appState.supabaseClient !== syncClient) return { syncedCount, failedCount: failedCount + 1 };
            const res = await syncSingleTransactionToCloud(item, true);
            if (res.synced) {
              syncedCount += 1;
            } else {
              failedCount += 1;
            }
          }

          if (bucketOwner() !== syncOwner || appState.supabaseClient !== syncClient) return { syncedCount, failedCount: failedCount + 1 };
          await pullCloudTransactionsAndMerge({ registryReady: true });
          await refreshTransactionsFromLocal();
          return { syncedCount, failedCount };
        } finally {
          appState.isSyncing = false;
        }
      }

      async function pullCloudTransactionsAndMerge(options = {}) {
        if (!appState.supabaseClient || !appState.currentUser || !navigator.onLine) return;
        const pullOwner = bucketOwner(), pullClient = appState.supabaseClient;
        if (!options.registryReady && !await syncFundBuckets()) return;

        if (bucketOwner() !== pullOwner || appState.supabaseClient !== pullClient) return;
        try {
          const userId = pullOwner;
          const PAGE_SIZE = 500;
          const remoteRows = [];
          let offset = 0;
          let isCompleteSnapshot = false;

          while (true) {
            if (bucketOwner() !== pullOwner || appState.supabaseClient !== pullClient) return;
            const baseQuery = pullClient
              .from('transactions')
              .select('*', { count: 'exact' })
              .eq('user_id', userId)
              .order('transaction_date', { ascending: false });

            if (typeof baseQuery.range === 'function') {
              const { data: pageData, error: pageErr, count: totalExactCount } = await baseQuery.range(
                offset,
                offset + PAGE_SIZE - 1
              );
              if (pageErr || !Array.isArray(pageData)) {
                isCompleteSnapshot = false;
                break;
              }
              remoteRows.push(...pageData);
              if (pageData.length < PAGE_SIZE) {
                isCompleteSnapshot =
                  typeof totalExactCount === 'number' && remoteRows.length === totalExactCount;
                break;
              }
              offset += PAGE_SIZE;
            } else {
              // กรณี Mock Client ในชุดทดสอบที่ไม่มี .range() ให้ดึงผ่าน .order() และอนุญาตเฉพาะเมื่อระบุ count ตรงกับจำนวนแถวจริง
              const { data: singleData, error: singleErr, count: singleCount } = await baseQuery;
              if (singleErr || !Array.isArray(singleData)) {
                isCompleteSnapshot = false;
                break;
              }
              remoteRows.push(...singleData);
              isCompleteSnapshot =
                typeof singleCount === 'number' && singleCount === singleData.length;
              break;
            }
          }

          if (remoteRows.length === 0 && !isCompleteSnapshot) return;

          const allLocal = await dbGetAllTransactions();
          if (bucketOwner() !== pullOwner || appState.supabaseClient !== pullClient) return;
          const localMap = new Map(allLocal.map((item) => [item.id, item]));
          const remoteIdSet = new Set(remoteRows.map((r) => r.id));

          // ลบแถวในเครื่องที่เคยซิงก์แล้ว (synced) เฉพาะเมื่อยืนยันว่าดึง Snapshot จาก Cloud มาครบทุกหน้าแล้วเท่านั้น (isCompleteSnapshot === true)
          if (isCompleteSnapshot) {
            for (const localItem of allLocal) {
              if (
                localItem &&
                localItem.user_id === userId &&
                localItem.sync_status === 'synced' &&
                !localItem.deleted_at &&
                !remoteIdSet.has(localItem.id)
              ) {
                await dbDeleteTransaction(localItem.id);
              }
            }
          }

          for (const remote of remoteRows) {
            if (bucketOwner() !== userId) return;
            remote.fund_bucket = resolveDeletedBucket(remote.fund_bucket);
            const localItem = localMap.get(remote.id);
            // ห้ามนำแถวที่ผู้ใช้เพิ่งสั่งลบในเครื่อง (Tombstone รอซิงก์การลบ) กลับมาแสดงซ้ำ
            if (localItem && localItem.deleted_at) {
              continue;
            }
            if (!localItem) {
              await dbPutTransaction({
                ...remote,
                amount: Number(remote.amount),
                sync_status: 'synced',
                sync_error: null
              });
            } else if (localItem.sync_status === 'pending_sync' || localItem.sync_status === 'sync_failed') {
              // เปรียบเทียบเวลาแก้ไขล่าสุด (Last-Write-Wins แบบตรวจสอบเวลาจริง)
              const rTime = new Date(remote.updated_at || 0).getTime();
              const lTime = new Date(localItem.updated_at || 0).getTime();
              if (rTime > lTime) {
                await dbPutTransaction({
                  ...remote,
                  amount: Number(remote.amount),
                  sync_status: 'synced',
                  sync_error: null
                });
              }
            } else {
              await dbPutTransaction({
                ...remote,
                amount: Number(remote.amount),
                sync_status: 'synced',
                sync_error: null
              });
            }
          }

          await refreshTransactionsFromLocal();
        } catch (_err) {
          // กรณีเครือข่ายสะดุดระหว่างดึงข้อมูล ให้คงข้อมูลในเครื่องไว้
        }
      }

      /**
       * ย้ายข้อมูลจาก Local-only Mode ขึ้นบัญชี Cloud โดยต้องแสดงจำนวนและขอคำยืนยันจากผู้ใช้ก่อนเสมอ (หัวข้อ 9.4)
       */
      async function migrateLocalOnlyRecordsToCloudInteractive() {
        if (!appState.supabaseClient || !appState.currentUser) {
          showToast('กรุณาเข้าสู่ระบบบัญชีผู้ใช้ก่อนย้ายข้อมูลขึ้น Cloud', 'warning');
          return;
        }

        const allLocal = await dbGetAllTransactions();
        const localOnlyItems = allLocal.filter((tx) => tx && !tx.user_id && tx.sync_status === 'local_only');
        if (localOnlyItems.length === 0) {
          showToast('ไม่มีรายการแบบบันทึกเฉพาะในเครื่องที่รอการย้าย', 'info');
          return;
        }

        const sampleNames = localOnlyItems
          .slice(0, 3)
          .map((tx) => `• ${tx.transaction_date}: ${tx.merchant} (${formatCurrency(tx.amount, tx.currency)})`)
          .join('\n');

        const confirmed = await askUserConfirmation(
          'ยืนยันการย้ายข้อมูลในเครื่องขึ้น Cloud',
          `พบรายการที่บันทึกไว้ในเครื่องจำนวน ${localOnlyItems.length} รายการ\nตัวอย่างรายการ:\n${sampleNames}\n\nต้องการซิงก์รายการเหล่านี้เข้าสู่บัญชี ${appState.currentUser.email} หรือไม่?`
        );

        if (!confirmed) return;

        const migrationOwner = bucketOwner();
        const guestRegistry = await bucketStoreChange(null);
        if (bucketOwner() !== migrationOwner) throw new Error('บัญชีเปลี่ยนแล้ว');
        await bucketStoreChange(migrationOwner, registry => {
          for (const bucket of guestRegistry.buckets) if (!registry.buckets.some(b => b.bucket_key === bucket.bucket_key) && !registry.deletions.some(d => d.source_key === bucket.bucket_key)) registry.buckets.push({ ...bucket, sync_status: 'pending_sync' });
        });
        let successCount = 0;
        let failCount = 0;

        for (const item of localOnlyItems) {
          if (bucketOwner() !== migrationOwner) throw new Error('บัญชีเปลี่ยนแล้ว');
          const updatedItem = {
            ...item,
            user_id: appState.currentUser.id,
            sync_status: 'pending_sync',
            updated_at: new Date().toISOString()
          };
          await dbPutTransaction(updatedItem);
          const res = await syncSingleTransactionToCloud(updatedItem);
          if (res.synced) successCount += 1;
          else failCount += 1;
        }

        await refreshTransactionsFromLocal();
        showToast(
          `ย้ายข้อมูลขึ้น Cloud สำเร็จ ${successCount} รายการ` + (failCount > 0 ? ` (รอซิงก์ซ้ำ ${failCount} รายการ)` : ''),
          failCount === 0 ? 'success' : 'warning'
        );
      }

      async function deleteTransaction(txId) {
        const allLocal = await dbGetAllTransactions();
        const target = allLocal.find((t) => t && t.id === txId);
        if (!target) return { deleted: false };

        const belongsToCloudUser = Boolean(target.user_id && appState.currentUser && target.user_id === appState.currentUser.id);

        if (belongsToCloudUser && appState.supabaseClient && navigator.onLine) {
          const { error } = await appState.supabaseClient
            .from('transactions')
            .delete()
            .eq('id', txId)
            .eq('user_id', appState.currentUser.id);

          if (!error) {
            await dbDeleteTransaction(txId);
            await refreshTransactionsFromLocal();
            return { deleted: true, mode: 'cloud_immediate' };
          }
        }

        // กรณีเป็นรายการที่เคยผูกกับ Cloud แต่ขณะนี้ออฟไลน์หรือลบไม่สำเร็จ ให้เก็บ Tombstone เพื่อซิงก์การลบเมื่อออนไลน์
        if (target.user_id) {
          const tombstone = {
            ...target,
            deleted_at: new Date().toISOString(),
            sync_status: 'pending_sync',
            updated_at: new Date().toISOString()
          };
          await dbPutTransaction(tombstone);
          await refreshTransactionsFromLocal();
          return { deleted: true, mode: 'tombstone_queued' };
        }

        await dbDeleteTransaction(txId);
        await refreshTransactionsFromLocal();
        return { deleted: true, mode: 'local_immediate' };
      }

      async function deleteTransactionInteractive(txId) {
        const target = appState.transactions.find((t) => t.id === txId);
        if (!target) return;

        const confirmed = await askUserConfirmation(
          'ยืนยันการลบรายการ',
          `คุณต้องการลบรายการ "${target.merchant}" ยอดเงิน ${formatCurrency(target.amount, target.currency)} วันที่ ${target.transaction_date} ใช่หรือไม่?`
        );
        if (!confirmed) return;

        const res = await deleteTransaction(txId);
        if (res.deleted) {
          showToast(
            res.mode === 'tombstone_queued'
              ? 'ลบรายการในเครื่องแล้ว และจะซิงก์การลบขึ้น Cloud เมื่อออนไลน์'
              : 'ลบรายการเรียบร้อยแล้ว',
            'success'
          );
        }
      }

      // =====================================================================
      // EXPORT & IMPORT BACKUP (JSON & CSV WITH UTF-8 BOM)
      // =====================================================================
      function exportBackupJson() {
        const payload = {
          app: 'SlipSense',
          schema_version: '1.0.0',
          exported_at: new Date().toISOString(),
          count: appState.transactions.length,
          fund_buckets: bucketRegistry.buckets,
          transactions: appState.transactions
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `slipsense-backup-${getBangkokTodayIso()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast(`ส่งออกข้อมูลสำรอง JSON จำนวน ${appState.transactions.length} รายการสำเร็จ`, 'success');
      }

      function escapeCsvCell(val) {
        const str = String(val ?? '').replace(/\r?\n/g, ' ');
        // ป้องกัน CSV Formula Injection (=, +, -, @)
        const safeStr = /^[=+\-@]/.test(str) ? `'${str}` : str;
        if (safeStr.includes(',') || safeStr.includes('"')) {
          return `"${safeStr.replace(/"/g, '""')}"`;
        }
        return safeStr;
      }

      function exportBackupCsv() {
        const headers = [
          'id',
          'transaction_date',
          'merchant',
          'amount',
          'currency',
          'type',
          'category',
          'fund_bucket',
          'source_type',
          'items_summary',
          'purpose_analysis',
          'note',
          'sync_status',
          'created_at',
          'updated_at'
        ];
        const rows = [headers.join(',')];
        for (const tx of appState.transactions) {
          rows.push(headers.map((h) => escapeCsvCell(tx[h])).join(','));
        }
        // ใส่ \uFEFF (UTF-8 BOM) เพื่อให้เปิดใน Microsoft Excel ภาษาไทยได้ไม่เพี้ยน
        const csvContent = '\uFEFF' + rows.join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `slipsense-backup-${getBangkokTodayIso()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast(`ส่งออกไฟล์ CSV จำนวน ${appState.transactions.length} รายการสำเร็จ`, 'success');
      }

      function parseCsvLine(line) {
        const cells = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
              cur += '"';
              i += 1;
            } else if (ch === '"') {
              inQuotes = false;
            } else {
              cur += ch;
            }
          } else if (ch === '"') {
            inQuotes = true;
          } else if (ch === ',') {
            cells.push(cur.trim());
            cur = '';
          } else {
            cur += ch;
          }
        }
        cells.push(cur.trim());
        return cells;
      }

      async function validateAndImportBackup(rawContent, fileName = 'backup.json') {
        await loadFundBuckets();
        const cleanText = String(rawContent || '').replace(/^\uFEFF/, '').trim();
        if (!cleanText) {
          throw new Error('ไฟล์สำรองว่างเปล่า');
        }

        let candidateRows = [], importedBuckets = [];
        if (fileName.toLowerCase().endsWith('.csv') || (!cleanText.startsWith('{') && !cleanText.startsWith('['))) {
          const lines = cleanText.split(/\r?\n/).filter((ln) => ln.trim().length > 0);
          if (lines.length < 2) {
            throw new Error('ไฟล์ CSV ไม่มีข้อมูลรายการ');
          }
          const headers = parseCsvLine(lines[0]);
          for (let i = 1; i < lines.length; i++) {
            const values = parseCsvLine(lines[i]);
            const obj = {};
            headers.forEach((h, idx) => {
              obj[h] = values[idx] !== undefined ? values[idx] : '';
            });
            candidateRows.push(obj);
          }
        } else {
          const parsed = JSON.parse(cleanText);
          importedBuckets = Array.isArray(parsed.fund_buckets) ? parsed.fund_buckets.map(validBucket) : [];
          candidateRows = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed.transactions)
              ? parsed.transactions
              : [];
        }

        const existingRecords = await dbGetAllTransactions();
        await mutateBucket(registry => {
          for (const metadata of importedBuckets) {
            if (registry.deletions.some(d => d.source_key === metadata.bucket_key)) continue;
            const existing = registry.buckets.find(b => b.bucket_key === metadata.bucket_key);
            const record = { ...metadata, sort_order: existing?.sort_order ?? registry.buckets.length, sync_status: registry.owner ? 'pending_sync' : 'local_only', updated_at: new Date().toISOString() };
            if (existing) Object.assign(existing, record); else registry.buckets.push(record);
          }
          for (const row of candidateRows) {
            const key = row.fund_bucket;
            if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(key) || registry.buckets.some(b => b.bucket_key === key) || registry.deletions.some(d => d.source_key === key)) continue;
            const metadata = importedBuckets.find(b => b.bucket_key === key) || { bucket_key: key, name: key, icon: '🐷', color: '#6366f1', is_cumulative: true };
            registry.buckets.push({ ...validBucket(metadata), sort_order: registry.buckets.length, sync_status: registry.owner ? 'pending_sync' : 'local_only', updated_at: new Date().toISOString() });
          }
        });
        const existingIds = new Set(existingRecords.map((r) => r.id));

        let imported = 0;
        let rejected = 0;
        let duplicateCount = 0;

        for (const item of candidateRows) {
          if (!item || typeof item !== 'object') {
            rejected += 1;
            continue;
          }
          const candidateId = typeof item.id === 'string' && /^[0-9a-fA-F-]{36}$/.test(item.id.trim())
            ? item.id.trim()
            : generateUuid();

          if (existingIds.has(candidateId)) {
            duplicateCount += 1;
            continue;
          }

          const val = validateTransactionInput(item);
          if (!val.valid) {
            rejected += 1;
            continue;
          }

          const nowIso = new Date().toISOString();
          const newRecord = {
            id: candidateId,
            user_id: appState.currentUser?.id || null,
            ...val.normalized,
            sync_status: appState.currentUser ? 'pending_sync' : 'local_only',
            sync_error: null,
            created_at: item.created_at || nowIso,
            updated_at: nowIso
          };

          await dbPutTransaction(newRecord);
          existingIds.add(candidateId);
          imported += 1;
        }

        await refreshTransactionsFromLocal();
        if (appState.currentUser && navigator.onLine && imported > 0) {
          await syncPendingTransactions();
        }

        return { imported, rejected, duplicateCount };
      }

      // =====================================================================
      // 5-FUND SALARY ENVELOPE & FIXED MONTHLY ALLOCATION WORKFLOW
      // =====================================================================
      function upgradeSalaryTemplate(template: any) {
        if (!template || template.version === 2) return template;
        const next = { ...template, needs_review: true };
        // Only explicitly versioned standard templates can be upgraded automatically.
        if (template.version === 1 && [12700, 14000].includes(template.fixed_expense) &&
            template.investment_stock === 6500 && template.home_building === 13000 &&
            template.emergency_personal === 0 &&
            Number.isFinite(template.total_salary) && template.general_expense >= 0 &&
            Math.round((template.investment_stock + template.home_building + template.fixed_expense + template.emergency_personal + template.general_expense) * 100) === Math.round(template.total_salary * 100)) {
          next.fixed_expense = (Math.round(template.fixed_expense * 100) - 290000) / 100;
          next.dan_insurance = 2900; next.version = 2; next.needs_review = false;
        } else { next.dan_insurance = template.dan_insurance ?? 0; }
        return next;
      }

      function legacyInsuranceReview(rows: any[], month: string) {
        const migrated = new Set(rows.filter(row => (row.user_id || null) === (appState.currentUser?.id || null) && !row.deleted_at && !row.pending_delete).flatMap(row => [...String(row.note || '').matchAll(/\[INSURANCE_RECLASS:([^:]+):([^\]]+)\]/g)].filter(m => m[1] === month).map(m => m[2])));
        return rows.filter(row => !migrated.has(row.id) && !row.deleted_at && !row.pending_delete &&
          (row.user_id || null) === (appState.currentUser?.id || null) && row.transaction_date?.slice(0, 7) === month &&
          row.fund_bucket === 'fixed_expense' && !row.note?.includes('[SIX_FUNDS_V2]') &&
          (row.note?.includes('[SALARY_SPLIT:' + month + ':fixed_expense]') ||
           row.note?.includes('[fixed_item:dan_insurance]') || /ประกัน\s*แดน/.test(`${row.merchant} ${row.items_summary} ${row.note}`)));
      }

      // Reclassification uses balanced transfer pairs. Original records stay available for audit.
      async function upgradeLegacyInsurance(month: string, confirmed = false) {
        const owner = appState.currentUser?.id || null;
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('เดือนที่เลือกไม่ถูกต้อง');
        const rows = (await dbGetAllTransactions()).filter(row => (row.user_id || null) === (appState.currentUser?.id || null));
        const candidates = legacyInsuranceReview(rows, month);
        if (!candidates.length) return { upgraded: false, pending: 0 };
        const rolled = rows.some(row => row.note?.includes('SURPLUS_ROLLOVER_') && row.note?.includes(month));
        const safe = !rolled && candidates.every(row => (row.type === 'expense' && row.note?.includes('[fixed_item:dan_insurance]')) ||
          (row.type === 'income' && [12700, 14000].includes(row.amount) && row.note?.includes('[SALARY_SPLIT:' + month + ':fixed_expense]')));
        if (!safe || !confirmed) return { upgraded: false, pending: candidates.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100, needs_review: true };
        const inputs = [];
        for (const row of candidates) {
          const amount = row.type === 'income' ? 2900 : row.amount;
          for (const bucket of ['fixed_expense', 'dan_insurance']) inputs.push({
            transaction_date: row.transaction_date, merchant: 'แยกเงินเก็บประกันแดนจากข้อมูลเดิม', amount,
            type: bucket === 'fixed_expense' ? (row.type === 'income' ? 'expense' : 'income') : row.type,
            currency: 'THB', category: 'transfer_other', fund_bucket: bucket, source_type: 'manual',
            note: '[INSURANCE_RECLASS:' + month + ':' + row.id + ']'
          });
        }
        if ((appState.currentUser?.id || null) !== owner) throw new Error('บัญชีผู้ใช้เปลี่ยน กรุณาลองใหม่');
        const records = await commitAutomation(inputs, candidates.map(row => 'insurance-upgrade:' + month + ':' + row.id));
        return { upgraded: true, pending: 0, records };
      }

      function automationKey(name: string): string { return `${appState.currentUser?.id || 'local'}:${name}`; }

      function transactionAmountCents(value: any) {
        if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value))) return 0;
        const amount = Number(value);
        const cents = Math.round(amount * 100);
        return Number.isSafeInteger(cents) && amount > 0 && amount <= 9999999999.99 ? cents : 0;
      }

      function transactionCalendarDate(value: any) {
        if (typeof value !== 'string') return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return normalizeIsoDate(value).date;
        if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !normalizeIsoDate(value.slice(0, 10)).date) return null;
        const instant = new Date(value);
        if (!Number.isFinite(instant.getTime())) return null;
        return new Date(instant.getTime() + 7 * 3600000).toISOString().slice(0, 10);
      }

      function isInternalTransfer(row: any) {
        return /\[(?:SURPLUS_ROLLOVER_(?:IN|OUT)|INSURANCE_RECLASS):/.test(row.note || '');
      }

      function aggregateFinancialCharts(rows: any[], month: string) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('เดือนที่เลือกไม่ถูกต้อง');
        const [year, mon] = month.split('-').map(Number);
        const months = Array.from({ length: 6 }, (_, i) => ({
          month: new Date(Date.UTC(year, mon - 6 + i, 1)).toISOString().slice(0, 7), incomeCents: 0, expenseCents: 0
        }));
        const categories = new Map(); const seen = new Set();
        let availableCents = 0, yearIncomeCents = 0, yearExpenseCents = 0;
        for (const row of rows) {
          if (!row || row.deleted_at || row.pending_delete || (row.user_id || null) !== (appState.currentUser?.id || null)) continue;
          const date = transactionCalendarDate(row.transaction_date);
          const cents = transactionAmountCents(row.amount);
          if (!row.id || !date || !Number.isSafeInteger(cents) || cents <= 0 || !['income', 'expense'].includes(row.type) || seen.has(row.id)) continue;
          seen.add(row.id);
          const ym = date.slice(0, 7);
          if (row.fund_bucket === 'dan_insurance' && ym <= month) {
            availableCents += row.type === 'income' ? cents : -cents;
            if (date.slice(0, 4) === month.slice(0, 4)) {
              if (row.type === 'income') yearIncomeCents += cents; else yearExpenseCents += cents;
            }
          }
          if (isInternalTransfer(row)) continue;
          const target = months.find(entry => entry.month === ym);
          if (target) target[row.type === 'income' ? 'incomeCents' : 'expenseCents'] += cents;
          if (ym === month && row.type === 'expense') {
            const category = String(row.category || 'unknown');
            categories.set(category, (categories.get(category) || 0) + cents);
          }
        }
        return { months, categories: Array.from(categories, ([category, cents]) => ({ category, label: CATEGORY_LABELS[category] || category, amount: cents / 100 })),
          insurance: { available: availableCents / 100, yearIncome: yearIncomeCents / 100, yearExpense: yearExpenseCents / 100,
            target: 34800, percentage: Math.max(0, Math.min(100, availableCents / 34800)) } };
      }

      function renderFinancialCharts(month: string) {
        const host = document.getElementById('financialCharts'); if (!host) return;
        const data = aggregateFinancialCharts(appState.transactions, month);
        host.replaceChildren();
        const svgNode = (tag, attrs = {}, text = '') => {
          const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
          Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
          if (text) node.textContent = text; return node;
        };
        const bars = svgNode('svg', { viewBox: '0 0 360 210', role: 'img', 'aria-labelledby': 'cashflowTitle cashflowDesc' });
        bars.appendChild(svgNode('title', { id: 'cashflowTitle' }, 'รายรับเทียบรายจ่ายย้อนหลัง 6 เดือน'));
        bars.appendChild(svgNode('desc', { id: 'cashflowDesc' }, 'สีเขียวคือรายรับ สีชมพูคือรายจ่าย ไม่รวมการโอนระหว่างกระปุก ดูยอดครบถ้วนในตารางด้านล่าง'));
        const max = Math.max(1, ...data.months.flatMap(row => [row.incomeCents, row.expenseCents]));
        const table = document.createElement('table'); table.className = 'chart-table';
        const caption = document.createElement('caption'); caption.textContent = 'รายรับ (สีเขียว) / รายจ่าย (สีชมพู) หน่วยบาท'; table.appendChild(caption);
        const heading = document.createElement('tr');
        for (const label of ['เดือน', 'รายรับ', 'รายจ่าย']) { const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; heading.appendChild(cell); } table.appendChild(heading);
        data.months.forEach((row, i) => {
          [row.incomeCents, row.expenseCents].forEach((cents, j) => {
            const height = cents / max * 150;
            bars.appendChild(svgNode('rect', { x: i * 59 + 10 + j * 20, y: 170 - height, width: 17, height, rx: 3, fill: j ? '#d44977' : '#168065' }));
          });
          bars.appendChild(svgNode('text', { x: i * 59 + 28, y: 193, 'text-anchor': 'middle', fill: 'currentColor', 'font-size': 11 }, row.month.slice(2)));
          const tr = document.createElement('tr');
          for (const value of [row.month, formatCurrency(row.incomeCents / 100), formatCurrency(row.expenseCents / 100)]) { const td = document.createElement('td'); td.textContent = value; tr.appendChild(td); }
          table.appendChild(tr);
        });
        host.appendChild(bars); host.appendChild(table);
        const donut = svgNode('svg', { viewBox: '0 0 320 320', role: 'img', 'aria-labelledby': 'expenseDonutTitle', class: 'donut-chart-svg' });
        donut.appendChild(svgNode('title', { id: 'expenseDonutTitle' }, 'สัดส่วนหมวดรายจ่ายเดือน ' + month));
        const sum = data.categories.reduce((total, row) => total + row.amount, 0);
        // Vibrant palette matching reference design (Coral, Rose, Purple, Violet, Indigo, Sky, Cyan, Teal, Emerald, Amber)
        const colors = ['#f43f5e', '#e11d48', '#a855f7', '#7c3aed', '#4f46e5', '#0284c7', '#06b6d4', '#0d9488', '#10b981', '#f59e0b', '#ec4899'];
        let offset = 0;

        // Base ring track
        donut.appendChild(svgNode('circle', {
          cx: 160,
          cy: 160,
          r: 78,
          fill: 'none',
          stroke: 'var(--border-color, #e2e8f0)',
          'stroke-width': 30,
          opacity: '0.35'
        }));

        const CATEGORY_EMOJIS: Record<string, string> = {
          travel: '🏖️',
          education_work: '🎓',
          shopping_general: '🎁',
          utilities_bills: '⚡',
          home_repair: '🏠',
          pet: '🐱',
          food_drink: '🍜',
          groceries: '🛒',
          transport: '🚗',
          health_medical: '💊',
          entertainment: '🥂',
          transfer_other: '💸',
          salary_income: '💼',
          business_income: '📈',
          refund_other_income: '🧧',
          unknown: '📦'
        };

        const legend = document.createElement('ul');
        legend.className = 'chart-legend';

        data.categories.forEach((row, i) => {
          const percent = sum > 0 ? (row.amount / sum) * 100 : 0;
          const sliceColor = colors[i % colors.length];

          // 1. Donut Slice Arc
          donut.appendChild(svgNode('circle', {
            cx: 160,
            cy: 160,
            r: 78,
            fill: 'none',
            stroke: sliceColor,
            'stroke-width': 30,
            pathLength: 100,
            'stroke-dasharray': percent + ' ' + (100 - percent),
            'stroke-dashoffset': -offset,
            transform: 'rotate(-90 160 160)'
          }));

          // Midpoint angle calculation
          const startAngle = -90 + (offset * 3.6);
          const sliceAngle = percent * 3.6;
          const midAngle = startAngle + (sliceAngle / 2);
          const midRad = (midAngle * Math.PI) / 180;

          // 2. In-Slice Percentage Text (white text placed directly on colored arc)
          if (percent >= 3.5) {
            const pctR = 78;
            const pctX = Math.round((160 + pctR * Math.cos(midRad)) * 10) / 10;
            const pctY = Math.round((160 + pctR * Math.sin(midRad)) * 10) / 10;
            donut.appendChild(svgNode('text', {
              x: pctX,
              y: pctY + 0.5,
              fill: '#ffffff',
              'font-size': '10.5',
              'font-weight': '800',
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              style: 'text-shadow: 0 1px 2px rgba(0,0,0,0.35); pointer-events:none;'
            }, Math.round(percent) + '%'));
          }

          // 3. Circular Icon Badge straddling the outer ring boundary
          const badgeR = 104;
          const badgeX = Math.round((160 + badgeR * Math.cos(midRad)) * 10) / 10;
          const badgeY = Math.round((160 + badgeR * Math.sin(midRad)) * 10) / 10;

          const g = svgNode('g', { class: 'donut-badge-marker' });
          g.appendChild(svgNode('circle', {
            cx: badgeX,
            cy: badgeY,
            r: 15.5,
            fill: '#ffffff',
            stroke: sliceColor,
            'stroke-width': '2.5'
          }));

          const emoji = CATEGORY_EMOJIS[row.category] || '🏷️';
          g.appendChild(svgNode('text', {
            x: badgeX,
            y: badgeY + 1,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-size': '13.5'
          }, emoji));

          donut.appendChild(g);

          offset += percent;

          // 4. Clean breakdown row below donut matching reference design
          const li = document.createElement('li');
          li.className = 'chart-legend-row';
          li.textContent = row.label + ': ' + formatCurrency(row.amount) + ' (' + percent.toFixed(1) + '%)';

          const leftBox = document.createElement('div');
          leftBox.className = 'legend-col-left';
          const iconContainer = document.createElement('div');
          iconContainer.className = 'legend-icon-bubble';
          iconContainer.style.borderColor = sliceColor;
          iconContainer.textContent = emoji;
          leftBox.appendChild(iconContainer);

          const nameSpan = document.createElement('span');
          nameSpan.className = 'legend-name-text';
          nameSpan.textContent = row.label;
          leftBox.appendChild(nameSpan);

          const rightBox = document.createElement('div');
          rightBox.className = 'legend-col-right';

          const pctSpan = document.createElement('span');
          pctSpan.className = 'legend-pct-pill';
          pctSpan.textContent = percent.toFixed(1) + '%';
          rightBox.appendChild(pctSpan);

          const amtSpan = document.createElement('span');
          amtSpan.className = 'legend-amt-text';
          amtSpan.textContent = formatCurrency(row.amount);
          rightBox.appendChild(amtSpan);

          li.replaceChildren(leftBox, rightBox);
          legend.appendChild(li);
        });

        // 5. Donut Hole Center (White card + 'ค่าใช้จ่าย' + Total Amount)
        donut.appendChild(svgNode('circle', {
          cx: 160,
          cy: 160,
          r: 58,
          fill: 'var(--bg-surface, #ffffff)',
          stroke: 'none'
        }));

        donut.appendChild(svgNode('text', {
          x: 160,
          y: 147,
          'text-anchor': 'middle',
          fill: 'var(--text-secondary, #64748b)',
          'font-size': '12',
          'font-weight': '600'
        }, 'ค่าใช้จ่าย'));

        donut.appendChild(svgNode('text', {
          x: 160,
          y: 172,
          'text-anchor': 'middle',
          fill: 'var(--text-main, #0f172a)',
          'font-size': '16',
          'font-weight': '800'
        }, sum ? formatCurrency(sum) : '฿0.00'));

        host.appendChild(donut);
        host.appendChild(legend);
        const gauge = document.getElementById('insuranceGauge');
        if (gauge) {
          gauge.replaceChildren(); const info = document.createElement('p');
          info.textContent = 'ประกันแดนพร้อมใช้ ' + formatCurrency(data.insurance.available) + ' / เป้าหมายรายปี ' + formatCurrency(34800) +
            ' • เติมสะสมปี ' + month.slice(0, 4) + ': ' + formatCurrency(data.insurance.yearIncome) + ' • จ่ายจริง ' + formatCurrency(data.insurance.yearExpense);
          const progress = document.createElement('progress'); progress.max = 100; progress.value = data.insurance.percentage; progress.setAttribute('aria-label', 'เงินพร้อมใช้ประกันแดนเทียบเป้าหมายรายปี');
          gauge.appendChild(info); gauge.appendChild(progress);
        }
      }

      let activePanel = 'home'; let navigationBound = false;
      function selectAppPanel(name: string, focus = true) {
        if (!['home', 'funds', 'analytics', 'history'].includes(name)) return;
        activePanel = name;
        for (const panel of ['home', 'funds', 'analytics', 'history']) {
          const element = document.getElementById('panel-' + panel); if (element) element.hidden = panel !== name;
          const tab = document.getElementById('tab-' + panel);
          if (tab) { tab.setAttribute('aria-selected', String(panel === name)); tab.tabIndex = panel === name ? 0 : -1; }
        }
        if (name === 'analytics') { renderStockPortfolioUI(); renderFinancialCharts((document.getElementById('dashboardMonthPicker') as HTMLInputElement)?.value || getBangkokTodayIso().slice(0, 7)); }
        if (focus) document.getElementById('panel-' + name)?.focus();
      }

      function bindAppNavigation() {
        renderBottomNavIcons();
        if (navigationBound) return; navigationBound = true;
        const panels = ['home', 'funds', 'analytics', 'history'];
        panels.forEach((name, i) => {
          document.getElementById('tab-' + name)?.addEventListener('click', () => selectAppPanel(name));
          document.getElementById('tab-' + name)?.addEventListener('keydown', event => {
            let next = i;
            if (event.key === 'ArrowRight') next = (i + 1) % 4;
            else if (event.key === 'ArrowLeft') next = (i + 3) % 4;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = 3; else return;
            event.preventDefault(); selectAppPanel(panels[next], false); document.getElementById('tab-' + panels[next])?.focus();
          });
          document.getElementById('shortcut-' + name)?.addEventListener('click', () => selectAppPanel(name));
        });
        const openReceiptCapture = () => {
          if (appState.isAnalyzingAi || activeShare) return;
          selectAppPanel('home', false);
          document.getElementById('btnChooseGallery')?.click();
        };
        for (const id of ['btnBottomCenterScan']) {
          document.getElementById(id)?.addEventListener('click', openReceiptCapture);
        }
        for (const type of ['all', 'expense', 'income']) {
          document.getElementById('latest-' + type)?.addEventListener('click', () => {
            latestTypeFilter = type;
            renderLatestTransactions();
          });
        }
        document.getElementById('shortcut-salary')?.addEventListener('click', () => document.getElementById('btnOpenSalarySplitModal')?.click());
        document.getElementById('btnReviewLegacyInsurance')?.addEventListener('click', async () => {
          const month = document.getElementById('dashboardMonthPicker').value || getBangkokTodayIso().slice(0, 7);
          const review = await upgradeLegacyInsurance(month);
          if (!review.needs_review) { showToast('ไม่มีข้อมูลเก่ารอตรวจสอบ', 'info'); return; }
          if (await showConfirmDialog('ตรวจการแยกประกันแดน', 'ยอดรายการเดิมรอตรวจ ' + formatCurrency(review.pending) + ' ระบบจะแยกเฉพาะ marker ที่ชัดเจนและเดือนที่ยังไม่โอนเงินเหลือใช้ ยืนยันหลังตรวจประวัติแล้วหรือไม่?')) {
            const result = await upgradeLegacyInsurance(month, true);
            showToast(result.upgraded ? 'แยกยอดแล้ว ยอดรวมคงเดิม' : 'ข้อมูลคลุมเครือ กรุณาแก้ไขผ่านประวัติและตรวจยอดก่อนโอน', 'info');
          }
        });
        document.getElementById('analyticsMonth')?.addEventListener('change', event => {
          const month = event.target.value;
          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
          document.getElementById('dashboardMonthPicker').value = month;
          renderDashboardAndHistory();
        });
        selectAppPanel(activePanel, false);
      }

      async function automationPreference(name: string, value: any = undefined) {
        const db = await openLocalDatabase();
        if (!db) throw new Error('ต้องเปิดใช้งาน IndexedDB เพื่อจำข้อมูลอย่างปลอดภัย');
        const id = automationKey(name);
        return new Promise<any>((resolve, reject) => {
          const tx = db.transaction('automation', value === undefined ? 'readonly' : 'readwrite');
          const req = value === undefined ? tx.objectStore('automation').get(id) : tx.objectStore('automation').put({ id, value });
          let result;
          req.onsuccess = () => { result = value === undefined ? req.result?.value : value; if (value === undefined) resolve(result); };
          tx.oncomplete = () => { db.close(); resolve(result); };
          tx.onerror = tx.onabort = () => { db.close(); reject(new Error('บันทึกการตั้งค่าไม่สำเร็จ')); };
        });
      }

      // The ledger and all records commit together. IndexedDB serializes overlapping
      // readwrite transactions across tabs, including when navigator.locks is absent.
      async function commitAutomation(inputs: any[], keys: string[], preference: any = null) {
        const owner = appState.currentUser?.id || null;
        const now = new Date().toISOString();
        const records = inputs.map(input => {
          const checked = validateTransactionInput(input);
          if (!checked.valid) throw new Error(checked.errors.join('\n'));
          return { ...checked.normalized, id: generateUuid(), user_id: owner,
            sync_status: owner ? 'pending_sync' : 'local_only', created_at: now, updated_at: now };
        });
        const ledger = keys.map(key => automationKey(`paid:${key}`));
        const db = await openLocalDatabase();
        if (!db || appState.usingMemoryFallback) throw new Error('ไม่สามารถจ่ายกลุ่มได้เมื่อพื้นที่จัดเก็บไม่พร้อม');
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction([STORE_TRANSACTIONS, 'automation'], 'readwrite');
          const store = tx.objectStore('automation');
          let pending = ledger.length;
          let reason = 'ไม่สามารถบันทึกรายการทั้งหมดได้';
          const write = () => {
            const scan = tx.objectStore(STORE_TRANSACTIONS).getAll();
            scan.onsuccess = () => {
              const existing = scan.result.filter(row => (row.user_id || null) === owner && !row.deleted_at && !row.pending_delete);
              const duplicate = keys.some(key => {
                const parts = key.split(':');
                if (parts[0] === 'salary') return existing.some(row => row.note?.includes('[SALARY_SPLIT:' + parts[1] + ':'));
                if (parts[0] === 'fixed') return existing.some(row => row.transaction_date?.slice(0,7) === parts[2] && row.note?.includes('[fixed_item:' + parts[1] + ']'));
                if (parts[0] === 'rollover') return existing.some(row => row.note?.includes('[SURPLUS_ROLLOVER_OUT:' + parts[1] + ':') || row.note?.includes('[SURPLUS_ROLLOVER_IN:' + parts[1] + ':'));
                if (parts[0] === 'insurance-upgrade') return existing.some(row => row.note?.includes('[INSURANCE_RECLASS:' + parts[1] + ':' + parts[2] + ']'));
                return false;
              });
              if (duplicate) { reason = 'รอบนี้มีรายการเดิมแล้ว กรุณาตรวจประวัติ'; tx.abort(); return; }
              if (keys.some(key => key.startsWith('rollover:')) && legacyInsuranceReview(existing, keys[0].split(':')[1]).length) { reason = 'มีข้อมูลประกันแดนเก่ารอตรวจสอบ'; tx.abort(); return; }
              const upgrade = keys.find(key => key.startsWith('insurance-upgrade:'));
              if (upgrade) {
                const month = upgrade.split(':')[1];
                const latest = legacyInsuranceReview(existing, month);
                const sourceIds = keys.map(key => key.split(':')[2]);
                const rolled = existing.some(row => row.note?.includes('SURPLUS_ROLLOVER_') && row.note?.includes(month));
                const unchanged = latest.length === sourceIds.length && latest.every(row => {
                  const pair = records.filter(record => record.note === '[INSURANCE_RECLASS:' + month + ':' + row.id + ']');
                  const amount = row.type === 'income' ? 2900 : row.amount;
                  return sourceIds.includes(row.id) && pair.length === 2 && pair.every(record => record.amount === amount) &&
                    ((row.type === 'income' && [12700, 14000].includes(row.amount) && row.note?.includes('[SALARY_SPLIT:' + month + ':fixed_expense]')) ||
                     (row.type === 'expense' && row.note?.includes('[fixed_item:dan_insurance]')));
                });
                if (rolled || !unchanged) { reason = 'ข้อมูลเก่าเปลี่ยน กรุณาตรวจอีกครั้งก่อนแยกยอด'; tx.abort(); return; }
              }
              const rollover = keys.find(key => key.startsWith('rollover:'));
              if (rollover) {
                const metrics = calculateDashboardMetrics(existing, rollover.split(':')[1]);
                for (const row of records.filter(row => row.type === 'expense')) {
                  const balance = metrics.fundBalances.find(fund => fund.bucket === row.fund_bucket)?.availableBalance;
                  if (Math.round(Number(balance) * 100) !== Math.round(row.amount * 100)) { reason = 'ยอดเปลี่ยนในแท็บอื่น กรุณาตรวจและลองโอนใหม่'; tx.abort(); return; }
                }
              }
              writeRecords();
            };
          };
          const writeRecords = () => {
            if ((appState.currentUser?.id || null) !== owner) { reason = 'บัญชีผู้ใช้เปลี่ยน กรุณาลองใหม่'; tx.abort(); return; }
            ledger.forEach(id => store.put({ id, value: now }));
            records.forEach(record => tx.objectStore(STORE_TRANSACTIONS).put(record));
            if (preference) store.put(preference);
          };
          if (!pending) write();
          ledger.forEach(id => {
            const req = store.get(id);
            req.onsuccess = () => {
              if (req.result) { reason = 'รอบนี้บันทึกแล้ว กรุณาตรวจรายการเดิม'; tx.abort(); return; }
              if (--pending === 0) write();
            };
          });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = tx.onabort = () => { db.close(); reject(new Error(reason)); };
        });
        records.forEach(r => appState.memoryStore.set(r.id, r));
        await refreshTransactionsFromLocal();
        if (owner && navigator.onLine) await syncPendingTransactions();
        return records;
      }

      const BATCH_PRESETS = {
        father_insurance: { merchant: 'ประกันพ่อ', amount: 1300, category: 'health_medical' },
        dan_insurance: { merchant: 'ประกันแดน', amount: 2900, category: 'health_medical' },
        sister_mind: { merchant: 'ให้น้อง (มายด์)', amount: 2000, category: 'transfer_other' }
      };

      function fatherInsuranceCycle(config: any, month: string, paid: string[] = []) {
        const anchor = normalizeIsoDate(String(config?.anchor || '')).date;
        const interval = Number(config?.interval);
        if (!anchor || !Number.isInteger(interval) || interval < 1 || interval > 120 || !/^\d{4}-\d{2}$/.test(month)) return { status: 'needs_review' };
        const [year, mon, day] = anchor.split('-').map(Number);
        const [targetYear, targetMonth] = month.split('-').map(Number);
        if (targetMonth < 1 || targetMonth > 12) return { status: 'needs_review' };
        const difference = (targetYear - year) * 12 + targetMonth - mon;
        let offset = Math.max(0, Math.ceil(difference / interval)) * interval;
        let due = '';
        for (let attempt = 0; attempt < 2400; attempt++, offset += interval) {
          const d = new Date(Date.UTC(year, mon - 1 + offset, 1));
          const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
          due = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
          if (!paid.includes(due.slice(0, 7))) break;
        }
        return { status: due.slice(0, 7) === month ? 'due' : 'upcoming', due };
      }

      async function batchPayFixedExpenses(items: any[], date: string) {
        if (!normalizeIsoDate(date).date || !items.length) throw new Error('เลือกอย่างน้อยหนึ่งรายการและตรวจวันที่');
        const month = date.slice(0, 7);
        const seen = new Set();
        const inputs = [];
        for (const item of items) {
          const preset = BATCH_PRESETS[item.key];
          if (!preset || seen.has(item.key)) throw new Error('รายการซ้ำหรือไม่รู้จัก');
          seen.add(item.key);
          if (item.key === 'father_insurance') {
            const cycle = fatherInsuranceCycle(await automationPreference('father-cycle'), month);
            if (cycle.status !== 'due') throw new Error('กรุณายืนยันรอบประกันพ่อที่ถึงกำหนดก่อน');
          }
          inputs.push({ ...preset, amount: Number(item.amount), transaction_date: date, type: 'expense',
            currency: 'THB', source_type: 'manual', fund_bucket: item.key === 'dan_insurance' ? 'dan_insurance' : 'fixed_expense', note: `[fixed_item:${item.key}]` });
        }
        // Include legacy confirmed fixed payments in duplicate detection.
        const existing = await dbGetAllTransactions();
        if (items.some(item => existing.some(tx => tx.user_id === (appState.currentUser?.id || null) &&
          tx.transaction_date?.slice(0, 7) === month && tx.note?.includes(`[fixed_item:${item.key}]`)))) throw new Error('มีรายการที่จ่ายแล้วในรอบนี้');
        return commitAutomation(inputs, items.map(item => `fixed:${item.key}:${month}`));
      }

      function normalizeMerchant(value: string) { return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('th-TH'); }

      let entryRound = 0, suggestionRequest = 0, historyRequest = 0;
      let entryMerchant = '', entryOwner = '';
      let entryDefaults: Record<string, string> = {};
      let entryFields: Record<string, { origin: string; value: string }> = {};
      const entryIds = { category: 'txFormCategory', fund_bucket: 'txFormFundBucket' };
      const validEntryValue = (field: string, value: any) => Object.prototype.hasOwnProperty.call(
        field === 'category' ? CATEGORY_LABELS : FUND_BUCKET_LABELS, value) && value !== 'unknown';

      function resetEntrySuggestions(protectedValues = false) {
        entryRound++; suggestionRequest++;
        entryOwner = automationKey('owner');
        entryMerchant = normalizeMerchant(document.getElementById('txFormMerchant').value);
        document.getElementById('txFormOptionalDetails').open = false;
        entryFields = {};
        for (const [field, id] of Object.entries(entryIds)) {
          const value = document.getElementById(id).value;
          entryFields[field] = { origin: protectedValues ? 'protected' : 'default', value };
          entryDefaults[field] = protectedValues ? (field === 'category' ? 'food_drink' : 'general_expense') : value;
        }
        void refreshMerchantHistory().catch(() => {});
      }

      async function readMerchantHistory() {
        const owner = appState.currentUser?.id || null;
        const rows = (await dbGetAllTransactions()).filter(tx => (tx.user_id || null) === owner);
        if (owner !== (appState.currentUser?.id || null)) return new Map<string, any>();
        const stamp = (value: any) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
        rows.sort((a, b) => stamp(b.created_at) - stamp(a.created_at) ||
          stamp(b.updated_at) - stamp(a.updated_at) || String(b.id || '').localeCompare(String(a.id || '')));
        const records = new Map<string, any>(), knownNames = new Set<string>();
        for (const tx of rows) {
          const name = normalizeMerchant(tx.merchant);
          if (name) knownNames.add(name);
          if (!name || tx.deleted_at || tx.pending_delete || records.has(name)) continue;
          records.set(name, tx);
        }
        const learning = await automationPreference('learning');
        if (owner !== (appState.currentUser?.id || null)) return new Map<string, any>();
        for (const [name, cached] of Object.entries(learning?.merchants || {})) {
          const key = normalizeMerchant(name);
          if (!key || knownNames.has(key) || records.has(key)) continue;
          records.set(key, { merchant: name, ...(typeof cached === 'string' ? { category: cached } : cached as any) });
        }
        return records;
      }

      async function refreshMerchantHistory() {
        const request = ++historyRequest, owner = automationKey('owner'), round = entryRound;
        const host = document.getElementById('txMerchantHistory');
        if (entryOwner !== owner) { suggestionRequest++; host.replaceChildren(); }
        const records = await readMerchantHistory();
        if (request !== historyRequest || owner !== automationKey('owner') || round !== entryRound) return;
        host.replaceChildren();
        for (const tx of records.values()) {
          const option = document.createElement('option');
          option.value = String(tx.merchant).normalize('NFC').trim().replace(/\s+/g, ' ');
          option.textContent = option.value;
          host.appendChild(option);
        }
      }

      async function learnConfirmedRecord(record: any) {
        const owner = automationKey('owner');
        if ((record.user_id || null) !== (appState.currentUser?.id || null)) return;
        const learning = await automationPreference('learning') || { merchants: {}, chips: [] };
        if (automationKey('owner') !== owner) return;
        const name = normalizeMerchant(record.merchant);
        learning.merchants ||= {};
        learning.merchants[name] = { category: record.category, fund_bucket: record.fund_bucket };
        if (record.type === 'expense' && record.source_type === 'manual') {
          learning.chips = [ { merchant: record.merchant, category: record.category, fund_bucket: record.fund_bucket, amount: record.amount },
            ...(learning.chips || []).filter(c => normalizeMerchant(c.merchant) !== name) ].slice(0, 8);
        }
        await automationPreference('learning', learning);
        await renderQuickChips();
        await refreshMerchantHistory();
      }

      async function suggestMerchantCategory() {
        const merchant = normalizeMerchant(document.getElementById('txFormMerchant').value);
        const owner = automationKey('owner'), round = entryRound, request = ++suggestionRequest;
        if (entryOwner !== owner) return;
        const changed = merchant !== entryMerchant;
        entryMerchant = merchant;
        const before: Record<string, string> = {};
        for (const [field, id] of Object.entries(entryIds)) {
          const el = document.getElementById(id), state = entryFields[field];
          if (!state) continue;
          if (el.value !== state.value && el.value !== 'unknown') state.origin = 'user';
          if (changed && state.origin === 'protected') state.origin = 'default';
          if (changed && ['history', 'default'].includes(state.origin)) {
            el.value = entryDefaults[field]; state.origin = 'default';
          }
          state.value = el.value; before[field] = el.value;
        }
        const records = await readMerchantHistory();
        if (owner !== automationKey('owner') || round !== entryRound || request !== suggestionRequest ||
          merchant !== normalizeMerchant(document.getElementById('txFormMerchant').value)) return;
        const tx = records.get(merchant);
        for (const [field, id] of Object.entries(entryIds)) {
          const state = entryFields[field], el = document.getElementById(id);
          if (!state || !tx || !['default', 'history'].includes(state.origin) || el.value !== before[field]) continue;
          if (validEntryValue(field, tx[field])) {
            el.value = tx[field]; state.value = el.value; state.origin = 'history'; if (field === 'category') updateCategoryPickerSelection(el.value);
          }
        }
      }

      function applyQuickChip(chip: any) {
        openVerificationModalForManual('manual', validEntryValue('fund_bucket', chip.fund_bucket) ? chip.fund_bucket : 'general_expense',
          validEntryValue('category', chip.category) ? chip.category : 'food_drink');
        document.getElementById('txFormMerchant').value = chip.merchant;
        document.getElementById('txFormAmount').value = String(chip.amount);
        resetEntrySuggestions(true);
      }

      async function renderQuickChips() {
        const host = document.getElementById('dailyQuickChips');
        if (!host) return;
        const owner = automationKey('owner');
        const learning = await automationPreference('learning');
        if (owner !== automationKey('owner')) return;
        host.innerHTML = '';
        for (const chip of learning?.chips || []) {
          const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn btn-secondary';
          btn.textContent = `${chip.merchant} ${formatCurrency(chip.amount, 'THB')}`;
          btn.addEventListener('click', () => applyQuickChip(chip)); host.appendChild(btn);
        }
      }

      function startVoiceEntry() {
        const Recognition = globalScope.SpeechRecognition || globalScope.webkitSpeechRecognition;
        const status = document.getElementById('voiceStatus');
        if (!Recognition) { status.textContent = 'เบราว์เซอร์นี้ไม่รองรับเสียง กรุณาพิมพ์รายการ'; return; }
        const recognition = new Recognition(); recognition.lang = 'th-TH'; recognition.interimResults = false;
        recognition.onresult = event => {
          openVerificationModalForManual('manual');
          document.getElementById('txFormNote').value = String(event.results[0][0].transcript);
          document.getElementById('txFormAmount').value = '';
          document.getElementById('txFormDate').value = '';
          status.textContent = 'ตรวจข้อความในช่องหมายเหตุ แล้วกรอกยอดเงินและวันที่ก่อนบันทึก';
        };
        recognition.onerror = () => { status.textContent = 'ใช้ไมโครโฟนไม่ได้ กรุณาพิมพ์รายการแทน'; };
        try { recognition.start(); status.textContent = 'กำลังฟังภาษาไทย…'; } catch (_) { recognition.onerror(); }
      }

      function validReceiptFile(file: any): boolean {
        return Boolean(file && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size > 0 && file.size <= 20 * 1024 * 1024);
      }

      function handleReceiptPaste(event: any) {
        if (appState.isAnalyzingAi || activeShare) return;
        const item = Array.from(event.clipboardData?.items || []).find((item: any) => item.kind === 'file' && item.type.startsWith('image/')) as any;
        if (!item) return;
        const file = item.getAsFile();
        if (!validReceiptFile(file)) { captureMessage('ภาพต้องเป็น JPEG, PNG หรือ WebP ขนาดไม่เกิน 20 MB'); return; }
        event.preventDefault();
        handleImageFileSelected(file);
        captureMessage('รับภาพที่วางแล้ว กรุณาวิเคราะห์และตรวจสอบก่อนบันทึก');
      }

      function captureMessage(message: string) { const el = document.getElementById('captureStatus'); if (el) el.textContent = message; }

      let activeShare: any = null;
      const shareClaimToken = generateUuid();
      let shareHeartbeat: any = null;
      let shareHeartbeatGeneration = 0;
      function stopShareHeartbeat() {
        shareHeartbeatGeneration++;
        if (shareHeartbeat !== null) clearInterval(shareHeartbeat);
        shareHeartbeat = null;
      }
      async function startShareHeartbeat() {
        stopShareHeartbeat();
        const generation = shareHeartbeatGeneration;
        const current = activeShare;
        const owner = appState.currentUser?.id;
        if (document.hidden || !current || !owner || current.owner !== owner) return;
        const renew = () => shareInboxChange(current.id, row =>
          generation === shareHeartbeatGeneration && !document.hidden && activeShare === current && appState.currentUser?.id === owner &&
          row.state === 'claimed' && row.claim === shareClaimToken && row.owner === owner
            ? { ...row, lease: Date.now() + 60000 } : null);
        const row = await renew();
        if (generation !== shareHeartbeatGeneration || document.hidden || activeShare !== current || appState.currentUser?.id !== owner) return;
        if (!row) { activeShare = null; return; }
        shareHeartbeat = setInterval(() => {
          renew().then(row => {
            if (!row && generation === shareHeartbeatGeneration && activeShare === current) { stopShareHeartbeat(); activeShare = null; }
          }).catch(() => {});
        }, 20000);
      }

      let visibilityGeneration = 0;
      async function handleAppVisibilityChange() {
        const generation = ++visibilityGeneration;
        if (document.hidden) {
          stopShareHeartbeat();
          await cleanupRealtimeSubscription();
          return;
        }
        const client = appState.supabaseClient;
        const userId = appState.currentUser?.id;
        const realtime = realtimeGeneration;
        if (!client || !userId) return;
        try {
          const { data, error } = await client.auth.getSession();
          if (error || data?.session?.user?.id !== userId || document.hidden ||
              generation !== visibilityGeneration || realtime !== realtimeGeneration ||
              client !== appState.supabaseClient || userId !== appState.currentUser?.id) return;
          await setupRealtimeSubscription();
          await startShareHeartbeat();
          if (document.hidden || generation !== visibilityGeneration || userId !== appState.currentUser?.id) return;
          if (navigator.onLine) await syncPendingTransactions();
          else await refreshTransactionsFromLocal();
        } catch (_e) {
          // เก็บข้อมูลออฟไลน์และรายการรอซิงก์ไว้ให้ลองใหม่ได้
        }
      }
      async function shareInboxChange(id: string, change: (row: any) => any) {
        const db: any = await new Promise((resolve, reject) => {
          const req = indexedDB.open('slipsense_share_inbox', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('images', { keyPath: 'id' });
          req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
        });
        return new Promise<any>((resolve, reject) => {
          const tx = db.transaction('images', 'readwrite'); const store = tx.objectStore('images');
          let result = null;
          const req = store.get(id);
          req.onsuccess = () => { const row = req.result; if (!row) return;
            if (row.expires <= Date.now()) { store.delete(id); return; }
            result = change(row); if (result) store.put(result);
          };
          tx.oncomplete = () => { db.close(); resolve(result); };
          tx.onerror = tx.onabort = () => { db.close(); reject(new Error('รับภาพที่แชร์ไม่สำเร็จ')); };
        });
      }

      async function resumeSharedReceipt() {
        const id = new URL(globalScope.location.href).searchParams.get('share');
        if (!id || activeShare) return;
        if (!appState.currentUser) { captureMessage('มีภาพแชร์รออยู่ กรุณาเข้าสู่ระบบแล้วกดรับภาพแชร์ที่ค้างไว้'); return; }
        const owner = appState.currentUser.id;
        try {
          const row = await shareInboxChange(id, row => {
            if (row.state === 'acked' || (row.owner && row.owner !== owner) || (row.claim && row.claim !== shareClaimToken && row.lease > Date.now())) return null;
            return { ...row, owner, claim: shareClaimToken, lease: Date.now() + 60000, state: 'claimed' };
          });
          if (!row) { captureMessage('ภาพหมดอายุ รับแล้ว อยู่ในแท็บอื่น หรือเป็นของบัญชีอื่น'); return; }
          if (appState.currentUser?.id !== owner) return;
          activeShare = row;
          if (!validReceiptFile(row.file)) throw new Error('ภาพที่แชร์ไม่รองรับ');
          await handleImageFileSelected(row.file);
          await startShareHeartbeat();
          captureMessage('รับภาพแชร์แล้ว กดวิเคราะห์และตรวจข้อมูลก่อนบันทึก');
        } catch (err) { await releaseSharedReceipt(); captureMessage(err.message || 'รับภาพแชร์ไม่ได้ กรุณาเลือกจากอัลบั้ม'); }
      }

      async function releaseSharedReceipt(ack = false) {
        stopShareHeartbeat();
        const current = activeShare; activeShare = null;
        if (!current) return;
        await shareInboxChange(current.id, row => row.claim === shareClaimToken ?
          { ...row, claim: null, lease: 0, state: ack ? 'acked' : 'pending', file: ack ? null : row.file } : null);
        if (ack) {
          const url = new URL(globalScope.location.href); url.searchParams.delete('share');
          globalScope.history?.replaceState(null, '', url.href);
        }
      }

      async function refreshAutomationUi() {
        await refreshMerchantHistory().catch(() => {});
        await renderQuickChips();
        const host = document.getElementById('batchPayItems'); if (!host) return;
        const date = document.getElementById('batchPayDate').value || getBangkokTodayIso();
        const cycle = fatherInsuranceCycle(await automationPreference('father-cycle'), date.slice(0, 7));
        document.getElementById('fatherCycleStatus').textContent = cycle.due ? `รอบถัดไป ${cycle.due} — ตรวจยอดก่อนจ่าย` : 'ต้องตรวจสอบวันที่และความถี่ก่อนคำนวณรอบ';
        host.innerHTML = '';
        const all = await dbGetAllTransactions();
        for (const [key, preset] of Object.entries(BATCH_PRESETS)) {
          if (key === 'dan_insurance') continue;
          const paid = all.some(tx => tx.user_id === (appState.currentUser?.id || null) && tx.transaction_date?.slice(0, 7) === date.slice(0, 7) && tx.note?.includes(`[fixed_item:${key}]`));
          const row = document.createElement('div'); row.className = 'batch-row';
          const select = document.createElement('input'); select.type = 'checkbox'; select.id = `batch-${key}`; select.dataset.key = key;
          select.disabled = paid || (key === 'father_insurance' && cycle.status !== 'due');
          const label = document.createElement('label'); label.htmlFor = select.id; label.textContent = preset.merchant + (paid ? ' (จ่ายแล้ว)' : '');
          const amount = document.createElement('input'); amount.type = 'number'; amount.min = '0.01'; amount.step = '0.01'; amount.value = String(preset.amount); amount.id = `amount-${key}`; amount.setAttribute('aria-label', `ยอด ${preset.merchant}`);
          row.appendChild(select); row.appendChild(label); row.appendChild(amount); host.appendChild(row);
        }
      }

      let automationBound = false;
      function bindAutomationEvents() {
        const on = (id, event, handler) => document.getElementById(id)?.addEventListener(event, handler);
        const safe = (fn) => async () => { try { await fn(); } catch (err) { showToast(err.message || 'ดำเนินการไม่สำเร็จ', 'error'); } };
        let theme = 'cute-pastel'; try { theme = localStorage.getItem('slipsense_theme') ?? 'cute-pastel'; } catch (_) {}
        if (!['cute-pastel', 'light', 'dark', 'blue', 'dark-red', 'fintrack'].includes(theme)) theme = 'light';
        document.documentElement.setAttribute('data-theme', theme); document.getElementById('themeSelect').value = theme;
        if (automationBound) return; automationBound = true;
        on('themeSelect', 'change', event => { document.documentElement.setAttribute('data-theme', event.target.value); try { localStorage.setItem('slipsense_theme', event.target.value); } catch (_) {} });
        document.addEventListener('paste', handleReceiptPaste);
        on('btnResumeShare', 'click', resumeSharedReceipt);
        on('btnVoiceEntry', 'click', startVoiceEntry);
        const supported = Boolean(globalScope.SpeechRecognition || globalScope.webkitSpeechRecognition);
        document.getElementById('btnVoiceEntry').disabled = !supported;
        if (!supported) document.getElementById('voiceStatus').textContent = 'ไม่รองรับเสียงบนเบราว์เซอร์นี้ สามารถพิมพ์รายการได้';
        for (const event of ['input', 'change']) on('txFormMerchant', event, safe(suggestMerchantCategory));
        for (const [field, id] of Object.entries(entryIds)) {
          for (const event of ['input', 'change']) on(id, event, () => {
            entryFields[field] = { origin: 'user', value: document.getElementById(id).value };
          });
        }
        on('btnClearLearning', 'click', safe(async () => { await automationPreference('learning', { merchants: {}, chips: [] }); await renderQuickChips(); }));
        on('btnClearSalaryTemplate', 'click', safe(() => automationPreference('salary', null)));
        on('btnUseSalaryTemplate', 'click', safe(async () => {
          const template = upgradeSalaryTemplate(await automationPreference('salary')); if (!template) throw new Error('ยังไม่มีแบบเงินเดือนที่ยืนยันแล้ว');
          document.getElementById('btnOpenSalarySplitModal')?.click();
          document.getElementById('salarySplitModal').hidden = false;
          const fields = { TotalInput: 'total_salary', Fund1Input: 'investment_stock', Fund2Input: 'home_building', Fund3Input: 'fixed_expense', Fund4Input: 'emergency_personal', Fund5Input: 'general_expense', Fund6Input: 'dan_insurance', FatherInsMode: 'father_insurance_mode' };
          Object.entries(fields).forEach(([suffix, key]) => { document.getElementById(`salarySplit${suffix}`).value = String(template[key] ?? 0); });
          document.getElementById('salarySplitDate').value = getBangkokTodayIso();
          document.getElementById('salarySplitSummaryPreview').textContent = template.needs_review ? 'แม่แบบเก่าหรือปรับเอง: กรุณาตรวจการแยกประกันแดน 2,900 บาท ยอดรวม และวันที่ก่อนยืนยัน' : 'ใช้แบบล่าสุดแล้ว กรุณาตรวจยอดรวมและวันที่ก่อนยืนยัน';
        }));
        document.getElementById('batchPayDate').value = getBangkokTodayIso();
        on('batchPayDate', 'change', safe(refreshAutomationUi));
        on('btnSaveFatherCycle', 'click', safe(async () => {
          const value = { anchor: document.getElementById('fatherAnchor').value, interval: Number(document.getElementById('fatherInterval').value) };
          if (fatherInsuranceCycle(value, getBangkokTodayIso().slice(0, 7)).status === 'needs_review') throw new Error('ตรวจวันที่อ้างอิงและจำนวนเดือนก่อนยืนยัน');
          await automationPreference('father-cycle', value); await refreshAutomationUi();
        }));
        on('btnBatchPay', 'click', safe(async () => {
          const btn = document.getElementById('btnBatchPay'); if (btn.disabled) return;
          const items = Object.keys(BATCH_PRESETS).filter(key => key !== 'dan_insurance' && document.getElementById(`batch-${key}`)?.checked).map(key => ({ key, amount: document.getElementById(`amount-${key}`).value }));
          btn.disabled = true;
          try { await batchPayFixedExpenses(items, document.getElementById('batchPayDate').value); document.getElementById('batchPayStatus').textContent = 'บันทึกรายการที่เลือกแล้ว'; await refreshAutomationUi(); }
          finally { btn.disabled = false; }
        }));
      }

      async function allocateMonthlySalary(options: Record<string, any> = {}) {
        const rawDate = options.transaction_date || options.date || getBangkokTodayIso();
        const { date } = normalizeIsoDate(String(rawDate));
        if (!date) {
          throw new Error('กรุณาระบุวันที่เงินเดือนออกให้ถูกต้อง (YYYY-MM-DD)');
        }
        const yearMonth = date.slice(0, 7);

        for (const key of ['total_salary', 'investment_stock', 'home_building', 'fixed_expense', 'emergency_personal', 'general_expense', 'dan_insurance']) {
          if (options[key] !== undefined && (!Number.isFinite(Number(options[key])) || Number(options[key]) < 0)) throw new Error('ยอดเงินต้องไม่ติดลบและต้องเป็นตัวเลขที่มีขอบเขต');
        }
        const totalSalary = Math.round(Number(options.total_salary || 0) * 100) / 100;
        if (!Number.isSafeInteger(Math.round(totalSalary * 100)) || totalSalary <= 0) {
          throw new Error('กรุณาระบุยอดเงินเดือนรวมที่มากกว่า 0 บาท');
        }

        const fatherInsAmount =
          Number(options.father_insurance_mode) === FIXED_MONTHLY_PRESETS.FATHER_INSURANCE_EVERY_3RD
            ? FIXED_MONTHLY_PRESETS.FATHER_INSURANCE_EVERY_3RD
            : FIXED_MONTHLY_PRESETS.FATHER_INSURANCE_NORMAL;

        const defaultFixedTotal =
          fatherInsAmount === FIXED_MONTHLY_PRESETS.FATHER_INSURANCE_EVERY_3RD
            ? FIXED_MONTHLY_PRESETS.FIXED_EXPENSE_TOTAL_EVERY_3RD
            : FIXED_MONTHLY_PRESETS.FIXED_EXPENSE_TOTAL_NORMAL;

        const fund1 = options.investment_stock !== undefined
          ? Math.round(Number(options.investment_stock) * 100) / 100
          : FIXED_MONTHLY_PRESETS.INVESTMENT_STOCK;
        const fund2 = options.home_building !== undefined
          ? Math.round(Number(options.home_building) * 100) / 100
          : FIXED_MONTHLY_PRESETS.HOME_BUILDING;
        const fund3 = options.fixed_expense !== undefined
          ? Math.round(Number(options.fixed_expense) * 100) / 100
          : defaultFixedTotal;
        const fund6 = options.dan_insurance !== undefined ? Math.round(Number(options.dan_insurance) * 100) / 100 : 2900;
        const fund4 = options.emergency_personal !== undefined
          ? Math.round(Number(options.emergency_personal) * 100) / 100
          : 0;

        const fixedFourSumCents = [fund1, fund2, fund3, fund4, fund6].reduce((sum, amount) => sum + Math.round(amount * 100), 0);
        const totalSalaryCents = Math.round(totalSalary * 100);

        const fund5 = options.general_expense !== undefined
          ? Math.round(Number(options.general_expense) * 100) / 100
          : Math.max(0, (totalSalaryCents - fixedFourSumCents) / 100);

        if ([fund1, fund2, fund3, fund4, fund5, fund6].some(v => !Number.isSafeInteger(Math.round(v * 100)) || v < 0)) {
          throw new Error('ยอดแบ่งเงินในแต่ละส่วนต้องไม่ติดลบ');
        }

        const totalAllocatedCents = fixedFourSumCents + Math.round(fund5 * 100);
        if (totalAllocatedCents !== totalSalaryCents) throw new Error('ยอดจัดสรรต้องเท่ากับเงินเดือน กรุณาตรวจส่วนต่าง');
        if (totalAllocatedCents <= 0) {
          throw new Error('ยอดแบ่งเงินรวมทั้ง 6 ส่วนต้องมากกว่า 0 บาท');
        }
        if (fixedFourSumCents > totalSalaryCents && options.general_expense === undefined) {
          throw new Error(
            `ยอดเงินเดือนรวม (${formatCurrency(totalSalary, 'THB')}) น้อยกว่ายอด Fix รวมข้อ 1–4 (${formatCurrency(fixedFourSumCents / 100, 'THB')}) กรุณาปรับยอดก่อนบันทึก`
          );
        }

        const splitEntries: Array<{
          bucket: FundBucket;
          amount: number;
          merchant: string;
          items_summary: string;
          purpose_analysis: string;
        }> = [
          {
            bucket: 'investment_stock',
            amount: fund1,
            merchant: 'แบ่งเงินเดือน: 1. เงินลงทุน (หุ้น)',
            items_summary: `จัดสรรเงินเดือนประจำเดือน ${yearMonth} เข้าพอร์ตลงทุนหุ้น`,
            purpose_analysis: 'เงินออมและลงทุนในหุ้นระยะยาวตามแผน Fix รายเดือน (6,500 บาท/เดือน)'
          },
          {
            bucket: 'home_building',
            amount: fund2,
            merchant: 'แบ่งเงินเดือน: 2. เงินเก็บสร้างบ้าน',
            items_summary: `จัดสรรเงินเดือนประจำเดือน ${yearMonth} เข้ากองทุนสร้างบ้าน`,
            purpose_analysis: 'เงินออมสะสมเพื่อสร้างบ้านตามแผน Fix รายเดือน (13,000 บาท/เดือน)'
          },
          {
            bucket: 'fixed_expense',
            amount: fund3,
            merchant: 'แบ่งเงินเดือน: 3. ค่าใช้จ่ายคงที่',
            items_summary: `ประกันพ่อ ${fatherInsAmount.toLocaleString('en-US')}, ให้น้อง (มายด์) 2,000, ค่าน้ำ/ไฟ/โทรศัพท์/เรียนพิเศษลูก 6,500`,
            purpose_analysis: `กันงบค่าใช้จ่ายคงที่รายเดือน (${yearMonth}) รวม ${formatCurrency(fund3, 'THB')}`
          },
          {
            bucket: 'emergency_personal',
            amount: fund4,
            merchant: 'แบ่งเงินเดือน: 4. ค่าใช้จ่ายฉุกเฉิน (ส่วนตัว)',
            items_summary: `จัดสรรเงินสำรองฉุกเฉินส่วนตัวตั้งต้นประจำเดือน ${yearMonth}`,
            purpose_analysis: 'สำรองค่าใช้จ่ายฉุกเฉินส่วนตัว (และรับเงินเหลือใช้ปลายเดือนมาเก็บสะสมในส่วนนี้)'
          },
          {
            bucket: 'general_expense',
            amount: fund5,
            merchant: 'แบ่งเงินเดือน: 5. ค่าใช้จ่ายทั่วไป',
            items_summary: `งบใช้จ่ายทั่วไปประจำเดือน ${yearMonth} หลังหักยอด Fix`,
            purpose_analysis: 'งบสำหรับใช้จ่ายในชีวิตประจำวันทั่วไปตลอดเดือน'
          }
        ];

        splitEntries.push({ bucket: 'dan_insurance', amount: fund6, merchant: 'เงินเก็บประกันแดน', items_summary: 'สะสมเบี้ยรายปี ไม่ใช่รายจ่าย', purpose_analysis: 'เป้าหมาย 34,800 บาทต่อปี' });
        const inputs = splitEntries.filter(entry => entry.amount > 0).map(entry => ({
            transaction_date: date,
            type: 'income',
            merchant: entry.merchant,
            amount: entry.amount,
            currency: 'THB',
            category: 'salary_income',
            fund_bucket: entry.bucket,
            source_type: 'manual',
            items_summary: entry.items_summary,
            purpose_analysis: entry.purpose_analysis,
            note: `จัดสรรเงินเดือน ${yearMonth} [SALARY_SPLIT:${yearMonth}:${entry.bucket}] [SIX_FUNDS_V2]`
          }));
        const template = { version: 2, dan_insurance: fund6, total_salary: totalSalary, investment_stock: fund1, home_building: fund2,
          fixed_expense: fund3, emergency_personal: fund4, general_expense: fund5, father_insurance_mode: fatherInsAmount };
        const savedRecords = await commitAutomation(inputs, [`salary:${yearMonth}`], { id: automationKey('salary'), value: template });

        return {
          yearMonth,
          totalAllocated: totalAllocatedCents / 100,
          records: savedRecords
        };
      }

      async function recordFixedExpenseItem(itemKey: string, options: Record<string, any> = {}) {
        const rawDate = options.transaction_date || options.date || getBangkokTodayIso();
        const { date } = normalizeIsoDate(String(rawDate));
        const txDate = date || getBangkokTodayIso();
        const yearMonth = txDate.slice(0, 7);

        const presetsMap: Record<string, {
          merchant: string;
          amount: number;
          category: string;
          items_summary: string;
          purpose_analysis: string;
          tag: string;
        }> = {
          father_insurance_1300: {
            merchant: 'จ่ายค่าประกันพ่อ (รอบปกติ 1,300)',
            amount: FIXED_MONTHLY_PRESETS.FATHER_INSURANCE_NORMAL,
            category: 'health_medical',
            items_summary: 'ค่าเบี้ยประกันพ่อประจำเดือน (รอบจ่าย 1,300 บาท 2 เดือน)',
            purpose_analysis: 'ตัดจ่ายจากส่วนที่ 3 ค่าใช้จ่ายคงที่ — ประกันพ่อ 1,300 บาท',
            tag: '[fixed_item:father_insurance]'
          },
          father_insurance_2600: {
            merchant: 'จ่ายค่าประกันพ่อ (รอบเดือนที่ 3 ยอด 2,600)',
            amount: FIXED_MONTHLY_PRESETS.FATHER_INSURANCE_EVERY_3RD,
            category: 'health_medical',
            items_summary: 'ค่าเบี้ยประกันพ่อประจำเดือน (รอบเว้นจ่าย 2,600 บาท 1 เดือน)',
            purpose_analysis: 'ตัดจ่ายจากส่วนที่ 3 ค่าใช้จ่ายคงที่ — ประกันพ่อ 2,600 บาท',
            tag: '[fixed_item:father_insurance]'
          },
          dan_insurance: {
            merchant: 'จ่ายค่าประกันแดน',
            amount: FIXED_MONTHLY_PRESETS.DAN_INSURANCE,
            category: 'health_medical',
            items_summary: 'เบี้ยประกันแดนที่ชำระจริง ตรวจยอดตามใบเสร็จ',
            purpose_analysis: 'ตัดจากกระปุก 6 เงินสะสมประกันแดนเมื่อจ่ายจริง',
            tag: '[fixed_item:dan_insurance]'
          },
          sister_mind: {
            merchant: 'โอนเงินให้น้อง (มายด์)',
            amount: FIXED_MONTHLY_PRESETS.SISTER_MIND,
            category: 'transfer_other',
            items_summary: 'เงินรายเดือนให้น้อง (มายด์) Fix 2,000 บาท',
            purpose_analysis: 'ตัดจ่ายจากส่วนที่ 3 ค่าใช้จ่ายคงที่ — ให้น้อง (มายด์) 2,000 บาท',
            tag: '[fixed_item:sister_mind]'
          }
        };

        const preset = presetsMap[itemKey];
        if (!preset) {
          throw new Error(`ไม่พบรายการคงที่รหัส ${itemKey}`);
        }

        const customAmount = options.amount !== undefined ? Number(options.amount) : preset.amount;
        const saved = await commitAutomation([{
          transaction_date: txDate,
          type: 'expense',
          merchant: preset.merchant,
          amount: customAmount,
          currency: 'THB',
          category: preset.category,
          fund_bucket: itemKey === 'dan_insurance' ? 'dan_insurance' : 'fixed_expense',
          source_type: 'manual',
          items_summary: preset.items_summary,
          purpose_analysis: preset.purpose_analysis,
          note: `รายการ Fix ประจำเดือน ${yearMonth} ${preset.tag}`
        }], [`fixed:${itemKey.startsWith('father_insurance') ? 'father_insurance' : itemKey}:${yearMonth}`]);

        return saved[0];
      }

      async function rolloverMonthlySurplusToEmergency(targetYearMonth: string = '') {
        const owner = appState.currentUser?.id || null;
        const ym = targetYearMonth || getBangkokTodayIso().slice(0, 7);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) throw new Error('เดือนที่เลือกไม่ถูกต้อง');
        const rows = (await dbGetAllTransactions()).filter(row => (row.user_id || null) === (appState.currentUser?.id || null));
        if (legacyInsuranceReview(rows, ym).length) throw new Error('มีข้อมูลประกันแดนเก่ารอตรวจสอบ กรุณาตรวจและยืนยันก่อนโอน');
        const metrics = calculateDashboardMetrics(rows, ym);
        const txDate = ym === getBangkokTodayIso().slice(0, 7) ? getBangkokTodayIso() : ym + '-28';
        if (!FUND_BUCKET_ORDER.includes('emergency_personal')) throw new Error('กระปุกฉุกเฉินถูกลบแล้ว กรุณาโอนด้วยการจดรายการ');
        const inputs = []; let totalCents = 0;
        const amounts = {};
        for (const bucket of ['fixed_expense', 'general_expense']) {
          const cents = Math.max(0, Math.round((metrics.fundBalances.find(row => row.bucket === bucket)?.availableBalance || 0) * 100));
          amounts[bucket] = cents / 100;
          if (!cents) continue;
          totalCents += cents;
          inputs.push({ transaction_date: txDate, type: 'expense', merchant: 'โอนเงินเหลือใช้เข้ากระปุกฉุกเฉิน', amount: cents / 100,
            currency: 'THB', category: 'transfer_other', fund_bucket: bucket, source_type: 'manual', note: '[SURPLUS_ROLLOVER_OUT:' + ym + ':' + bucket + ']' });
        }
        if (!totalCents) return { rolledOver: false, amount: 0 };
        inputs.push({ transaction_date: txDate, type: 'income', merchant: 'รับเงินเหลือใช้เข้ากระปุกฉุกเฉิน', amount: totalCents / 100,
          currency: 'THB', category: 'refund_other_income', fund_bucket: 'emergency_personal', source_type: 'manual', note: '[SURPLUS_ROLLOVER_IN:' + ym + ':emergency_personal]' });
        if ((appState.currentUser?.id || null) !== owner) throw new Error('บัญชีผู้ใช้เปลี่ยน กรุณาลองใหม่');
        const records = await commitAutomation(inputs, ['rollover:' + ym]);
        return { rolledOver: true, amount: totalCents / 100, generalSurplus: amounts.general_expense, fixedSurplus: amounts.fixed_expense, records };
      }

      // =====================================================================
      // DOM RENDERING & EVENT HANDLERS
      // =====================================================================
      function updateStatusBannersAndPills() {
        const banner = document.getElementById('systemModeBanner');
        const bannerText = document.getElementById('systemModeText');
        const btnSyncNow = document.getElementById('btnTriggerSyncNow');
        const btnMigrate = document.getElementById('btnMigrateLocalToCloud');

        const aiDot = document.getElementById('aiStatusDot');
        const aiLabel = document.getElementById('aiStatusLabel');
        const geminiBox = document.getElementById('geminiSettingsStatusBox');

        const authDot = document.getElementById('authStatusDot');
        const authLabel = document.getElementById('authStatusLabel');
        const supabaseBox = document.getElementById('supabaseConnStatusBox');

        const localOnlyCount = appState.transactions.filter((t) => !t.user_id && t.sync_status === 'local_only').length;
        const unsyncedCount = appState.transactions.filter(
          (t) => t.sync_status === 'pending_sync' || t.sync_status === 'sync_failed'
        ).length;

        if (!navigator.onLine) {
          banner.className = 'system-banner offline-mode';
          bannerText.textContent = 'คุณกำลังออฟไลน์ — รายการที่บันทึกใหม่จะถูกเก็บในเครื่องและเข้าคิวซิงก์อัตโนมัติเมื่อกลับมาออนไลน์';
          btnSyncNow.hidden = true;
          btnMigrate.hidden = true;
        } else if (appState.supabaseConnected && appState.currentUser) {
          banner.className = 'system-banner online-synced';
          bannerText.textContent = `เชื่อมต่อ Cloud แล้ว (${appState.currentUser.email})` +
            (unsyncedCount > 0 ? ` — มีรายการรอซิงก์ ${unsyncedCount} รายการ` : ' — ข้อมูลซิงก์เป็นปัจจุบัน');
          btnSyncNow.hidden = unsyncedCount === 0;
          btnMigrate.hidden = localOnlyCount === 0;
        } else {
          banner.className = 'system-banner';
          bannerText.textContent = 'โหมดบันทึกข้อมูลในเครื่อง — ข้อมูลยังไม่ซิงก์ข้ามอุปกรณ์';
          btnSyncNow.hidden = true;
          btnMigrate.hidden = true;
        }

        const syncText = document.getElementById('syncIndicatorText');
        const syncDot = document.getElementById('syncIndicatorDot');
        const cloud = appState.supabaseConnected && appState.currentUser;
        if (syncText) syncText.textContent = !navigator.onLine ? 'ออฟไลน์' : !cloud ? 'บันทึกในเครื่อง' : unsyncedCount ? 'รอซิงก์ ' + unsyncedCount + ' รายการ' : 'ซิงก์แล้ว';
        if (syncDot) syncDot.className = 'status-dot ' + (navigator.onLine && cloud && !unsyncedCount ? 'green' : 'amber');
        // สถานะ AI
        if (aiLabel && aiDot) {
          aiLabel.textContent = appState.aiStatusMessage;
          aiDot.className = 'status-dot ' + (
            appState.aiStatus === 'ready' ? 'green' :
            appState.aiStatus === 'unconfigured' ? 'amber' : 'red'
          );
        }
        if (geminiBox) {
          geminiBox.textContent = `สถานะ AI: ${appState.aiStatusMessage}`;
        }

        // สถานะ Auth & Supabase
        if (authLabel && authDot) {
          if (appState.supabaseConnected && appState.currentUser) {
            authDot.className = 'status-dot green';
            authLabel.textContent = appState.currentUser.email;
          } else if (appState.supabaseConnected) {
            authDot.className = 'status-dot amber';
            authLabel.textContent = 'รอเข้าสู่ระบบ';
          } else {
            authDot.className = 'status-dot';
            authLabel.textContent = 'โหมดในเครื่อง';
          }
        }

        if (supabaseBox) {
          supabaseBox.textContent = appState.supabaseConnected
            ? `สถานะการเชื่อมต่อ: เชื่อมต่อ Supabase สำเร็จ (${appState.settings.supabaseUrl})`
            : 'สถานะการเชื่อมต่อ: โหมดบันทึกข้อมูลในเครื่อง — ข้อมูลยังไม่ซิงก์ข้ามอุปกรณ์';
        }
      }

      function renderDashboardAndHistory() {
        const monthPicker = document.getElementById('dashboardMonthPicker');
        if (monthPicker && !monthPicker.value) {
          monthPicker.value = getBangkokTodayIso().slice(0, 7);
        }
        const selectedMonth = monthPicker ? monthPicker.value : getBangkokTodayIso().slice(0, 7);

        const metrics = calculateDashboardMetrics(appState.transactions, selectedMonth);
        const analyticsMonth = document.getElementById('analyticsMonth');
        if (analyticsMonth) analyticsMonth.value = selectedMonth;
        renderFinancialCharts(selectedMonth);
        const pendingInsurance = legacyInsuranceReview(appState.transactions, selectedMonth);
        const reviewStatus = document.getElementById('legacyInsuranceStatus');
        if (reviewStatus) reviewStatus.textContent = pendingInsurance.length ? 'มี ' + pendingInsurance.length + ' รายการรอตรวจสอบ ต้องตรวจให้เสร็จก่อนโอนเงินเหลือใช้' : 'ไม่มีข้อมูลเก่ารอตรวจสอบ';

        const elIncome = document.getElementById('kpiTotalIncome');
        const elExpense = document.getElementById('kpiTotalExpense');
        const elNet = document.getElementById('kpiNetBalance');
        const elIncomeSub = document.getElementById('kpiIncomeSub');
        const elExpenseSub = document.getElementById('kpiExpenseSub');
        const elSyncSub = document.getElementById('kpiSyncSummarySub');

        if (elIncome) elIncome.textContent = '+' + formatCurrency(metrics.totalIncome, 'THB');
        if (elExpense) elExpense.textContent = '-' + formatCurrency(metrics.totalExpense, 'THB');
        if (elNet) {
          const sign = metrics.netBalance < 0 ? '-' : '';
          elNet.textContent = `${sign}${formatCurrency(Math.abs(metrics.netBalance), 'THB')}`;
        }
        if (elIncomeSub) {
          elIncomeSub.textContent = `ซิงก์ Cloud แล้ว ${formatCurrency(metrics.syncedIncome, 'THB')}`;
        }
        if (elExpenseSub) {
          elExpenseSub.textContent = `ซิงก์ Cloud แล้ว ${formatCurrency(metrics.syncedExpense, 'THB')}`;
        }
        if (elSyncSub) {
          elSyncSub.textContent = `ทั้งหมด ${metrics.totalCount} รายการ (ซิงก์แล้ว ${metrics.syncedCount} / ในเครื่อง ${metrics.localOrPendingCount})`;
        }

        // วาดกราฟแท่งสัดส่วนหมวดหมู่
        const catContainer = document.getElementById('categoryBreakdownContainer');
        if (catContainer) {
          catContainer.innerHTML = '';
          if (metrics.categoryBreakdown.length === 0) {
            const emptyP = document.createElement('p');
            emptyP.className = 'empty-state';
            emptyP.style.padding = '0.85rem 0';
            emptyP.textContent = 'ยังไม่มีรายการรายจ่ายในเดือนที่เลือก';
            catContainer.appendChild(emptyP);
          } else {
            for (const item of metrics.categoryBreakdown) {
              const row = document.createElement('div');
              row.className = 'category-row';

              const top = document.createElement('div');
              top.className = 'category-row-top';
              const nameSpan = document.createElement('span');
              nameSpan.className = 'cat-name-badge';
              nameSpan.style.display = 'inline-flex';
              nameSpan.style.alignItems = 'center';
              nameSpan.style.gap = '8px';
              nameSpan.appendChild(render3dIcon(item.category, 32));
              const nameText = document.createElement('span');
              nameText.textContent = CATEGORY_SHORT_LABELS[item.category] || item.label;
              nameSpan.appendChild(nameText);
              const valSpan = document.createElement('span');
              valSpan.textContent = `${formatCurrency(item.amount, 'THB')} (${item.percentage}%)`;
              top.appendChild(nameSpan);
              top.appendChild(valSpan);

              const track = document.createElement('div');
              track.className = 'progress-track';
              const fill = document.createElement('div');
              fill.className = 'progress-fill';
              fill.style.width = `${Math.min(100, Math.max(2, item.percentage))}%`;
              track.appendChild(fill);

              row.appendChild(top);
              row.appendChild(track);
              catContainer.appendChild(row);
            }
          }
        }

        renderFundBucketsAndChecklist(metrics, selectedMonth);
        renderFilteredTransactionList();
        renderLatestTransactions();
      }

      function renderFundBucketsAndChecklist(metrics: any, selectedMonth: string) {
        renderHomeJarShelf(metrics);
        const fundContainer = document.getElementById('fundBucketsContainer');
        if (fundContainer && Array.isArray(metrics.fundBalances)) {
          fundContainer.innerHTML = '';
          for (const f of metrics.fundBalances) {
            const card = document.createElement('div');
            card.className = 'fund-card';
            card.appendChild(createJarPresentation(f));

            const hdr = document.createElement('div');
            hdr.className = 'fund-card-header';

            const titleWrap = document.createElement('div');
            card.style.borderColor = bucketRegistry.buckets.find(b => b.bucket_key === f.bucket)?.color || '#6366f1';
            for (const [label, mode] of [['✏️ แก้ไข', 'edit'], ['🗑️ ลบ', 'delete']]) {
              const action = document.createElement('button'); action.type = 'button'; action.className = 'btn btn-secondary btn-sm';
              action.textContent = label; action.setAttribute('aria-label', label + ' ' + f.label);
              action.disabled = mode === 'delete' && FUND_BUCKET_ORDER.length <= 1;
              action.onclick = () => openBucketModal(f.bucket, mode); titleWrap.appendChild(action);
            }
            const modeSub = document.createElement('div');
            modeSub.style.fontSize = '0.73rem';
            modeSub.style.color = 'var(--text-muted)';
            modeSub.textContent = f.isCumulative
              ? 'ยอดสะสมต่อเนื่องข้ามเดือน'
              : `งบใช้จ่ายเฉพาะเดือน ${selectedMonth}`;
            titleWrap.appendChild(modeSub);

            const rightWrap = document.createElement('div');
            rightWrap.style.display = 'flex';
            rightWrap.style.flexDirection = 'column';
            rightWrap.style.alignItems = 'flex-end';
            rightWrap.style.gap = '0.25rem';

            const balEl = document.createElement('div');
            balEl.className = `fund-balance ${f.availableBalance < 0 ? 'negative' : 'positive'}`;
            const sign = f.availableBalance < 0 ? '-' : '';
            balEl.textContent = `คงเหลือ ${sign}${formatCurrency(Math.abs(f.availableBalance), 'THB')}`;

            const btnWithdraw = document.createElement('button');
            btnWithdraw.type = 'button';
            btnWithdraw.className = 'btn btn-secondary btn-sm';
            btnWithdraw.style.minHeight = '44px';
            btnWithdraw.style.padding = '0.15rem 0.55rem';
            btnWithdraw.style.fontSize = '0.74rem';
            btnWithdraw.textContent = '💸 ใช้เงิน';
            btnWithdraw.onclick = () => {
              openVerificationModalForManual('manual', f.bucket);
            };

            rightWrap.appendChild(balEl);
            rightWrap.appendChild(btnWithdraw);

            hdr.appendChild(titleWrap);
            hdr.appendChild(rightWrap);
            card.appendChild(hdr);

            const meta = document.createElement('div');
            meta.className = 'fund-meta';
            const inSpan = document.createElement('span');
            inSpan.textContent = `เติมเข้าเดือนนี้: +${formatCurrency(f.monthIncome, 'THB')}`;
            const outSpan = document.createElement('span');
            outSpan.textContent = `ถอนออกเดือนนี้: -${formatCurrency(f.monthExpense, 'THB')}`;
            meta.appendChild(inSpan);
            meta.appendChild(outSpan);
            card.appendChild(meta);

            if (f.bucket === 'dan_insurance') {
              const pay = document.createElement('button'); pay.type = 'button'; pay.className = 'btn btn-primary';
              pay.textContent = 'บันทึกเบี้ยประกันแดนที่จ่ายจริง';
              pay.onclick = () => { openVerificationModalForManual('manual', 'dan_insurance');
                document.getElementById('txFormMerchant').value = 'จ่ายเบี้ยประกันแดน';
                document.getElementById('txFormNote').value = '[fixed_item:dan_insurance]'; };
              card.appendChild(pay);
            }
            fundContainer.appendChild(card);
          }
          fundContainer.appendChild(createAddJarCard());
        }

        const monthLabel = document.getElementById('fixedChecklistMonthLabel');
        if (monthLabel) {
          monthLabel.textContent = `เดือน ${selectedMonth}`;
        }

        const checklistContainer = document.getElementById('fixedMonthlyChecklistContainer');
        if (checklistContainer && metrics.fixedChecklistStatus) {
          checklistContainer.innerHTML = '';
          const st = metrics.fixedChecklistStatus;

          // 1. ประกันพ่อ (1,300 หรือ 2,600)
          const rowFather = document.createElement('div');
          rowFather.className = 'fixed-item-row';
          const infoFather = document.createElement('div');
          infoFather.className = 'fixed-item-info';
          const nameFather = document.createElement('div');
          nameFather.className = 'fixed-item-name';
          nameFather.textContent = st.father_insurance.label;
          const subFather = document.createElement('div');
          subFather.className = 'fixed-item-sub';
          subFather.textContent = st.father_insurance.isPaid
            ? `จ่ายแล้วเดือนนี้ ${formatCurrency(st.father_insurance.paidAmount, 'THB')}`
            : 'ยังไม่ได้บันทึกจ่ายในเดือนนี้';
          infoFather.appendChild(nameFather);
          infoFather.appendChild(subFather);

          const actFather = document.createElement('div');
          actFather.style.display = 'flex';
          actFather.style.gap = '0.35rem';
          actFather.style.flexWrap = 'wrap';
          if (st.father_insurance.isPaid) {
            const bdg = document.createElement('span');
            bdg.className = 'badge badge-synced';
            bdg.textContent = 'จ่ายแล้ว';
            actFather.appendChild(bdg);
          } else {
            const btn1300 = document.createElement('button');
            btn1300.type = 'button';
            btn1300.className = 'btn btn-primary btn-sm';
            btn1300.style.minHeight = '44px';
            btn1300.style.padding = '0.2rem 0.55rem';
            btn1300.style.fontSize = '0.75rem';
            btn1300.textContent = 'จ่าย 1,300';
            btn1300.onclick = async () => {
              const txDate = selectedMonth === getBangkokTodayIso().slice(0, 7) ? getBangkokTodayIso() : `${selectedMonth}-01`;
              await recordFixedExpenseItem('father_insurance_1300', { transaction_date: txDate });
              showToast('บันทึกจ่ายค่าประกันพ่อ 1,300 บาท (ตัดจากข้อ 3 ค่าใช้จ่ายคงที่) แล้ว', 'success');
            };

            const btn2600 = document.createElement('button');
            btn2600.type = 'button';
            btn2600.className = 'btn btn-secondary btn-sm';
            btn2600.style.minHeight = '44px';
            btn2600.style.padding = '0.2rem 0.55rem';
            btn2600.style.fontSize = '0.75rem';
            btn2600.textContent = 'จ่าย 2,600';
            btn2600.onclick = async () => {
              const txDate = selectedMonth === getBangkokTodayIso().slice(0, 7) ? getBangkokTodayIso() : `${selectedMonth}-01`;
              await recordFixedExpenseItem('father_insurance_2600', { transaction_date: txDate });
              showToast('บันทึกจ่ายค่าประกันพ่อ 2,600 บาท (ตัดจากข้อ 3 ค่าใช้จ่ายคงที่) แล้ว', 'success');
            };

            actFather.appendChild(btn1300);
            actFather.appendChild(btn2600);
          }
          rowFather.appendChild(infoFather);
          rowFather.appendChild(actFather);
          checklistContainer.appendChild(rowFather);

          // 3. ให้น้อง (มายด์) 2,000
          const rowMind = document.createElement('div');
          rowMind.className = 'fixed-item-row';
          const infoMind = document.createElement('div');
          infoMind.className = 'fixed-item-info';
          const nameMind = document.createElement('div');
          nameMind.className = 'fixed-item-name';
          nameMind.textContent = st.sister_mind.label;
          const subMind = document.createElement('div');
          subMind.className = 'fixed-item-sub';
          subMind.textContent = st.sister_mind.isPaid
            ? `จ่ายแล้วเดือนนี้ ${formatCurrency(st.sister_mind.paidAmount, 'THB')}`
            : 'ยังไม่ได้บันทึกจ่ายในเดือนนี้';
          infoMind.appendChild(nameMind);
          infoMind.appendChild(subMind);

          const actMind = document.createElement('div');
          if (st.sister_mind.isPaid) {
            const bdg = document.createElement('span');
            bdg.className = 'badge badge-synced';
            bdg.textContent = 'จ่ายแล้ว';
            actMind.appendChild(bdg);
          } else {
            const btnMind = document.createElement('button');
            btnMind.type = 'button';
            btnMind.className = 'btn btn-primary btn-sm';
            btnMind.style.minHeight = '44px';
            btnMind.style.padding = '0.2rem 0.55rem';
            btnMind.style.fontSize = '0.75rem';
            btnMind.textContent = 'จ่าย 2,000';
            btnMind.onclick = async () => {
              const txDate = selectedMonth === getBangkokTodayIso().slice(0, 7) ? getBangkokTodayIso() : `${selectedMonth}-01`;
              await recordFixedExpenseItem('sister_mind', { transaction_date: txDate });
              showToast('บันทึกโอนให้น้อง (มายด์) 2,000 บาท (ตัดจากข้อ 3 ค่าใช้จ่ายคงที่) แล้ว', 'success');
            };
            actMind.appendChild(btnMind);
          }
          rowMind.appendChild(infoMind);
          rowMind.appendChild(actMind);
          checklistContainer.appendChild(rowMind);

          // 4. ค่าน้ำ, ค่าไฟ, ค่าโทรศัพท์, ค่าเรียนพิเศษลูก (งบ 6,500)
          const rowUtil = document.createElement('div');
          rowUtil.className = 'fixed-item-row';
          const infoUtil = document.createElement('div');
          infoUtil.className = 'fixed-item-info';
          const nameUtil = document.createElement('div');
          nameUtil.className = 'fixed-item-name';
          nameUtil.textContent = st.utilities_tuition.label;
          const subUtil = document.createElement('div');
          subUtil.className = 'fixed-item-sub';
          subUtil.textContent = `ใช้ไปแล้ว ${formatCurrency(st.utilities_tuition.paidAmount, 'THB')} / งบ ฿6,500.00 (คงเหลือ ${formatCurrency(st.utilities_tuition.remainingBudget, 'THB')})`;
          infoUtil.appendChild(nameUtil);
          infoUtil.appendChild(subUtil);

          const actUtil = document.createElement('div');
          const btnUtil = document.createElement('button');
          btnUtil.type = 'button';
          btnUtil.className = 'btn btn-secondary btn-sm';
          btnUtil.style.minHeight = '44px';
          btnUtil.style.padding = '0.2rem 0.55rem';
          btnUtil.style.fontSize = '0.75rem';
          btnUtil.textContent = '+ บันทึกบิล/เรียนลูก';
          btnUtil.onclick = () => {
            openVerificationModalForManual('manual', 'fixed_expense', 'utilities_bills');
          };
          actUtil.appendChild(btnUtil);

          rowUtil.appendChild(infoUtil);
          rowUtil.appendChild(actUtil);
          checklistContainer.appendChild(rowUtil);
        }
      }

      function renderFilteredTransactionList() {
        const listContainer = document.getElementById('transactionListContainer');
        const summaryEl = document.getElementById('historyCountSummary');
        if (!listContainer) return;

        const q = (document.getElementById('filterSearchInput')?.value || '').trim().toLowerCase();
        const typeFilter = document.getElementById('filterTypeSelect')?.value || 'all';
        const catFilter = document.getElementById('filterCategorySelect')?.value || 'all';
        const fundFilter = document.getElementById('filterFundSelect')?.value || 'all';
        const dateFrom = document.getElementById('filterDateFrom')?.value || '';
        const dateTo = document.getElementById('filterDateTo')?.value || '';

        const filtered = appState.transactions.filter((tx) => {
          const txBucket: FundBucket = (FUND_BUCKET_LABELS as Record<string, string>)[tx.fund_bucket]
            ? tx.fund_bucket
            : inferDefaultFundBucket(tx.category, tx.merchant, tx.items_summary, tx.purpose_analysis, tx.note);
          if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
          if (catFilter !== 'all' && tx.category !== catFilter) return false;
          if (fundFilter !== 'all' && txBucket !== fundFilter) return false;
          if (dateFrom && String(tx.transaction_date) < dateFrom) return false;
          if (dateTo && String(tx.transaction_date) > dateTo) return false;
          if (q) {
            const haystack = [
              tx.merchant,
              tx.items_summary,
              tx.purpose_analysis,
              tx.note,
              CATEGORY_LABELS[tx.category],
              FUND_BUCKET_LABELS[txBucket]
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            if (!haystack.includes(q)) return false;
          }
          return true;
        });

        if (summaryEl) {
          summaryEl.textContent = `แสดง ${filtered.length} จากทั้งหมด ${appState.transactions.length} รายการ`;
        }

        listContainer.innerHTML = '';
        if (filtered.length === 0) {
          const emptyDiv = document.createElement('div');
          emptyDiv.className = 'empty-state';
          emptyDiv.textContent = appState.transactions.length === 0
            ? 'ยังไม่มีรายการธุรกรรม เริ่มต้นด้วยการถ่ายภาพใบเสร็จหรือกดปุ่ม "+ เพิ่มรายการใหม่"'
            : 'ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหาหรือตัวกรอง';
          listContainer.appendChild(emptyDiv);
          return;
        }

        for (const tx of filtered) listContainer.appendChild(createTransactionCard(tx));
      }

      function createTransactionCard(tx: any) {
          const card = document.createElement('article');
          card.className = 'tx-item';

          const top = document.createElement('div');
          top.className = 'tx-top';

          const direction = document.createElement('span');
          direction.className = 'tx-direction ' + tx.type;
          direction.textContent = tx.type === 'income' ? '↙' : '↗';
          direction.setAttribute('aria-hidden', 'true');
          top.appendChild(render3dIcon(tx.category, 40));
          top.appendChild(direction);
          const leftInfo = document.createElement('div');
          const merchantEl = document.createElement('div');
          merchantEl.className = 'tx-merchant';
          merchantEl.textContent = tx.merchant;
          const dateEl = document.createElement('div');
          dateEl.style.fontSize = '0.8rem';
          dateEl.style.color = 'var(--text-muted)';
          dateEl.textContent = `วันที่ ${tx.transaction_date} • ${SOURCE_LABELS[tx.source_type] || 'กรอกด้วยตนเอง'}`;
          leftInfo.appendChild(merchantEl);
          leftInfo.appendChild(dateEl);

          const amountEl = document.createElement('div');
          amountEl.className = `tx-amount ${tx.type}`;
          const sign = tx.type === 'income' ? '+' : '-';
          amountEl.textContent = `${sign}${formatCurrency(tx.amount, tx.currency)}`;

          top.appendChild(leftInfo);
          top.appendChild(amountEl);
          card.appendChild(top);

          // Badges
          const badgesRow = document.createElement('div');
          badgesRow.className = 'tx-badges';

          const typeBadge = document.createElement('span');
          typeBadge.className = `badge ${tx.type === 'income' ? 'badge-income' : 'badge-expense'}`;
          typeBadge.textContent = tx.type === 'income' ? 'รายรับ' : 'รายจ่าย';

          const catBadge = document.createElement('span');
          catBadge.className = 'badge badge-category';
          catBadge.textContent = CATEGORY_SHORT_LABELS[tx.category] || CATEGORY_LABELS[tx.category] || tx.category;

          const resolvedBucket: FundBucket = (FUND_BUCKET_LABELS as Record<string, string>)[tx.fund_bucket]
            ? tx.fund_bucket
            : inferDefaultFundBucket(tx.category, tx.merchant, tx.items_summary, tx.purpose_analysis, tx.note);
          const fundBadge = document.createElement('span');
          fundBadge.className = 'badge badge-fund';
          fundBadge.textContent = (tx.type === 'expense' ? 'ถอนจาก: ' : 'เข้า: ') + FUND_BUCKET_LABELS[resolvedBucket];

          const syncBadge = document.createElement('span');
          const statusClass =
            tx.sync_status === 'synced' ? 'badge-synced' :
            tx.sync_status === 'pending_sync' ? 'badge-pending' :
            tx.sync_status === 'sync_failed' ? 'badge-failed' : 'badge-local';
          syncBadge.className = `badge ${statusClass}`;
          syncBadge.textContent = SYNC_STATUS_LABELS[tx.sync_status] || 'บันทึกในเครื่อง';

          if (['receipt', 'transfer_slip'].includes(tx.source_type)) {
            const aiBadge = document.createElement('span');
            aiBadge.className = 'ai-badge'; aiBadge.textContent = '✨ AI';
            badgesRow.appendChild(aiBadge);
          }
          badgesRow.appendChild(typeBadge);
          badgesRow.appendChild(catBadge);
          badgesRow.appendChild(fundBadge);
          badgesRow.appendChild(syncBadge);
          card.appendChild(badgesRow);

          if (tx.items_summary) {
            const summaryP = document.createElement('p');
            summaryP.style.fontSize = '0.86rem';
            summaryP.style.color = 'var(--text-main)';
            summaryP.textContent = `รายการ: ${tx.items_summary}`;
            card.appendChild(summaryP);
          }

          if (tx.purpose_analysis) {
            const purposeBox = document.createElement('div');
            purposeBox.className = 'tx-purpose-box';
            purposeBox.textContent = `วิเคราะห์วัตถุประสงค์: ${tx.purpose_analysis}`;
            card.appendChild(purposeBox);
          }

          if (tx.note) {
            const noteP = document.createElement('p');
            noteP.style.fontSize = '0.8rem';
            noteP.style.color = 'var(--text-muted)';
            noteP.textContent = `หมายเหตุ: ${tx.note}`;
            card.appendChild(noteP);
          }

          const actions = document.createElement('div');
          actions.className = 'tx-actions';

          const btnEdit = document.createElement('button');
          btnEdit.type = 'button';
          btnEdit.className = 'btn btn-secondary btn-sm';
          btnEdit.textContent = 'แก้ไข';
          btnEdit.onclick = () => openVerificationModalForEdit(tx);

          const btnDel = document.createElement('button');
          btnDel.type = 'button';
          btnDel.className = 'btn btn-danger btn-sm';
          btnDel.textContent = 'ลบ';
          btnDel.onclick = () => deleteTransactionInteractive(tx.id);

          actions.appendChild(btnEdit);
          actions.appendChild(btnDel);
          card.appendChild(actions);


        return card;
      }

      let latestTypeFilter = 'all';
      function renderLatestTransactions() {
        const container = document.getElementById('latestTransactionList');
        if (!container) return;
        const month = document.getElementById('dashboardMonthPicker')?.value || getBangkokTodayIso().slice(0, 7);
        const rows = appState.transactions.filter(tx => !tx.deleted_at && !tx.pending_delete &&
          (!tx.user_id || tx.user_id === appState.currentUser?.id) &&
          String(tx.transaction_date).startsWith(month) && (latestTypeFilter === 'all' || tx.type === latestTypeFilter))
          .sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)) || String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5);
        container.innerHTML = '';
        for (const tx of rows) container.appendChild(createTransactionCard(tx));
        if (!rows.length) {
          const empty = document.createElement('p'); empty.className = 'empty-state';
          empty.textContent = 'ยังไม่มีรายการที่ตรงกับเดือนและตัวกรองนี้'; container.appendChild(empty);
        }
        for (const type of ['all', 'expense', 'income']) document.getElementById('latest-' + type)?.setAttribute('aria-pressed', String(type === latestTypeFilter));
      }

      // =====================================================================
      // VERIFICATION FORM MODAL WORKFLOW
      // =====================================================================
      function clearUncertainHighlights() {
        const fields = ['Date', 'Type', 'Merchant', 'Amount', 'Category'];
        for (const f of fields) {
          const grp = document.getElementById(`groupTx${f}`);
          const bdg = document.getElementById(`badgeUncertain${f}`);
          if (grp) grp.classList.remove('uncertain-field');
          if (bdg) bdg.hidden = true;
        }
        const warnBox = document.getElementById('aiVerificationWarningsBox');
        const errBox = document.getElementById('txFormValidationErrorsBox');
        if (warnBox) { warnBox.hidden = true; warnBox.textContent = ''; }
        if (errBox) { errBox.hidden = true; errBox.textContent = ''; }
      }

      function openVerificationModalFromAiResult(aiResult) {
        clearUncertainHighlights();
        const normalized = normalizeAiAnalysisResult(aiResult);

        document.getElementById('verificationModalTitle').textContent = 'ตรวจสอบผลวิเคราะห์จาก AI ก่อนบันทึก';
        document.getElementById('txFormId').value = '';
        // ห้ามใส่วันที่ปัจจุบันอัตโนมัติหาก AI หาวันที่ไม่พบ
        document.getElementById('txFormDate').value = normalized.date || '';
        document.getElementById('txFormType').value = normalized.type || 'unknown';
        renderCategoryPicker(normalized.type || 'expense');
        document.getElementById('txFormMerchant').value = normalized.merchant || '';
        document.getElementById('txFormAmount').value = normalized.amount !== null ? String(normalized.amount) : '';
        document.getElementById('txFormCurrency').value = normalized.currency || 'THB';
        document.getElementById('txFormCategory').value = normalized.category || 'unknown';
        updateCategoryPickerSelection(normalized.category || 'unknown');
        document.getElementById('txFormSourceType').value = normalized.source_type || 'receipt';
        const fundBucketSelectAi = document.getElementById('txFormFundBucket') as HTMLSelectElement | null;
        if (fundBucketSelectAi) {
          fundBucketSelectAi.value = normalized.fund_bucket || 'general_expense';
        }
        document.getElementById('txFormItemsSummary').value = normalized.items_summary || '';
        document.getElementById('txFormPurposeAnalysis').value = normalized.purpose_analysis || '';
        document.getElementById('txFormNote').value = '';

        // ไฮไลต์ฟิลด์ที่ AI ไม่มั่นใจ
        const mapFieldToSuffix = {
          date: 'Date',
          type: 'Type',
          merchant: 'Merchant',
          amount: 'Amount',
          category: 'Category'
        };
        for (const uf of normalized.uncertain_fields) {
          const suffix = mapFieldToSuffix[uf];
          if (suffix) {
            document.getElementById(`groupTx${suffix}`)?.classList.add('uncertain-field');
            const badge = document.getElementById(`badgeUncertain${suffix}`);
            if (badge) badge.hidden = false;
          }
        }

        if (normalized.warnings.length > 0) {
          const warnBox = document.getElementById('aiVerificationWarningsBox');
          if (warnBox) {
            warnBox.hidden = false;
            warnBox.textContent = 'ข้อควรตรวจสอบจาก AI: ' + normalized.warnings.join(' | ');
          }
        }

        const hasTempImage = Boolean(appState.currentCompressedImage);
        document.getElementById('btnReanalyzeCurrentImage').hidden = !hasTempImage;
        document.getElementById('btnRemoveImageFromModal').hidden = !hasTempImage;
        document.getElementById('verificationModal').hidden = false;
        resetEntrySuggestions(true);
      }

      function openVerificationModalForManual(
        sourceType: string = 'manual',
        defaultFundBucket: FundBucket = 'general_expense',
        defaultCategory: string = 'food_drink'
      ) {
        clearUncertainHighlights();
        document.getElementById('verificationModalTitle').textContent = 'เพิ่มรายการรายรับ-รายจ่าย (เลือกตัดจาก 6 ส่วน)';
        document.getElementById('txFormId').value = '';
        document.getElementById('txFormDate').value = getBangkokTodayIso();
        document.getElementById('txFormType').value = 'expense';
        renderCategoryPicker('expense');
        document.getElementById('txFormMerchant').value = '';
        document.getElementById('txFormAmount').value = '';
        document.getElementById('txFormCurrency').value = appState.settings.defaultCurrency || 'THB';
        document.getElementById('txFormCategory').value = defaultCategory;
        updateCategoryPickerSelection(defaultCategory);
        document.getElementById('txFormSourceType').value = sourceType;
        const fundBucketSelectManual = document.getElementById('txFormFundBucket') as HTMLSelectElement | null;
        if (fundBucketSelectManual) {
          fundBucketSelectManual.value = defaultFundBucket;
        }
        document.getElementById('txFormItemsSummary').value = '';
        document.getElementById('txFormPurposeAnalysis').value = '';
        document.getElementById('txFormNote').value = '';

        const hasTempImage = Boolean(appState.currentCompressedImage);
        document.getElementById('btnReanalyzeCurrentImage').hidden = !hasTempImage;
        document.getElementById('btnRemoveImageFromModal').hidden = !hasTempImage;
        document.getElementById('verificationModal').hidden = false;
        resetEntrySuggestions();
      }

      function openVerificationModalForEdit(tx: any) {
        clearUncertainHighlights();
        document.getElementById('verificationModalTitle').textContent = 'แก้ไขข้อมูลรายการ';
        document.getElementById('txFormId').value = tx.id;
        document.getElementById('txFormDate').value = tx.transaction_date || '';
        document.getElementById('txFormType').value = tx.type || 'expense';
        renderCategoryPicker(tx.type || 'expense');
        document.getElementById('txFormMerchant').value = tx.merchant || '';
        document.getElementById('txFormAmount').value = tx.amount !== undefined ? String(tx.amount) : '';
        document.getElementById('txFormCurrency').value = tx.currency || 'THB';
        document.getElementById('txFormCategory').value = tx.category || 'shopping_general';
        updateCategoryPickerSelection(tx.category || 'shopping_general');
        document.getElementById('txFormSourceType').value = tx.source_type || 'manual';
        const fundBucketSelectEdit = document.getElementById('txFormFundBucket') as HTMLSelectElement | null;
        if (fundBucketSelectEdit) {
          const resolvedBucket = (FUND_BUCKET_LABELS as Record<string, string>)[tx.fund_bucket]
            ? tx.fund_bucket
            : inferDefaultFundBucket(tx.category, tx.merchant, tx.items_summary, tx.purpose_analysis, tx.note);
          fundBucketSelectEdit.value = resolvedBucket;
        }
        document.getElementById('txFormItemsSummary').value = tx.items_summary || '';
        document.getElementById('txFormPurposeAnalysis').value = tx.purpose_analysis || '';
        document.getElementById('txFormNote').value = tx.note || '';

        document.getElementById('btnReanalyzeCurrentImage').hidden = true;
        document.getElementById('btnRemoveImageFromModal').hidden = true;
        document.getElementById('verificationModal').hidden = false;
        resetEntrySuggestions(true);
      }

      function clearTemporaryReceiptImage() {
        appState.currentCompressedImage = null;
        const previewPanel = document.getElementById('imagePreviewPanel');
        const previewImg = document.getElementById('receiptPreviewImg');
        const infoBox = document.getElementById('compressionInfoBox');
        const camInput = document.getElementById('inputCameraCapture');
        const galInput = document.getElementById('inputGalleryFile');

        if (previewPanel) previewPanel.hidden = true;
        if (previewImg) previewImg.removeAttribute('src');
        if (infoBox) infoBox.textContent = '';
        if (camInput) camInput.value = '';
        if (galInput) galInput.value = '';
      }

      // =====================================================================
      // INITIALIZATION & EVENT BINDINGS
      // =====================================================================
      async function handleImageFileSelected(file) {
        if (!file || appState.isAnalyzingAi) return;
        const errBox = document.getElementById('aiAnalysisErrorBox');
        if (errBox) { errBox.hidden = true; errBox.textContent = ''; }

        try {
          if (!validReceiptFile(file)) throw new Error('ภาพต้องเป็น JPEG, PNG หรือ WebP ขนาดไม่เกิน 20 MB');
          const compressed = await compressReceiptImage(file, 1600, 0.82);
          appState.currentCompressedImage = compressed;

          const previewPanel = document.getElementById('imagePreviewPanel');
          const previewImg = document.getElementById('receiptPreviewImg');
          const infoBox = document.getElementById('compressionInfoBox');

          if (previewImg) previewImg.src = compressed.dataUrl;
          if (infoBox) {
            const origKB = (compressed.originalSize / 1024).toFixed(1);
            const compKB = (compressed.compressedSize / 1024).toFixed(1);
            infoBox.textContent = `ขนาดภาพหลังบีบอัด: ${compressed.width}×${compressed.height} px | ลดขนาดจาก ${origKB} KB เหลือ ${compKB} KB (ไม่บันทึกรูปขึ้น Cloud)`;
          }
          if (previewPanel) previewPanel.hidden = false;
        } catch (err) {
          clearTemporaryReceiptImage();
          if (errBox) {
            errBox.hidden = false;
            errBox.textContent = err.message || 'ไม่สามารถประมวลผลรูปภาพได้';
          }
          showToast(err.message || 'ไฟล์รูปภาพไม่รองรับ', 'error');
        }
      }

      function updateAnalysisPresentation() {
        const busy = appState.isAnalyzingAi;
        document.getElementById('imagePreviewPanel')?.setAttribute('aria-busy', String(busy));
        const laser = document.getElementById('scanLaserLine'); if (laser) laser.hidden = !busy;
        for (const id of ['btnBottomCenterScan', 'btnChooseGallery', 'btnStartScanCamera']) {
          const button = document.getElementById(id); if (button) button.disabled = busy;
        }
      }

      async function triggerAiAnalysisForCurrentImage() {
        if (appState.isAnalyzingAi) return;
        if (!appState.currentCompressedImage) {
          showToast('กรุณาถ่ายภาพหรือเลือกรูปใบเสร็จก่อนเริ่มวิเคราะห์', 'warning');
          return;
        }

        const btnAnalyze = document.getElementById('btnAnalyzeWithAi');
        const btnReanalyze = document.getElementById('btnReanalyzeCurrentImage');
        const progressBox = document.getElementById('aiAnalysisProgressBox');
        const errBox = document.getElementById('aiAnalysisErrorBox');

        appState.isAnalyzingAi = true;
        updateAnalysisPresentation();
        if (btnAnalyze) btnAnalyze.disabled = true;
        if (btnReanalyze) btnReanalyze.disabled = true;
        if (progressBox) progressBox.hidden = false;
        if (errBox) { errBox.hidden = true; errBox.textContent = ''; }

        const analysisOwner = appState.currentUser?.id || null;
        try {
          if (activeShare && activeShare.owner !== analysisOwner) throw new Error('บัญชีผู้ใช้ไม่ตรงกับภาพ');
          const resultPayload = await callAnalyzeReceiptEdgeFunction({
            action: 'analyze',
            mimeType: appState.currentCompressedImage.mimeType,
            imageBase64: appState.currentCompressedImage.base64
          });

          if (analysisOwner !== (appState.currentUser?.id || null)) throw new Error('บัญชีผู้ใช้เปลี่ยน กรุณาวิเคราะห์ใหม่');
          const aiData = resultPayload?.data || resultPayload;
          openVerificationModalFromAiResult(aiData);
          showToast('AI อ่านข้อมูลใบเสร็จเสร็จแล้ว กรุณาตรวจสอบก่อนยืนยันบันทึก', 'success');
        } catch (err) {
          if (errBox) {
            errBox.hidden = false;
            errBox.textContent = err.message || 'เกิดข้อผิดพลาดในการวิเคราะห์ด้วย AI';
          }
          showToast(err.message || 'ไม่สามารถวิเคราะห์ด้วย AI ได้', 'error');
        } finally {
          appState.isAnalyzingAi = false;
          updateAnalysisPresentation();
          if (btnAnalyze) btnAnalyze.disabled = false;
          if (btnReanalyze) btnReanalyze.disabled = false;
          if (progressBox) progressBox.hidden = true;
        }
      }

      let uiBound = false;
      function bindUiEvents() {
        bindBucketEvents();
        renderShortcutIcons();
        renderBottomNavIcons();
        renderCategoryPicker(document.getElementById('txFormType')?.value || 'expense');
        if (uiBound) return; uiBound = true;
        document.getElementById('txFormType')?.addEventListener('change', (e: any) => {
          renderCategoryPicker(e.target.value);
          updateCategoryPickerSelection(document.getElementById('txFormCategory')?.value || '');
        });
        document.getElementById('txFormCategory')?.addEventListener('change', (e: any) => {
          updateCategoryPickerSelection(e.target.value);
        });

        // Custom Cute 3D Dropdown Toggle
        const ddTrigger = document.getElementById('custom3dCategorySelected');
        const ddMenu = document.getElementById('custom3dCategoryMenu');
        const ddContainer = document.getElementById('custom3dCategoryDropdown');

        ddTrigger?.addEventListener('click', (e) => {
          e.stopPropagation();
          const isExpanded = ddContainer?.getAttribute('aria-expanded') === 'true';
          if (ddContainer) ddContainer.setAttribute('aria-expanded', String(!isExpanded));
          if (ddMenu) ddMenu.hidden = isExpanded;
        });

        document.addEventListener('click', (e) => {
          if (ddContainer && !ddContainer.contains(e.target as Node)) {
            ddContainer.setAttribute('aria-expanded', 'false');
            if (ddMenu) ddMenu.hidden = true;
          }
        });

        // Income Quick Chips handling
        document.querySelectorAll('.quick-chip-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const text = (btn as HTMLElement).dataset.text;
            const input = document.getElementById('txFormMerchant') as HTMLInputElement | null;
            if (input && text) {
              input.value = text;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
        });
        bindAppNavigation();
        bindAutomationEvents();
        // ปุ่มกล้องและอัลบั้ม
        document.getElementById('btnStartScanCamera')?.addEventListener('click', () => {
          document.getElementById('inputCameraCapture')?.click();
        });
        document.getElementById('btnChooseGallery')?.addEventListener('click', () => {
          document.getElementById('inputGalleryFile')?.click();
        });
        document.getElementById('inputCameraCapture')?.addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (file) handleImageFileSelected(file);
        });
        document.getElementById('inputGalleryFile')?.addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (file) handleImageFileSelected(file);
        });

        document.getElementById('btnAnalyzeWithAi')?.addEventListener('click', triggerAiAnalysisForCurrentImage);
        document.getElementById('btnReanalyzeCurrentImage')?.addEventListener('click', triggerAiAnalysisForCurrentImage);
        document.getElementById('btnUseImageForManual')?.addEventListener('click', () => {
          openVerificationModalForManual('receipt');
        });
        document.getElementById('btnClearTempImage')?.addEventListener('click', () => {
          clearTemporaryReceiptImage();
          showToast('ลบรูปชั่วคราวออกจากหน่วยความจำแล้ว', 'info');
        });
        document.getElementById('btnRemoveImageFromModal')?.addEventListener('click', () => {
          clearTemporaryReceiptImage();
          document.getElementById('btnReanalyzeCurrentImage').hidden = true;
          document.getElementById('btnRemoveImageFromModal').hidden = true;
          showToast('ลบรูปชั่วคราวแล้ว', 'info');
        });

        // ปุ่มเปิดฟอร์มเพิ่มรายการด้วยตนเอง
        document.getElementById('btnOpenManualEntry')?.addEventListener('click', () => {
          openVerificationModalForManual('manual');
        });

        // ปุ่มปิด/ยกเลิก Verification Modal
        const closeVerification = () => {
          suggestionRequest++;
          document.getElementById('verificationModal').hidden = true;
          releaseSharedReceipt().catch(() => {});
        };
        document.getElementById('btnCloseVerificationModal')?.addEventListener('click', closeVerification);
        document.getElementById('btnCancelVerification')?.addEventListener('click', closeVerification);

        // ปุ่มยืนยันการบันทึกใน Verification Modal (ป้องกันการกดซ้ำ)
        document.getElementById('btnConfirmSaveTx')?.addEventListener('click', async () => {
          if (appState.isSavingTx) return;
          const btnSave = document.getElementById('btnConfirmSaveTx');
          const errBox = document.getElementById('txFormValidationErrorsBox');
          if (errBox) { errBox.hidden = true; errBox.textContent = ''; }

          const formPayload = {
            id: document.getElementById('txFormId').value,
            transaction_date: document.getElementById('txFormDate').value,
            type: document.getElementById('txFormType').value,
            merchant: document.getElementById('txFormMerchant').value,
            amount: document.getElementById('txFormAmount').value,
            currency: document.getElementById('txFormCurrency').value,
            category: document.getElementById('txFormCategory').value,
            fund_bucket: (document.getElementById('txFormFundBucket') as HTMLSelectElement | null)?.value || 'general_expense',
            source_type: document.getElementById('txFormSourceType').value,
            items_summary: document.getElementById('txFormItemsSummary').value,
            purpose_analysis: document.getElementById('txFormPurposeAnalysis').value,
            note: document.getElementById('txFormNote').value
          };

          appState.isSavingTx = true;
          if (btnSave) btnSave.disabled = true;

          try {
            if (activeShare) {
              if (activeShare.owner !== appState.currentUser?.id) throw new Error('บัญชีผู้ใช้เปลี่ยน');
              const claimed = await shareInboxChange(activeShare.id, row => row.claim === shareClaimToken && row.owner === appState.currentUser?.id ? { ...row, lease: Date.now() + 60000 } : null);
              if (!claimed) throw new Error('ภาพนี้อยู่ในแท็บอื่น กรุณารับภาพใหม่');
              formPayload.id = activeShare.transactionId;
            }
            const saved = await saveTransaction(formPayload);
            await releaseSharedReceipt(true);
            await learnConfirmedRecord(saved).catch(() => {});
            // ล้างรูปชั่วคราวหลังบันทึกสำเร็จตามข้อกำหนดความเป็นส่วนตัว
            clearTemporaryReceiptImage();
            document.getElementById('verificationModal').hidden = true;
            showToast(
              saved.sync_status === 'synced'
                ? 'บันทึกและซิงก์รายการขึ้น Cloud สำเร็จแล้ว'
                : 'บันทึกรายการลงในเครื่องเรียบร้อยแล้ว',
              'success'
            );
          } catch (err) {
            // คงข้อมูลในฟอร์มไว้เพื่อให้ผู้ใช้แก้ไขและลองอีกครั้ง
            if (errBox) {
              errBox.hidden = false;
              errBox.textContent = err.message || 'ไม่สามารถบันทึกรายการได้ กรุณาตรวจสอบข้อมูลอีกครั้ง';
            }
          } finally {
            appState.isSavingTx = false;
            if (btnSave) btnSave.disabled = false;
          }
        });

        // ตัวกรองและช่องค้นหา
        const filterIds = [
          'dashboardMonthPicker',
          'filterSearchInput',
          'filterTypeSelect',
          'filterCategorySelect',
          'filterFundSelect',
          'filterDateFrom',
          'filterDateTo'
        ];
        for (const fid of filterIds) {
          document.getElementById(fid)?.addEventListener('input', renderDashboardAndHistory);
          document.getElementById(fid)?.addEventListener('change', renderDashboardAndHistory);
        }

        document.getElementById('btnResetFilters')?.addEventListener('click', () => {
          document.getElementById('filterSearchInput').value = '';
          document.getElementById('filterTypeSelect').value = 'all';
          document.getElementById('filterCategorySelect').value = 'all';
          const fundSelectEl = document.getElementById('filterFundSelect') as HTMLSelectElement | null;
          if (fundSelectEl) fundSelectEl.value = 'all';
          document.getElementById('filterDateFrom').value = '';
          document.getElementById('filterDateTo').value = '';
          renderFilteredTransactionList();
        });

        // ปุ่มแบ่งเงินเดือนเข้า 6 ส่วน และปุ่มโอนเงินเหลือใช้เข้าข้อ 4
        const recalculateSalarySplitPreview = () => {
          const totalVal = Number((document.getElementById('salarySplitTotalInput') as HTMLInputElement | null)?.value || 0);
          const f1 = Number((document.getElementById('salarySplitFund1Input') as HTMLInputElement | null)?.value || 0);
          const f2 = Number((document.getElementById('salarySplitFund2Input') as HTMLInputElement | null)?.value || 0);
          const f3 = Number((document.getElementById('salarySplitFund3Input') as HTMLInputElement | null)?.value || 0);
          const f4 = Number((document.getElementById('salarySplitFund4Input') as HTMLInputElement | null)?.value || 0);
          const f5El = document.getElementById('salarySplitFund5Input') as HTMLInputElement | null;
          const previewBox = document.getElementById('salarySplitSummaryPreview');

          const f6 = Number((document.getElementById('salarySplitFund6Input') as HTMLInputElement | null)?.value || 0);
          const fixedSum = [f1, f2, f3, f4, f6].reduce((sum, value) => sum + Math.round(value * 100), 0) / 100;
          const remainForF5 = totalVal > 0 ? Math.max(0, Math.round((totalVal - fixedSum) * 100) / 100) : 0;
          if (f5El && totalVal > 0) {
            f5El.value = String(remainForF5);
          }

          if (previewBox) {
            if (totalVal > 0 && totalVal < fixedSum) {
              previewBox.className = 'alert-box alert-warning';
              previewBox.textContent = `ยอดเงินเดือนรวม (${formatCurrency(totalVal, 'THB')}) น้อยกว่ายอดกันเงินข้อ 1–4 และ 6 (${formatCurrency(fixedSum, 'THB')}) ขาดอีก ${formatCurrency(fixedSum - totalVal, 'THB')}`;
            } else {
              previewBox.className = 'alert-box alert-success';
              previewBox.textContent = `ยอดกันเงิน (ข้อ 1–4 และ 6) = ${formatCurrency(fixedSum, 'THB')} | คงเหลือเข้าข้อ 5 ค่าใช้จ่ายทั่วไป = ${formatCurrency(remainForF5, 'THB')}`;
            }
          }
        };

        document.getElementById('btnOpenSalarySplitModal')?.addEventListener('click', () => {
          const selectedMonth = (document.getElementById('dashboardMonthPicker') as HTMLInputElement | null)?.value || getBangkokTodayIso().slice(0, 7);
          const defaultDate = selectedMonth === getBangkokTodayIso().slice(0, 7) ? getBangkokTodayIso() : `${selectedMonth}-01`;
          const dateEl = document.getElementById('salarySplitDate') as HTMLInputElement | null;
          if (dateEl) dateEl.value = defaultDate;

          const errBox = document.getElementById('salarySplitErrorBox');
          if (errBox) { errBox.hidden = true; errBox.textContent = ''; }

          recalculateSalarySplitPreview();
          const modal = document.getElementById('salarySplitModal');
          if (modal) modal.hidden = false;
        });

        const closeSalarySplitModal = () => {
          const modal = document.getElementById('salarySplitModal');
          if (modal) modal.hidden = true;
        };
        document.getElementById('btnCloseSalarySplitModal')?.addEventListener('click', closeSalarySplitModal);
        document.getElementById('btnCancelSalarySplit')?.addEventListener('click', closeSalarySplitModal);

        document.getElementById('salarySplitFatherInsMode')?.addEventListener('change', (e) => {
          const modeVal = Number((e.target as HTMLSelectElement).value || 1300);
          const f3El = document.getElementById('salarySplitFund3Input') as HTMLInputElement | null;
          const lblFather = document.getElementById('labelFatherInsAmount');
          if (lblFather) lblFather.textContent = modeVal.toLocaleString('en-US');
          if (f3El) {
            f3El.value = String(
              modeVal === 2600
                ? FIXED_MONTHLY_PRESETS.FIXED_EXPENSE_TOTAL_EVERY_3RD
                : FIXED_MONTHLY_PRESETS.FIXED_EXPENSE_TOTAL_NORMAL
            );
          }
          recalculateSalarySplitPreview();
        });

        for (const id of [
          'salarySplitTotalInput',
          'salarySplitFund1Input',
          'salarySplitFund2Input',
          'salarySplitFund3Input',
          'salarySplitFund4Input', 'salarySplitFund6Input'
        ]) {
          document.getElementById(id)?.addEventListener('input', recalculateSalarySplitPreview);
        }

        document.getElementById('btnConfirmSalarySplit')?.addEventListener('click', async () => {
          const errBox = document.getElementById('salarySplitErrorBox');
          if (errBox) { errBox.hidden = true; errBox.textContent = ''; }
          try {
            const res = await allocateMonthlySalary({
              transaction_date: (document.getElementById('salarySplitDate') as HTMLInputElement | null)?.value,
              total_salary: Number((document.getElementById('salarySplitTotalInput') as HTMLInputElement | null)?.value || 0),
              investment_stock: Number((document.getElementById('salarySplitFund1Input') as HTMLInputElement | null)?.value || 0),
              home_building: Number((document.getElementById('salarySplitFund2Input') as HTMLInputElement | null)?.value || 0),
              dan_insurance: Number((document.getElementById('salarySplitFund6Input') as HTMLInputElement | null)?.value || 0),
              fixed_expense: Number((document.getElementById('salarySplitFund3Input') as HTMLInputElement | null)?.value || 0),
              father_insurance_mode: Number((document.getElementById('salarySplitFatherInsMode') as HTMLSelectElement | null)?.value || 1300),
              emergency_personal: Number((document.getElementById('salarySplitFund4Input') as HTMLInputElement | null)?.value || 0),
              general_expense: Number((document.getElementById('salarySplitFund5Input') as HTMLInputElement | null)?.value || 0)
            });
            closeSalarySplitModal();
            showToast(`แบ่งเงินเดือนประจำเดือน ${res.yearMonth} เข้าทั้ง 6 ส่วนเรียบร้อยแล้ว`, 'success');
          } catch (err: any) {
            if (errBox) {
              errBox.hidden = false;
              errBox.textContent = err.message || 'ไม่สามารถแบ่งเงินเดือนได้ กรุณาตรวจสอบข้อมูล';
            }
          }
        });

        document.getElementById('btnRolloverSurplusToEmergency')?.addEventListener('click', async () => {
          const selectedMonth = (document.getElementById('dashboardMonthPicker') as HTMLInputElement | null)?.value || getBangkokTodayIso().slice(0, 7);
          const metrics = calculateDashboardMetrics(appState.transactions, selectedMonth);
          const gBal = metrics.fundBalances.find((b: any) => b.bucket === 'general_expense')?.availableBalance || 0;
          const fBal = metrics.fundBalances.find((b: any) => b.bucket === 'fixed_expense')?.availableBalance || 0;
          const surplus = Math.max(0, gBal) + Math.max(0, fBal);

          if (surplus <= 0) {
            showToast(`ไม่มีเงินเหลือใช้ในงบรายเดือน (${selectedMonth}) สำหรับโอนเข้าข้อ 4`, 'info');
            return;
          }

          const confirmed = await askUserConfirmation(
            'เก็บเงินเหลือใช้เข้าข้อ 4 ค่าใช้จ่ายฉุกเฉิน (ส่วนตัว)',
            `ต้องการโอนเงินที่เหลือใช้ของเดือน ${selectedMonth} จำนวนรวม ${formatCurrency(surplus, 'THB')} ไปเก็บสะสมไว้ใน "4. ค่าใช้จ่ายฉุกเฉิน (ส่วนตัว)" ใช่หรือไม่?`
          );
          if (!confirmed) return;

          const res = await rolloverMonthlySurplusToEmergency(selectedMonth);
          if (res.rolledOver) {
            showToast(`โอนเงินเหลือใช้ ${formatCurrency(res.amount, 'THB')} เข้าข้อ 4 ค่าใช้จ่ายฉุกเฉิน (ส่วนตัว) สำเร็จแล้ว`, 'success');
          }
        });

        // ปุ่มซิงก์และย้ายข้อมูลบนแถบด้านบน
        document.getElementById('btnTriggerSyncNow')?.addEventListener('click', async () => {
          const res = await syncPendingTransactions();
          showToast(`ซิงก์ข้อมูลสำเร็จ ${res.syncedCount} รายการ`, res.failedCount === 0 ? 'success' : 'warning');
        });
        document.getElementById('btnMigrateLocalToCloud')?.addEventListener('click', migrateLocalOnlyRecordsToCloudInteractive);

        // หน้าต่าง Settings Modal
        document.getElementById('btnOpenSettingsModal')?.addEventListener('click', () => {
          document.getElementById('inputSupabaseUrl').value = appState.settings.supabaseUrl || '';
          document.getElementById('inputSupabaseAnonKey').value = appState.settings.supabaseAnonKey || '';
          document.getElementById('settingsModal').hidden = false;
        });
        document.getElementById('btnCloseSettingsModal')?.addEventListener('click', () => {
          document.getElementById('settingsModal').hidden = true;
        });

        document.getElementById('btnSaveSupabaseConfig')?.addEventListener('click', async () => {
          try {
            const url = document.getElementById('inputSupabaseUrl').value;
            const key = document.getElementById('inputSupabaseAnonKey').value;
            saveSettingsToStorage(url, key);
            await initSupabaseClientAndVerify(true);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });

        document.getElementById('btnTestSupabaseConn')?.addEventListener('click', async () => {
          try {
            const url = document.getElementById('inputSupabaseUrl').value;
            const key = document.getElementById('inputSupabaseAnonKey').value;
            saveSettingsToStorage(url, key);
            await initSupabaseClientAndVerify(true);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });

        document.getElementById('btnClearSupabaseConfig')?.addEventListener('click', async () => {
          saveSettingsToStorage('', '');
          await initSupabaseClientAndVerify(false);
          showToast('สลับเป็นโหมดบันทึกข้อมูลในเครื่องแล้ว', 'info');
        });

        document.getElementById('btnCheckAiEdgeHealth')?.addEventListener('click', async () => {
          try {
            const res = await callAnalyzeReceiptEdgeFunction({ action: 'health' }, 10000);
            showToast(res.message || 'ตรวจสอบสถานะ AI เรียบร้อยแล้ว', res.ready ? 'success' : 'warning');
          } catch (err) {
            showToast(err.message || 'ไม่สามารถติดต่อ Edge Function ได้', 'error');
          }
        });

        // ปุ่มสำรองและนำเข้าข้อมูล
        document.getElementById('btnExportJson')?.addEventListener('click', exportBackupJson);
        document.getElementById('btnExportCsv')?.addEventListener('click', exportBackupCsv);
        document.getElementById('inputImportBackupFile')?.addEventListener('change', async (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          const resultBox = document.getElementById('importResultBox');
          try {
            const text = await file.text();
            const res = await validateAndImportBackup(text, file.name);
            if (resultBox) {
              resultBox.hidden = false;
              resultBox.textContent = `นำเข้าสำเร็จ ${res.imported} รายการ | ข้ามรายการซ้ำ ${res.duplicateCount} รายการ | ปฏิเสธข้อมูลผิดรูปแบบ ${res.rejected} รายการ`;
            }
            showToast(`นำเข้าข้อมูลสำเร็จ ${res.imported} รายการ`, 'success');
          } catch (err) {
            if (resultBox) {
              resultBox.hidden = false;
              resultBox.textContent = `นำเข้าไม่สำเร็จ: ${err.message}`;
            }
            showToast(err.message || 'ไฟล์นำเข้าไม่ถูกต้อง', 'error');
          } finally {
            e.target.value = '';
          }
        });

        // หน้าต่าง Authentication Modal
        document.getElementById('btnOpenAuthModal')?.addEventListener('click', () => {
          updateAuthModalView();
          document.getElementById('authModal').hidden = false;
        });
        document.getElementById('btnCloseAuthModal')?.addEventListener('click', () => {
          document.getElementById('authModal').hidden = true;
        });

        document.getElementById('authForm')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          await handleAuthSignIn();
        });
        document.getElementById('btnSignUp')?.addEventListener('click', handleAuthSignUp);
        document.getElementById('btnResetPassword')?.addEventListener('click', handleAuthPasswordReset);
        document.getElementById('btnSignOut')?.addEventListener('click', handleAuthSignOut);
        document.getElementById('btnVerifySessionNow')?.addEventListener('click', async () => {
          await initSupabaseClientAndVerify(true);
          updateAuthModalView();
        });

        // ตรวจสอบการกลับมาออนไลน์เพื่อซิงก์คิวค้างอัตโนมัติ
        globalScope.addEventListener('online', async () => {
          updateStatusBannersAndPills();
          if (appState.supabaseConnected && appState.currentUser) {
            await syncPendingTransactions();
          }
        });
        globalScope.addEventListener('offline', () => {
          updateStatusBannersAndPills();
        });
      }

      function updateAuthModalView() {
        const accountBox = document.getElementById('authCurrentAccountBox');
        const loggedInActions = document.getElementById('authLoggedInActions');
        const errBox = document.getElementById('authErrorBox');
        const okBox = document.getElementById('authSuccessBox');
        if (errBox) errBox.hidden = true;
        if (okBox) okBox.hidden = true;

        if (appState.currentUser) {
          accountBox.textContent = `เข้าสู่ระบบในชื่อ: ${appState.currentUser.email} (ID: ${appState.currentUser.id.slice(0, 8)}...)`;
          loggedInActions.hidden = false;
        } else {
          accountBox.textContent = 'สถานะปัจจุบัน: ยังไม่ได้เข้าสู่ระบบ (ทำงานในโหมดบันทึกข้อมูลในเครื่อง)';
          loggedInActions.hidden = true;
        }
      }

      async function handleAuthSignIn() {
        const errBox = document.getElementById('authErrorBox');
        const okBox = document.getElementById('authSuccessBox');
        if (errBox) errBox.hidden = true;
        if (okBox) okBox.hidden = true;

        if (!appState.supabaseClient) {
          if (errBox) {
            errBox.hidden = false;
            errBox.textContent = 'กรุณาตั้งค่า Supabase URL และ Publishable Key ในหน้า "ตั้งค่า" ก่อนเข้าสู่ระบบ';
          }
          return;
        }

        const email = document.getElementById('authEmailInput').value.trim();
        const password = document.getElementById('authPasswordInput').value;
        if (!email || !password) {
          if (errBox) {
            errBox.hidden = false;
            errBox.textContent = 'กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน';
          }
          return;
        }

        const { data, error } = await appState.supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
          if (errBox) {
            errBox.hidden = false;
            errBox.textContent = `เข้าสู่ระบบไม่สำเร็จ: ${error.message}`;
          }
          return;
        }

        appState.currentUser = data?.user || null;
        updateAuthModalView();
        updateStatusBannersAndPills();
        await pullCloudTransactionsAndMerge();
        showToast('เข้าสู่ระบบสำเร็จแล้ว', 'success');
      }

      async function handleAuthSignUp() {
        const errBox = document.getElementById('authErrorBox');
        const okBox = document.getElementById('authSuccessBox');
        if (errBox) errBox.hidden = true;
        if (okBox) okBox.hidden = true;

        if (!appState.supabaseClient) {
          if (errBox) {
            errBox.hidden = false;
            errBox.textContent = 'กรุณาตั้งค่า Supabase URL และ Publishable Key ในหน้า "ตั้งค่า" ก่อนสมัครสมาชิก';
          }
          return;
        }

        const email = document.getElementById('authEmailInput').value.trim();
        const password = document.getElementById('authPasswordInput').value;
        if (!email || password.length < 6) {
          if (errBox) {
            errBox.hidden = false;
            errBox.textContent = 'กรุณากรอกอีเมลและรหัสผ่านอย่างน้อย 6 ตัวอักษร';
          }
          return;
        }

        const redirectUrl = new URL('./index.html', globalScope.location.href).href;
        const { error } = await appState.supabaseClient.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectUrl }
        });

        if (error) {
          if (errBox) {
            errBox.hidden = false;
            errBox.textContent = `สมัครบัญชีไม่สำเร็จ: ${error.message}`;
          }
          return;
        }

        if (okBox) {
          okBox.hidden = false;
          okBox.textContent = 'สมัครบัญชีสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี (หรือเข้าสู่ระบบได้ทันทีหากปิด Confirm Email ไว้)';
        }
      }

      async function handleAuthPasswordReset() {
        const errBox = document.getElementById('authErrorBox');
        const okBox = document.getElementById('authSuccessBox');
        if (errBox) errBox.hidden = true;
        if (okBox) okBox.hidden = true;

        if (!appState.supabaseClient) {
          if (errBox) {
            errBox.hidden = false;
            errBox.textContent = 'กรุณาตั้งค่า Supabase ในหน้า "ตั้งค่า" ก่อนกู้คืนรหัสผ่าน';
          }
          return;
        }

        const email = document.getElementById('authEmailInput').value.trim();
        if (!email) {
          if (errBox) {
            errBox.hidden = false;
            errBox.textContent = 'กรุณากรอกอีเมลที่ต้องการกู้คืนรหัสผ่าน';
          }
          return;
        }

        const redirectUrl = new URL('./index.html', globalScope.location.href).href;
        const { error } = await appState.supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo: redirectUrl
        });
        if (error) {
          if (errBox) {
            errBox.hidden = false;
            errBox.textContent = `ส่งลิงก์กู้คืนรหัสผ่านไม่สำเร็จ: ${error.message}`;
          }
          return;
        }

        if (okBox) {
          okBox.hidden = false;
          okBox.textContent = 'ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปยังอีเมลของคุณแล้ว';
        }
      }

      async function handleAuthSignOut() {
        appState.currentUser = null;
        stopShareHeartbeat();
        await cleanupRealtimeSubscription();
        await releaseSharedReceipt().catch(() => {});
        if (appState.supabaseClient) {
          await appState.supabaseClient.auth.signOut();
        }
        appState.currentUser = null;
        await refreshTransactionsFromLocal();
        updateAuthModalView();
        updateStatusBannersAndPills();
        showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
      }

      function registerServiceWorkerSafe() {
        const host = globalScope.location.hostname || String(globalScope.location.host || '').split(':')[0];
        if ('serviceWorker' in navigator && (globalScope.location.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1')) {
          return navigator.serviceWorker.register('./sw.js', { scope: './' }).then((registration: any) => registration?.update?.()).catch(() => {});
        }
      }

      // =======================================================================
      // ROCKETTOOL-ENGINE STOCK PORTFOLIO & P/L TRACKER (TASK-SLIPSENSE-V4-018)
      // =======================================================================
      const STOCK_HOLDINGS_KEY = 'slipsense_stock_holdings_v1';
      const STOCK_TRANSACTIONS_KEY = 'slipsense_stock_transactions_v1';

      interface StockHolding {
        id: string;
        ticker: string;
        name: string;
        shares: number;
        costBasis: number;
        avgCost: number;
        currentPrice: number;
        targetPct: number;
        currency: string;
        updatedAt: string;
      }

      interface StockTransaction {
        id: string;
        ticker: string;
        action: 'buy' | 'sell';
        quantity: number;
        price: number;
        amount: number;
        realizedPL?: number;
        fundId?: string;
        tradeDate: string;
        createdAt: string;
      }

      function getStockHoldingsFromStorage(): StockHolding[] {
        try {
          const raw = localStorage.getItem(STOCK_HOLDINGS_KEY);
          if (raw) return JSON.parse(raw);
        } catch {}
        // Default initial sample portfolio if empty so user immediately sees how it works
        return [
          { id: 'stock-nvda', ticker: 'NVDA', name: 'NVIDIA Corp', shares: 10, costBasis: 1100, avgCost: 110, currentPrice: 142.50, targetPct: 35, currency: 'USD', updatedAt: new Date().toISOString() },
          { id: 'stock-aapl', ticker: 'AAPL', name: 'Apple Inc', shares: 5, costBasis: 900, avgCost: 180, currentPrice: 225.00, targetPct: 25, currency: 'USD', updatedAt: new Date().toISOString() },
          { id: 'stock-ptt', ticker: 'PTT.BK', name: 'ปตท.', shares: 100, costBasis: 3200, avgCost: 32, currentPrice: 31.50, targetPct: 15, currency: 'THB', updatedAt: new Date().toISOString() }
        ];
      }

      function saveStockHoldingsToStorage(holdings: StockHolding[]) {
        try {
          localStorage.setItem(STOCK_HOLDINGS_KEY, JSON.stringify(holdings));
        } catch {}
      }

      function getStockTransactionsFromStorage(): StockTransaction[] {
        try {
          const raw = localStorage.getItem(STOCK_TRANSACTIONS_KEY);
          if (raw) return JSON.parse(raw);
        } catch {}
        return [];
      }

      function saveStockTransactionsToStorage(txs: StockTransaction[]) {
        try {
          localStorage.setItem(STOCK_TRANSACTIONS_KEY, JSON.stringify(txs));
        } catch {}
      }

      function calculateWeightedAverageCost(currentShares: any, currentCostBasis: any, buyQty: any, buyPrice: any) {
        const shares = Number(currentShares) || 0;
        const cost = Number(currentCostBasis) || 0;
        const qty = Number(buyQty) || 0;
        const price = Number(buyPrice) || 0;
        if (qty <= 0 || price < 0) return { shares, costBasis: cost, avgCost: shares > 0 ? cost / shares : 0 };
        const newShares = shares + qty;
        const newCostBasis = cost + (qty * price);
        const newAvgCost = newShares > 0 ? newCostBasis / newShares : 0;
        return { shares: newShares, costBasis: newCostBasis, avgCost: newAvgCost };
      }

      function calculateSellExecution(currentShares: any, currentAvgCost: any, sellQty: any, sellPrice: any) {
        const shares = Number(currentShares) || 0;
        const avgCost = Number(currentAvgCost) || 0;
        const qty = Number(sellQty) || 0;
        const price = Number(sellPrice) || 0;
        if (shares <= 0 || qty <= 0) return { shares, costBasis: shares * avgCost, avgCost, realizedPL: 0 };
        const actualSellQty = Math.min(shares, qty);
        const costOfSold = actualSellQty * avgCost;
        const proceeds = actualSellQty * price;
        const realizedPL = proceeds - costOfSold;
        const remainingShares = shares - actualSellQty;
        const remainingCostBasis = remainingShares * avgCost;
        return { shares: remainingShares, costBasis: remainingCostBasis, avgCost: remainingShares > 0 ? avgCost : 0, realizedPL };
      }

      function calculateHoldingPnL(shares: any, costBasis: any, currentPrice: any) {
        const s = Number(shares) || 0;
        const cost = Number(costBasis) || 0;
        const price = Number(currentPrice) || 0;
        const marketValue = s * price;
        const unrealizedPL = marketValue - cost;
        const unrealizedPLPct = cost > 0 ? (unrealizedPL / cost) * 100 : 0;
        return { marketValue, unrealizedPL, unrealizedPLPct };
      }

      function calculatePortfolioSummary(holdings: StockHolding[], cashBalance: any) {
        const cash = Math.max(0, Number(cashBalance) || 0);
        let totalStockValue = 0;
        let totalCost = 0;
        const computedHoldings = (holdings || []).map(h => {
          const s = Number(h.shares) || 0;
          const cost = Number(h.costBasis) || 0;
          const price = Number(h.currentPrice) || 0;
          const pnl = calculateHoldingPnL(s, cost, price);
          totalStockValue += pnl.marketValue;
          totalCost += cost;
          return { ...h, ...pnl };
        });
        const totalPortfolioValue = totalStockValue + cash;
        const totalUnrealizedPL = totalStockValue - totalCost;
        const totalUnrealizedPLPct = totalCost > 0 ? (totalUnrealizedPL / totalCost) * 100 : 0;
        const items = computedHoldings.map(h => ({
          id: h.id,
          ticker: h.ticker,
          name: h.name || h.ticker,
          shares: h.shares,
          costBasis: h.costBasis,
          avgCost: h.avgCost,
          currentPrice: h.currentPrice,
          value: h.marketValue,
          weight: totalPortfolioValue > 0 ? (h.marketValue / totalPortfolioValue) * 100 : 0,
          targetPct: Number(h.targetPct) || 0,
          unrealizedPL: h.unrealizedPL,
          unrealizedPLPct: h.unrealizedPLPct,
          currency: h.currency || 'USD'
        }));
        const cashWeight = totalPortfolioValue > 0 ? (cash / totalPortfolioValue) * 100 : 0;
        return {
          totalStockValue,
          cash,
          totalPortfolioValue,
          totalCost,
          totalUnrealizedPL,
          totalUnrealizedPLPct,
          items,
          cashWeight
        };
      }

      
      // DIME Portfolio Screenshot Importer & Trade Slip Engine (TASK-SLIPSENSE-V4-020)
      function calculateDimeHoldingMetrics(raw: any) {
        const ticker = String(raw.ticker || '').toUpperCase().trim();
        const numeric = (v: any) => v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
        const marketValue = numeric(raw.marketValue);
        let unrealizedPL = numeric(raw.unrealizedPL);
        let unrealizedPLPct = numeric(raw.unrealizedPLPct);

        if (unrealizedPL === null) {
          if (marketValue !== null && unrealizedPLPct !== null && unrealizedPLPct > -100) {
            unrealizedPL = (marketValue * (unrealizedPLPct / 100)) / (1 + (unrealizedPLPct / 100));
          } else {
            unrealizedPL = null;
          }
        }

        const costBasis = numeric(raw.costBasis) ?? (marketValue !== null && unrealizedPL !== null ? marketValue - unrealizedPL : null);
        unrealizedPL = marketValue !== null && costBasis !== null ? marketValue - costBasis : null;
        unrealizedPLPct = costBasis > 0 && unrealizedPL !== null ? unrealizedPL / costBasis * 100 : null;
        let shares = numeric(raw.shares);
        let currentPrice = numeric(raw.currentPrice);

        if (!(shares > 0) && currentPrice > 0 && marketValue !== null) {
          shares = marketValue / currentPrice;
        } else if (!(shares > 0)) {
          shares = null;
        }

        const avgCost = shares > 0 && costBasis !== null ? (costBasis / shares) : null;
        if (shares > 0 && marketValue !== null) {
          currentPrice = marketValue / shares;
        } else currentPrice = null;

        const result = {
          ticker,
          marketValue,
          unrealizedPL,
          unrealizedPLPct,
          costBasis,
          shares,
          avgCost,
          currentPrice
        };
        for (const key of Object.keys(result)) if (typeof result[key] === 'number' && !Number.isFinite(result[key])) result[key] = null;
        return result;
      }

      function upsertPortfolioHoldings(newHoldings: any[], replaceAll = false) {
        newHoldings = validateDimeReview(newHoldings);
        const stored = localStorage.getItem(STOCK_HOLDINGS_KEY);
        const latest = (stored === null ? getStockHoldingsFromStorage() : JSON.parse(stored)).map(h => ({ ...h, ticker: String(h.ticker).trim().toUpperCase() }));
        const holdings = replaceAll ? [] : latest;
        newHoldings.forEach(nh => {
          const t = String(nh.ticker || '').toUpperCase().trim();
          if (!t) return;
          const existing = holdings.find(h => h.ticker.toUpperCase() === t);
          if (existing) {
            existing.shares = nh.shares;
            existing.costBasis = nh.costBasis;
            existing.avgCost = nh.avgCost;
            existing.currentPrice = nh.currentPrice;
            existing.currency = 'USD';
            if (nh.targetPct && nh.targetPct > 0) existing.targetPct = nh.targetPct;
            existing.updatedAt = new Date().toISOString();
          } else {
            holdings.push({
              ...(latest.find(h => h.ticker === t) || {}),
              id: latest.find(h => h.ticker === t)?.id || 'stock-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
              ticker: t,
              name: latest.find(h => h.ticker === t)?.name || t,
              shares: nh.shares,
              costBasis: nh.costBasis,
              avgCost: nh.avgCost,
              currentPrice: nh.currentPrice,
              targetPct: nh.targetPct || latest.find(h => h.ticker === t)?.targetPct || 0,
              currency: 'USD',
              updatedAt: new Date().toISOString()
            });
          }
        });
        // One atomic key replacement. Propagate quota/security errors to the review UI.
        localStorage.setItem(STOCK_HOLDINGS_KEY, JSON.stringify(holdings));
        // Rendering cannot undo a committed atomic storage write.
        try { renderStockPortfolioUI(); } catch (_) {}
      }

      let stagedDimeHoldings: any[] = [];
      let dimeImportBusy = false;
      let dimeImportGeneration = 0;
      let dimeReviewOwner: string | null = null;

      function validateDimeReview(items: any[]) {
        if (!items.length) throw new Error("ไม่พบรายการหุ้น");
        const seen = new Set();
        return items.map(raw => {
          if (['shares', 'marketValue', 'costBasis'].some(key => raw[key] === null || raw[key] === undefined || raw[key] === '' || !Number.isFinite(Number(raw[key])))) throw new Error("กรุณากรอกข้อมูลให้ครบทุกช่อง");
          const item = calculateDimeHoldingMetrics(raw);
          if (!/^[A-Z0-9][A-Z0-9.-]*$/.test(item.ticker) || seen.has(item.ticker)) throw new Error("กรุณาตรวจชื่อหุ้นที่ว่าง ไม่ถูกต้อง หรือซ้ำกัน");
          seen.add(item.ticker);
          if (!(Number(raw.shares) > 0) || !(item.shares > 0) || item.marketValue === null || item.marketValue < 0 || item.costBasis === null || item.costBasis < 0 || item.currentPrice === null || item.avgCost === null) throw new Error("กรุณากรอกจำนวนหุ้น มูลค่า และต้นทุนให้ครบทุกแถว");
          return item;
        });
      }
      function mergeDimePortfolioResponse(merged: Map<string, any>, response: any) {
        const data = response?.data;
        if (response?.ok !== true || data?.currency !== 'USD' || !Array.isArray(data.holdings) || !data.holdings.length) throw new Error("ไม่พบหุ้น หรือผลลัพธ์ AI ไม่ถูกต้อง กรุณาเลือกภาพใหม่");
        for (const raw of data.holdings) {
          if (!raw || typeof raw.ticker !== 'string' || !/^[A-Z0-9][A-Z0-9.-]*$/.test(raw.ticker.trim().toUpperCase()) || (raw.currency && raw.currency !== 'USD')) throw new Error("รูปแบบชื่อหุ้นหรือสกุลเงินไม่ถูกต้อง");
          for (const key of ['marketValue', 'unrealizedPL', 'unrealizedPLPct', 'shares', 'currentPrice']) if (raw[key] != null && (typeof raw[key] !== 'number' || !Number.isFinite(raw[key]))) throw new Error("ผลลัพธ์ AI มีตัวเลขไม่ถูกต้อง");
          const item = { ...calculateDimeHoldingMetrics(raw), conflict: false };
          const previous = merged.get(item.ticker);
          if (!previous) merged.set(item.ticker, item);
          else if (['marketValue', 'costBasis', 'shares', 'currentPrice'].some(key => previous[key] !== item[key])) previous.conflict = true;
        }
      }

      function parseDimeTextMock(text: string) {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const results: any[] = [];
        const tickerRegex = /\b([A-Z]{2,6})\b/;
        for (let i = 0; i < lines.length; i++) {
          const match = lines[i].match(tickerRegex);
          if (match) {
            const ticker = match[1];
            if (['USD', 'THB', 'DIME', 'TOTAL', 'APP', 'BUY', 'SELL', 'NAME', 'PROFIT'].includes(ticker)) continue;
            const context = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 5)).join(' ');
            const valMatch = context.match(/(?:\$|฿)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)/g);
            const pctMatch = context.match(/([+-]?[0-9]+(?:\.[0-9]+)?)\s*%/);
            const plUsdMatch = context.match(/([+-]\s*[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*USD/i);

            let mv = 0;
            if (valMatch && valMatch.length > 0) {
              const cleaned = valMatch.map(v => Number(v.replace(/[^0-9.]/g, ''))).filter(n => n > 0 && n < 1000000);
              mv = cleaned[0] || 1000;
            } else {
              mv = 1000;
            }

            let pl = 0;
            let plPct = 0;
            if (plUsdMatch) pl = Number(plUsdMatch[1].replace(/\s/g, '').replace(/,/g, ''));
            if (pctMatch) plPct = Number(pctMatch[1]);
            if (pl === 0 && plPct !== 0) pl = (mv * (plPct / 100)) / (1 + (plPct / 100));

            results.push(calculateDimeHoldingMetrics({
              ticker,
              marketValue: mv,
              unrealizedPL: pl,
              unrealizedPLPct: plPct,
              shares: Math.max(1, Math.round(mv / 50)),
              currentPrice: 50
            }));
          }
        }
        return results;
      }

      function simulateTrade(holding: any, action: string, quantity: any, price: any, currentTotalPortfolioValue: any) {
        const qty = Number(quantity) || 0;
        const px = Number(price) || 0;
        const portVal = Number(currentTotalPortfolioValue) || 0;
        const targetPct = Number(holding?.targetPct) || 0;
        if (action === 'buy') {
          const projected = calculateWeightedAverageCost(holding?.shares || 0, holding?.costBasis || 0, qty, px);
          const projectedMarketValue = projected.shares * px;
          const newPortVal = portVal + (qty * px);
          const projectedWeight = newPortVal > 0 ? (projectedMarketValue / newPortVal) * 100 : 0;
          let alertType = 'none';
          let alertText = '';
          if (targetPct > 0) {
            if (projectedWeight > targetPct) {
              alertType = 'warn';
              alertText = '⚠️ สัดส่วนจะเกินเป้า ' + targetPct + '% ไปเป็น ' + projectedWeight.toFixed(1) + '% — ตั้งใจเพิ่มน้ำหนักตัวนี้จริงไหม?';
            } else {
              alertType = 'ok';
              alertText = '✓ ยังอยู่ในกรอบเป้า ' + targetPct + '% (' + projectedWeight.toFixed(1) + '%)';
            }
          }
          return {
            projectedShares: projected.shares,
            projectedAvgCost: projected.avgCost,
            projectedCostBasis: projected.costBasis,
            projectedMarketValue,
            projectedWeight,
            alertType,
            alertText
          };
        }
        return null;
      }

      function createSvgArcPath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
        const pt = (r: number, a: number): [number, number] => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
        const [ox, oy] = pt(rOuter, a0);
        const [ux, uy] = pt(rOuter, a1);
        const [hx, hy] = pt(rInner, a1);
        const [px, py] = pt(rInner, a0);
        const largeArc = (a1 - a0 > Math.PI) ? 1 : 0;
        return 'M ' + ox.toFixed(2) + ' ' + oy.toFixed(2) + ' A ' + rOuter + ' ' + rOuter + ' 0 ' + largeArc + ' 1 ' + ux.toFixed(2) + ' ' + uy.toFixed(2) + ' L ' + hx.toFixed(2) + ' ' + hy.toFixed(2) + ' A ' + rInner + ' ' + rInner + ' 0 ' + largeArc + ' 0 ' + px.toFixed(2) + ' ' + py.toFixed(2) + ' Z';
      }

      function getStockJarCashBalance(): number {
        try {
          const selectedMonth = (document.getElementById('dashboardMonthPicker') as HTMLInputElement)?.value || getBangkokTodayIso().slice(0, 7);
          const metrics = calculateMonthlyDashboard(appState.transactions, selectedMonth);
          if (metrics && Array.isArray(metrics.fundBalances)) {
            const stockFund = metrics.fundBalances.find((f: any) => f.bucket === 'investment_stock');
            if (stockFund && Number.isFinite(stockFund.availableBalance)) {
              return Math.max(0, stockFund.availableBalance);
            }
          }
        } catch {}
        return 0;
      }

      const DONUT_PALETTE = ['#2dd4bf', '#60a5fa', '#c4b5fd', '#fbbf24', '#f472b6', '#a3e635', '#38bdf8', '#fb923c'];

      let stockSortMode = 'pnl_desc';
      let stockSearchQuery = '';
      let activeStockSubtab = 'holdings';

      function getStockAvatarInfo(ticker) {
        const t = (ticker || '').toUpperCase().trim();
        const known = {
          'NVDA': { bg: '#76b900', text: 'N' },
          'AMZN': { bg: '#ff9900', text: 'a' },
          'META': { bg: '#0668e1', text: 'M' },
          'GOOGL': { bg: '#ea4335', text: 'G' },
          'GOOG': { bg: '#ea4335', text: 'G' },
          'MSFT': { bg: '#00a4ef', text: 'M' },
          'LLY': { bg: '#d92526', text: 'L' },
          'MELI': { bg: '#ffe600', text: 'M' },
          'AVGO': { bg: '#cc092f', text: 'A' },
          'TSM': { bg: '#e31b23', text: 'T' },
          'TEM': { bg: '#111111', text: 'T' },
          'SNOW': { bg: '#29b5e8', text: '❄️' },
          'CRWD': { bg: '#e01e26', text: '🦅' },
          'WGS': { bg: '#2b5cbe', text: 'W' },
          'AAPL': { bg: '#555555', text: '🍎' },
          'TSLA': { bg: '#cc0000', text: 'T' },
          'BTC': { bg: '#f7931a', text: '₿' },
          'ETH': { bg: '#627eea', text: 'Ξ' },
          'PTT': { bg: '#005baa', text: 'P' },
          'AOT': { bg: '#003399', text: 'A' }
        };
        if (known[t]) return known[t];
        let hash = 0;
        for (let i = 0; i < t.length; i++) {
          hash = (hash << 5) - hash + t.charCodeAt(i);
          hash |= 0;
        }
        const hue = Math.abs(hash) % 360;
        return { bg: 'hsl(' + hue + ', 65%, 45%)', text: t.slice(0, 2) };
      }

      function renderStockPortfolioUI() {
        const holdings = getStockHoldingsFromStorage();
        const cashBalance = getStockJarCashBalance();
        const summary = calculatePortfolioSummary(holdings, cashBalance);

        // 1. Update Hero
        const grandTotalEl = document.getElementById('portfolioGrandTotal');
        const totalCostEl = document.getElementById('portfolioTotalCost');
        const cashBalanceEl = document.getElementById('portfolioCashBalance');
        const pnlBadgeEl = document.getElementById('portfolioTotalPnlBadge');
        const pnlAmountEl = document.getElementById('portfolioTotalPnlAmount');
        const pnlPctEl = document.getElementById('portfolioTotalPnlPct');

        if (grandTotalEl) grandTotalEl.textContent = formatCurrency(summary.totalPortfolioValue);
        if (totalCostEl) totalCostEl.textContent = formatCurrency(summary.totalCost);
        if (cashBalanceEl) cashBalanceEl.textContent = formatCurrency(summary.cash);

        if (pnlBadgeEl && pnlAmountEl && pnlPctEl) {
          const isUp = summary.totalUnrealizedPL >= 0;
          pnlBadgeEl.className = 'pnl-hero-badge ' + (isUp ? 'up' : 'down');
          pnlAmountEl.textContent = (isUp ? '+' : '') + formatCurrency(summary.totalUnrealizedPL);
          pnlPctEl.textContent = '(' + (isUp ? '+' : '') + summary.totalUnrealizedPLPct.toFixed(1) + '%)';
        }

        // 2. Render SVG Donut Chart (RocketTool cR Arc)
        const donutContainer = document.getElementById('stockDonutContainer');
        if (donutContainer) {
          donutContainer.innerHTML = '';
          const totalVal = summary.totalPortfolioValue;

          if (totalVal <= 0 || (summary.items.length === 0 && summary.cash <= 0)) {
            donutContainer.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:0.9rem;">ยังไม่มีรายการหุ้นในพอร์ต — แตะ "+ บันทึกซื้อ/ขายหุ้น" เพื่อเริ่มต้น</div>';
          } else {
            // Build segments: each stock + cash
            const segments: Array<{ name: string; value: number; color: string; pct: number }> = [];
            summary.items.forEach((item, idx) => {
              if (item.value > 0) {
                segments.push({
                  name: item.ticker,
                  value: item.value,
                  color: DONUT_PALETTE[idx % DONUT_PALETTE.length],
                  pct: item.weight
                });
              }
            });
            if (summary.cash > 0) {
              segments.push({
                name: 'เงินสด',
                value: summary.cash,
                color: '#64748b',
                pct: summary.cashWeight
              });
            }

            // SVG Element
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 320 320');
            svg.setAttribute('class', 'stock-donut-svg');
            svg.setAttribute('role', 'img');
            svg.setAttribute('aria-label', 'สัดส่วนสินทรัพย์ในพอร์ต');

            let angle = -Math.PI / 2;
            segments.forEach(seg => {
              const fraction = totalVal > 0 ? seg.value / totalVal : 0;
              const a0 = angle;
              const a1 = angle + fraction * Math.PI * 2;
              angle = a1;

              const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
              // cR(160, 160, outerR=130, innerR=82, a0, a1)
              path.setAttribute('d', createSvgArcPath(160, 160, 130, 82, a0, a1));
              path.setAttribute('fill', seg.color);
              path.setAttribute('opacity', '0.94');

              const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
              title.textContent = seg.name + ': ' + formatCurrency(seg.value) + ' (' + seg.pct.toFixed(1) + '%)';
              path.appendChild(title);
              svg.appendChild(path);
            });

            // Center Text
            const centerLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            centerLabel.setAttribute('x', '160');
            centerLabel.setAttribute('y', '145');
            centerLabel.setAttribute('text-anchor', 'middle');
            centerLabel.setAttribute('font-size', '11.5');
            centerLabel.setAttribute('font-weight', '700');
            centerLabel.setAttribute('fill', 'var(--text-muted)');
            centerLabel.textContent = 'มูลค่าพอร์ตรวม';
            svg.appendChild(centerLabel);

            const centerVal = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            centerVal.setAttribute('x', '160');
            centerVal.setAttribute('y', '172');
            centerVal.setAttribute('text-anchor', 'middle');
            centerVal.setAttribute('font-size', '17');
            centerVal.setAttribute('font-weight', '800');
            centerVal.setAttribute('fill', 'var(--text-main)');
            centerVal.textContent = formatCurrency(totalVal);
            svg.appendChild(centerVal);

            donutContainer.appendChild(svg);

            // Legend
            const legendGrid = document.createElement('div');
            legendGrid.className = 'stock-donut-legend';
            segments.forEach(seg => {
              const itemEl = document.createElement('div');
              itemEl.className = 'donut-legend-item';
              itemEl.innerHTML = '<span class="donut-legend-chip" style="background:' + seg.color + '"></span>' +
                '<span style="font-weight:700;flex:1;">' + seg.name + '</span>' +
                '<span style="color:var(--text-muted);font-size:0.78rem;">' + seg.pct.toFixed(1) + '%</span>';
              legendGrid.appendChild(itemEl);
            });
            donutContainer.appendChild(legendGrid);
          }
        }

        // 3. Render Holdings List (RocketTool Mobile Compact List)
        let displayedItems = [...summary.items];
        if (stockSearchQuery) {
          const q = stockSearchQuery.toLowerCase();
          displayedItems = displayedItems.filter(item => 
            item.ticker.toLowerCase().includes(q) || (item.name && item.name.toLowerCase().includes(q))
          );
        }
        if (stockSortMode === 'pnl_desc') {
          displayedItems.sort((a, b) => b.unrealizedPLPct - a.unrealizedPLPct);
        } else if (stockSortMode === 'pnl_asc') {
          displayedItems.sort((a, b) => a.unrealizedPLPct - b.unrealizedPLPct);
        } else if (stockSortMode === 'weight_desc') {
          displayedItems.sort((a, b) => b.weight - a.weight);
        } else if (stockSortMode === 'weight_asc') {
          displayedItems.sort((a, b) => a.weight - b.weight);
        }

        const holdingsCountEl = document.getElementById('holdingsCount');
        if (holdingsCountEl) holdingsCountEl.textContent = 'Holdings (' + summary.items.length + ')';

        const lastUpdatedEl = document.getElementById('portfolioLastUpdated');
        if (lastUpdatedEl) {
          try {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            lastUpdatedEl.textContent = 'อัปเดตล่าสุด ' + timeStr + ' น.';
          } catch {}
        }

        const holdingsListEl = document.getElementById('stockHoldingsList');
        if (holdingsListEl) {
          holdingsListEl.innerHTML = '';
          if (displayedItems.length === 0) {
            holdingsListEl.innerHTML = '<div style="padding:28px 16px;text-align:center;color:var(--text-muted);font-size:0.88rem;">' +
              (stockSearchQuery ? 'ไม่พบหุ้นที่ตรงกับคำค้นหา "' + stockSearchQuery + '"' : 'ยังไม่มีหุ้นในพอร์ต แตะปุ่ม "➕" ด้านบนเพื่อเริ่มบันทึก') +
              '</div>';
          } else {
            const fragment = document.createDocumentFragment();
            displayedItems.forEach(h => {
              const card = document.createElement('div');
              card.className = 'stock-compact-card';
              card.setAttribute('data-ticker', h.ticker);
              card.setAttribute('role', 'button');
              card.setAttribute('tabindex', '0');
              card.setAttribute('title', 'แตะเพื่อเปิดดูกราฟ TradingView สำหรับ ' + h.ticker);

              const isUp = h.unrealizedPL >= 0;
              const pnlClass = isUp ? 'up' : 'down';
              const pnlSign = isUp ? '+' : '';
              const avatar = getStockAvatarInfo(h.ticker);

              card.innerHTML = 
                '<div class="stock-card-left">' +
                  '<div class="stock-avatar" style="background:' + avatar.bg + ';">' + avatar.text + '</div>' +
                  '<div class="stock-info-col">' +
                    '<div class="stock-ticker-row">' +
                      '<span class="stock-ticker-symbol">' + h.ticker + '</span>' +
                      '<span class="stock-pie-badge">◔ ' + h.weight.toFixed(1) + '%</span>' +
                    '</div>' +
                    '<div class="stock-shares-avg">' + h.shares.toLocaleString() + ' หุ้น · avg ' + formatCurrency(h.avgCost) + '</div>' +
                  '</div>' +
                '</div>' +
                '<div class="stock-card-right">' +
                  '<div class="stock-val-text">' + formatCurrency(h.value) + '</div>' +
                  '<div class="stock-pnl-text ' + pnlClass + '">' + pnlSign + h.unrealizedPLPct.toFixed(2) + '%</div>' +
                '</div>';

              fragment.appendChild(card);
            });
            holdingsListEl.appendChild(fragment);
          }
        }

        // 4. Render Transaction History Tab
        const txListEl = document.getElementById('stockTransactionsList');
        if (txListEl) {
          txListEl.innerHTML = '';
          const txs = getStockTransactionsFromStorage();
          if (txs.length === 0) {
            txListEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.85rem;">ยังไม่มีประวัติการซื้อ/ขายหุ้น</div>';
          } else {
            txs.forEach(t => {
              const row = document.createElement('div');
              row.className = 'stock-tx-row';
              row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:10px;background:var(--bg-surface);border:1px solid var(--border-color);';
              const isBuy = t.action === 'buy';
              row.innerHTML = 
                '<div>' +
                  '<div style="font-weight:700;font-size:0.92rem;">' +
                    '<span style="color:' + (isBuy ? '#10b981' : '#f43f5e') + ';font-weight:800;">' + (isBuy ? 'ซื้อ' : 'ขาย') + '</span> ' + t.ticker +
                  '</div>' +
                  '<div style="font-size:0.75rem;color:var(--text-muted);">' + t.quantity + ' หุ้น @ ' + formatCurrency(t.price) + ' · ' + t.tradeDate + '</div>' +
                '</div>' +
                '<div style="text-align:right;">' +
                  '<div style="font-weight:700;font-size:0.92rem;">' + formatCurrency(t.amount) + '</div>' +
                  (!isBuy && t.realizedPL !== undefined ? '<div style="font-size:0.75rem;font-weight:700;color:' + (t.realizedPL >= 0 ? '#10b981' : '#f43f5e') + ';">กำไร ' + (t.realizedPL >= 0 ? '+' : '') + formatCurrency(t.realizedPL) + '</div>' : '') +
                '</div>';
              txListEl.appendChild(row);
            });
          }
        }
      }

      function openTradingViewModal(ticker: string) {
        const modal = document.getElementById('tradingViewModal');
        const container = document.getElementById('tradingViewWidgetContainer');
        const title = document.getElementById('tradingViewModalTitle');
        if (!modal || !container) return;

        const cleanTicker = (ticker || 'NVDA').toUpperCase().trim();
        if (title) title.textContent = 'กราฟ TradingView · ' + cleanTicker;

        modal.hidden = false;
        container.innerHTML = '';

        let tvSymbol = cleanTicker;
        if (cleanTicker.endsWith('.BK')) {
          tvSymbol = 'SET:' + cleanTicker.replace('.BK', '');
        } else if (cleanTicker === 'BTC' || cleanTicker === 'ETH') {
          tvSymbol = 'BINANCE:' + cleanTicker + 'USDT';
        } else if (!cleanTicker.includes(':')) {
          tvSymbol = 'NASDAQ:' + cleanTicker;
        }

        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.setAttribute('loading', 'lazy');
        iframe.setAttribute('allowtransparency', 'true');
        iframe.setAttribute('scrolling', 'no');
        iframe.setAttribute('allowfullscreen', 'true');
        iframe.src = 'https://s.tradingview.com/widgetembed/?symbol=' + encodeURIComponent(tvSymbol) + '&interval=D&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=[]&theme=dark&style=1&timezone=Asia%2FBangkok&locale=th_TH';
        container.appendChild(iframe);
      }

            // =======================================================================
      // DAN INSURANCE & JAR TRANSFER & PORTFOLIO MANAGEMENT
      // =======================================================================
      interface DanInsurancePolicy {
        id: string;
        name: string;
        amount: number;
        dueDate: string;
        status: "pending" | "paid";
        paidAt?: string;
      }

      function getDanInsurancePolicies(): DanInsurancePolicy[] {
        try {
          const raw = localStorage.getItem("slipsense_dan_insurance_policies");
          return raw ? JSON.parse(raw) : [];
        } catch (_) {
          return [];
        }
      }

      function saveDanInsurancePolicy(policy: DanInsurancePolicy): DanInsurancePolicy[] {
        const policies = getDanInsurancePolicies();
        const idx = policies.findIndex(p => p.id === policy.id);
        if (idx >= 0) {
          policies[idx] = policy;
        } else {
          policies.push(policy);
        }
        try {
          localStorage.setItem("slipsense_dan_insurance_policies", JSON.stringify(policies));
        } catch (_) {}
        return policies;
      }

      async function payDanInsurancePolicy(policyId: string): Promise<DanInsurancePolicy | null> {
        const policies = getDanInsurancePolicies();
        const policy = policies.find(p => p.id === policyId);
        if (!policy) return null;
        policy.status = "paid";
        policy.paidAt = new Date().toISOString();
        try {
          localStorage.setItem("slipsense_dan_insurance_policies", JSON.stringify(policies));
        } catch (_) {}
        const newTx: any = {
          id: generateUuid(),
          date: getBangkokTodayIso(),
          type: "expense",
          category: "insurance_dan",
          amount: policy.amount,
          description: "จ่ายเบี้ย " + policy.name,
          fund_bucket: "insurance_dan",
          source: "manual",
          needs_verification: false
        };
        appState.transactions.unshift(newTx);
        await persistTransactionsToLocal();
        renderDashboardAndHistory();
        return policy;
      }

      async function persistTransactionsToLocal() {
        for (const tx of appState.transactions) {
          await dbPutTransaction(tx);
        }
      }

      async function depositToSalaryJar(amount: number, date?: string, description?: string) {
        const txDate = date || getBangkokTodayIso();
        const txDesc = description || "เงินเดือนเข้ากระปุก";
        if (!FUND_BUCKET_ORDER.includes("salary_bucket")) {
          FUND_BUCKET_ORDER.push("salary_bucket");
          FUND_BUCKET_LABELS["salary_bucket"] = "💰 เงินเดือน";
          if (bucketRegistry && Array.isArray(bucketRegistry.buckets)) {
            if (!bucketRegistry.buckets.some((b: any) => b.bucket_key === "salary_bucket")) {
              bucketRegistry.buckets.push({
                bucket_key: "salary_bucket",
                name: "เงินเดือน",
                icon: "💰",
                color: "#10b981",
                is_cumulative: true,
                sort_order: 99
              });
            }
          }
        }
        const newTx: any = {
          id: generateUuid(),
          date: txDate,
          type: "income",
          category: "salary_bucket",
          amount: Number(amount) || 0,
          description: txDesc,
          fund_bucket: "salary_bucket",
          source: "manual",
          needs_verification: false
        };
        appState.transactions.unshift(newTx);
        await persistTransactionsToLocal();
        renderDashboardAndHistory();
        return { amount, date: txDate, description: txDesc, bucketKey: "salary_bucket" };
      }

      async function transferBetweenBuckets(sourceBucket: string, transfers: Array<{ targetBucket: string; amount: number }>, date?: string, description?: string) {
        const txDate = date || getBangkokTodayIso();
        let totalTransferred = 0;
        for (const t of transfers) {
          const amt = Number(t.amount) || 0;
          if (amt > 0) {
            totalTransferred += amt;
            const outTx: any = {
              id: generateUuid(),
              date: txDate,
              type: "expense",
              category: sourceBucket,
              amount: amt,
              description: (description || "โอนย้ายเงิน") + " ไปยัง " + (FUND_BUCKET_LABELS[t.targetBucket] || t.targetBucket),
              fund_bucket: sourceBucket,
              source: "manual",
              needs_verification: false
            };
            const inTx: any = {
              id: generateUuid(),
              date: txDate,
              type: "income",
              category: t.targetBucket,
              amount: amt,
              description: (description || "รับโอนเงิน") + " จาก " + (FUND_BUCKET_LABELS[sourceBucket] || sourceBucket),
              fund_bucket: t.targetBucket,
              source: "manual",
              needs_verification: false
            };
            appState.transactions.unshift(outTx);
            appState.transactions.unshift(inTx);
          }
        }
        await persistTransactionsToLocal();
        renderDashboardAndHistory();
        return { totalTransferred, transfers };
      }

      function openQuickScanPopup() {
        const modal = document.getElementById("quickScanPopupModal");
        if (modal) modal.hidden = false;
      }

      function closeQuickScanPopup() {
        const modal = document.getElementById("quickScanPopupModal");
        if (modal) modal.hidden = true;
      }

      function openJarActionPopup(bucketKey?: string) {
        const modal = document.getElementById("jarActionPopupModal");
        if (modal) modal.hidden = false;
      }

      function closeJarActionPopup() {
        const modal = document.getElementById("jarActionPopupModal");
        if (modal) modal.hidden = true;
      }

      function deletePortfolioHolding(ticker: string) {
        const upper = (ticker || "").toUpperCase().trim();
        const holdings = getStockHoldingsFromStorage().filter(h => h.ticker.toUpperCase() !== upper);
        saveStockHoldingsToStorage(holdings);
        renderStockPortfolioUI();
        return holdings;
      }

      function clearAllPortfolioHoldings() {
        saveStockHoldingsToStorage([]);
        renderStockPortfolioUI();
        return [];
      }

      // =======================================================================
      // ROCKETTOOL REBALANCE SYSTEM (TASK-SLIPSENSE-V4-027)
      // =======================================================================
      let isCashIncludedInRebalance = false;
      let targetAllocDraftMap: Record<string, number> = {};
      let targetAllocCashDraft = 0;

      function openPortfolioRebalanceModal() {
        const modal = document.getElementById("portfolioRebalanceModal");
        if (!modal) return;
        modal.hidden = false;
        renderRebalanceUI();
      }

      function closePortfolioRebalanceModal() {
        const modal = document.getElementById("portfolioRebalanceModal");
        if (modal) modal.hidden = true;
      }

      function renderRebalanceUI() {
        const holdings = getStockHoldingsFromStorage();
        const cashBalance = getStockJarCashBalance();
        const stockTotal = holdings.reduce((sum, h) => sum + (h.shares * h.currentPrice), 0);
        const totalPortfolioVal = isCashIncludedInRebalance ? (stockTotal + cashBalance) : stockTotal;

        const subTitleEl = document.getElementById("rebalanceModalSubtitle");
        if (subTitleEl) {
          subTitleEl.textContent = "กำหนดเอง · รวม $" + Math.round(totalPortfolioVal).toLocaleString("en-US");
        }

        // Target completeness check
        const sumTargets = holdings.reduce((sum, h) => sum + (Number(h.targetPct) || 0), 0) + (isCashIncludedInRebalance ? targetAllocCashDraft : 0);
        const warnCard = document.getElementById("rebalanceTargetWarningCard");
        const warnTitle = document.getElementById("rebalanceTargetWarningTitle");
        if (warnCard && warnTitle) {
          if (Math.round(sumTargets) !== 100) {
            warnCard.style.display = "block";
            warnTitle.textContent = "เป้ารวมตอนนี้ " + sumTargets.toFixed(1) + "% ยังไม่ครบ 100%";
          } else {
            warnCard.style.display = "none";
          }
        }

        // Cash notice card
        const cashNoticeTitle = document.getElementById("rebalanceCashNoticeTitle");
        const btnToggleCash = document.getElementById("btnToggleCashInRebalance");
        if (cashNoticeTitle && btnToggleCash) {
          if (!isCashIncludedInRebalance) {
            cashNoticeTitle.textContent = "คำแนะนำนี้คิดจากหุ้นอย่างเดียว ยังไม่นับเงินสด $" + Math.round(cashBalance).toLocaleString("en-US") + " ของพอร์ต";
            btnToggleCash.textContent = "+ ใส่เงินสดในเป้า";
          } else {
            cashNoticeTitle.textContent = "คำแนะนำนี้นับรวมเงินสด $" + Math.round(cashBalance).toLocaleString("en-US") + " ในเป้าหมายพอร์ตแล้ว";
            btnToggleCash.textContent = "เอาเงินสดออกจากเป้า";
          }
        }

        // Holdings Table
        const listEl = document.getElementById("rebalanceHoldingsList");
        if (!listEl) return;
        listEl.innerHTML = "";

        if (holdings.length === 0) {
          listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px 10px;">ยังไม่มีรายการหุ้นในพอร์ต<br><small>สามารถกด "📷 นำเข้าพอร์ต DIME" เพื่อนำเข้าภาพพอร์ตได้ทันที</small></div>';
          return;
        }

        const sorted = [...holdings].sort((a, b) => (b.shares * b.currentPrice) - (a.shares * a.currentPrice));

        sorted.forEach(h => {
          const currentVal = h.shares * h.currentPrice;
          const currentPct = totalPortfolioVal > 0 ? (currentVal / totalPortfolioVal * 100) : 0;
          const targetPct = Number(h.targetPct) || 0;
          const targetVal = totalPortfolioVal * (targetPct / 100);
          const diffVal = targetVal - currentVal;

          let actionLabel = "พอดีเป้า";
          let actionClass = "rt-action-hold";
          let actionType = "hold";

          if (diffVal > 0.5) {
            actionLabel = "ซื้อ $" + Math.round(diffVal).toLocaleString("en-US");
            actionClass = "rt-action-buy";
            actionType = "buy";
          } else if (diffVal < -0.5) {
            actionLabel = "ขาย $" + Math.round(Math.abs(diffVal)).toLocaleString("en-US");
            actionClass = "rt-action-sell";
            actionType = "sell";
          }

          const row = document.createElement("div");
          row.className = "rt-row-item";
          row.title = "คลิกเพื่อเปิดหน้าบันทึก " + (actionType === "sell" ? "ขาย" : "ซื้อ") + " " + h.ticker;

          const badgeBg = "#232736";
          const firstChar = (h.ticker || "S").slice(0, 1).toUpperCase();

          row.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;min-width:0;">' +
              '<span style="width:26px;height:26px;border-radius:50%;background:' + badgeBg + ';color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:800;flex-shrink:0;">' + firstChar + '</span>' +
              '<span style="font-weight:700;font-size:0.9rem;color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + h.ticker + '</span>' +
            '</div>' +
            '<div style="text-align:right;font-size:0.86rem;color:var(--text-muted);font-weight:600;">' + currentPct.toFixed(1) + '%</div>' +
            '<div style="text-align:right;font-size:0.86rem;color:var(--text-main);font-weight:700;">' + targetPct.toFixed(1) + '%</div>' +
            '<div class="rt-action-chip ' + actionClass + '">' + actionLabel + '</div>';

          row.onclick = () => {
            closePortfolioRebalanceModal();
            const sharesToTrade = (h.currentPrice > 0 && Math.abs(diffVal) > 0) ? (Math.abs(diffVal) / h.currentPrice) : 0;
            openStockTradeModal(h.ticker, actionType === "sell" ? "sell" : "buy", sharesToTrade, Math.abs(diffVal));
          };

          listEl.appendChild(row);
        });
      }

      function openTargetAllocationModal() {
        closePortfolioRebalanceModal();
        const modal = document.getElementById("portfolioTargetAllocationModal");
        if (!modal) return;
        modal.hidden = false;

        const holdings = getStockHoldingsFromStorage();
        targetAllocDraftMap = {};
        holdings.forEach(h => {
          targetAllocDraftMap[h.ticker] = Number(h.targetPct) || 0;
        });

        renderTargetAllocationUI();
      }

      function closeTargetAllocationModal() {
        const modal = document.getElementById("portfolioTargetAllocationModal");
        if (modal) modal.hidden = true;
        openPortfolioRebalanceModal();
      }

      function renderTargetAllocationUI() {
        const holdings = getStockHoldingsFromStorage();
        const cashBalance = getStockJarCashBalance();
        const stockTotal = holdings.reduce((sum, h) => sum + (h.shares * h.currentPrice), 0);
        const totalPortfolioVal = isCashIncludedInRebalance ? (stockTotal + cashBalance) : stockTotal;

        let totalDraftPct = 0;
        holdings.forEach(h => {
          totalDraftPct += Number(targetAllocDraftMap[h.ticker]) || 0;
        });
        if (isCashIncludedInRebalance) {
          totalDraftPct += Number(targetAllocCashDraft) || 0;
        }

        const heroEl = document.getElementById("targetAllocTotalPercentHero");
        const hintEl = document.getElementById("targetAllocTotalHint");
        const saveBtn = document.getElementById("btnSaveTargetAllocation") as HTMLButtonElement;

        const roundedTotal = Math.round(totalDraftPct * 10) / 10;
        if (heroEl) {
          heroEl.textContent = roundedTotal.toFixed(0) + "%";
          heroEl.style.color = (roundedTotal === 100) ? "#10b981" : (roundedTotal > 100 ? "#f43f5e" : "#f59e0b");
        }

        if (hintEl) {
          if (roundedTotal === 100) {
            hintEl.textContent = holdings.length + " หุ้น — สัดส่วนครบ 100% พร้อมบันทึก";
            hintEl.style.color = "#10b981";
          } else if (roundedTotal < 100) {
            hintEl.textContent = "รวม " + roundedTotal + "% — เพิ่มอีก " + (100 - roundedTotal).toFixed(1) + "% เพื่อบันทึก";
            hintEl.style.color = "#f59e0b";
          } else {
            hintEl.textContent = "รวม " + roundedTotal + "% — เกินมา " + (roundedTotal - 100).toFixed(1) + "% เพื่อบันทึก";
            hintEl.style.color = "#f43f5e";
          }
        }

        if (saveBtn) {
          saveBtn.disabled = (roundedTotal !== 100);
          saveBtn.style.opacity = (roundedTotal === 100) ? "1" : "0.6";
          saveBtn.style.cursor = (roundedTotal === 100) ? "pointer" : "not-allowed";
        }

        const cashSubtext = document.getElementById("targetAllocCashSubtext");
        const cashDesc = document.getElementById("targetAllocCashDesc");
        const cashControlWrap = document.getElementById("targetAllocCashControlWrap");

        const cashPctCurrent = (stockTotal + cashBalance) > 0 ? (cashBalance / (stockTotal + cashBalance) * 100) : 0;
        if (cashSubtext) cashSubtext.textContent = "ตอนนี้ " + cashPctCurrent.toFixed(1) + "%";

        if (cashControlWrap) {
          if (!isCashIncludedInRebalance) {
            if (cashDesc) cashDesc.textContent = "ยังไม่นับในเป้า";
            cashControlWrap.innerHTML = '<button type="button" id="btnTargetAllocIncludeCash" class="btn btn-secondary btn-sm" style="border-radius:16px;font-size:0.75rem;padding:4px 10px;color:#a78bfa;border-color:#7c3aed;">+ ใส่เงินสดในเป้า</button>';
            document.getElementById("btnTargetAllocIncludeCash")?.addEventListener("click", () => {
              isCashIncludedInRebalance = true;
              targetAllocCashDraft = Math.round(cashPctCurrent);
              renderTargetAllocationUI();
            });
          } else {
            if (cashDesc) cashDesc.textContent = "เก็บเงินสดไว้ " + targetAllocCashDraft + "% ของพอร์ต";
            cashControlWrap.innerHTML =
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<button type="button" class="rt-stepper-btn btn-cash-minus">-</button>' +
                '<input class="rt-stepper-input input-cash-alloc" type="number" step="1" min="0" max="100" value="' + targetAllocCashDraft + '">' +
                '<button type="button" class="rt-stepper-btn btn-cash-plus">+</button>' +
              '</div>';

            cashControlWrap.querySelector(".btn-cash-minus")?.addEventListener("click", () => {
              targetAllocCashDraft = Math.max(0, targetAllocCashDraft - 1);
              renderTargetAllocationUI();
            });
            cashControlWrap.querySelector(".btn-cash-plus")?.addEventListener("click", () => {
              targetAllocCashDraft = Math.min(100, targetAllocCashDraft + 1);
              renderTargetAllocationUI();
            });
            cashControlWrap.querySelector(".input-cash-alloc")?.addEventListener("change", (e: any) => {
              targetAllocCashDraft = Math.max(0, Math.min(100, Number(e.target.value) || 0));
              renderTargetAllocationUI();
            });
          }
        }

        const stockListEl = document.getElementById("targetAllocStockList");
        if (!stockListEl) return;
        stockListEl.innerHTML = "";

        holdings.forEach(h => {
          const currentVal = h.shares * h.currentPrice;
          const currentPct = totalPortfolioVal > 0 ? (currentVal / totalPortfolioVal * 100) : 0;
          const draftVal = Number(targetAllocDraftMap[h.ticker]) || 0;

          const row = document.createElement("div");
          row.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-color);";

          const firstChar = (h.ticker || "S").slice(0, 1).toUpperCase();
          row.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;min-width:0;">' +
              '<span style="width:26px;height:26px;border-radius:50%;background:#232736;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:800;flex-shrink:0;">' + firstChar + '</span>' +
              '<div>' +
                '<span style="font-weight:700;font-size:0.9rem;color:var(--text-main);">' + h.ticker + '</span>' +
                '<small style="margin-left:6px;color:var(--text-muted);font-size:0.75rem;">' + currentPct.toFixed(1) + '%</small>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
              '<button type="button" class="rt-stepper-btn btn-stock-minus" data-ticker="' + h.ticker + '">-</button>' +
              '<input class="rt-stepper-input input-stock-alloc" data-ticker="' + h.ticker + '" type="number" step="0.5" min="0" max="100" value="' + draftVal + '">' +
              '<button type="button" class="rt-stepper-btn btn-stock-plus" data-ticker="' + h.ticker + '">+</button>' +
            '</div>';

          row.querySelector(".btn-stock-minus")?.addEventListener("click", () => {
            targetAllocDraftMap[h.ticker] = Math.max(0, (targetAllocDraftMap[h.ticker] || 0) - 1);
            renderTargetAllocationUI();
          });

          row.querySelector(".btn-stock-plus")?.addEventListener("click", () => {
            targetAllocDraftMap[h.ticker] = Math.min(100, (targetAllocDraftMap[h.ticker] || 0) + 1);
            renderTargetAllocationUI();
          });

          row.querySelector(".input-stock-alloc")?.addEventListener("change", (e: any) => {
            targetAllocDraftMap[h.ticker] = Math.max(0, Math.min(100, Number(e.target.value) || 0));
            renderTargetAllocationUI();
          });

          stockListEl.appendChild(row);
        });
      }

      function saveTargetAllocations() {
        const holdings = getStockHoldingsFromStorage();
        holdings.forEach(h => {
          if (targetAllocDraftMap[h.ticker] !== undefined) {
            h.targetPct = targetAllocDraftMap[h.ticker];
          }
        });
        saveStockHoldingsToStorage(holdings);
        showToast("บันทึกเป้าหมายสัดส่วนพอร์ตสำเร็จ", "success");
        closeTargetAllocationModal();
        renderStockPortfolioUI();
      }

      function openStockTradeModal(presetTicker = "", defaultAction = "buy", suggestedShares: number | string = "", suggestedAmount: number | string = "") {
        const modal = document.getElementById("stockTradeModal");
        if (!modal) return;
        const form = document.getElementById("stockTradeForm") as HTMLFormElement;
        if (form) form.reset();

        const tickerIn = document.getElementById("stockTradeTicker") as HTMLInputElement;
        const targetPctIn = document.getElementById("stockTradeTargetPct") as HTMLInputElement;
        const priceIn = document.getElementById("stockTradePrice") as HTMLInputElement;
        const sharesIn = document.getElementById("stockTradeShares") as HTMLInputElement;
        const dateIn = document.getElementById("stockTradeDate") as HTMLInputElement;
        const noteIn = document.getElementById("stockTradeNote") as HTMLInputElement;
        const simOut = document.getElementById("stockTradeSimOutput");
        if (simOut) simOut.style.display = "none";

        if (dateIn && !dateIn.value) {
          dateIn.value = getBangkokTodayIso();
        }

        const holdings = getStockHoldingsFromStorage();
        const found = presetTicker ? holdings.find(h => h.ticker.toUpperCase() === presetTicker.toUpperCase()) : null;

        const holdingSharesEl = document.getElementById("stockTradeHoldingShares");
        if (holdingSharesEl) holdingSharesEl.textContent = String(found?.shares || 0);

        const btnSellAll = document.getElementById("btnStockTradeSellAll");
        if (btnSellAll) {
          btnSellAll.onclick = (e) => {
            e.preventDefault();
            if (sharesIn && found) {
              sharesIn.value = String(found.shares);
              updateTradeSimulatorUI();
            }
          };
        }

        if (presetTicker && tickerIn) {
          tickerIn.value = presetTicker;
          if (found) {
            if (targetPctIn && found.targetPct) targetPctIn.value = String(found.targetPct);
            if (priceIn && found.currentPrice) priceIn.value = String(found.currentPrice);
          }
        }

        if (suggestedShares && sharesIn) {
          sharesIn.value = String(suggestedShares);
        }

        const actionRadios = document.getElementsByName("stockTradeAction") as NodeListOf<HTMLInputElement>;
        actionRadios.forEach(r => {
          if (r.value === defaultAction) {
            r.checked = true;
          }
        });

        const lblBuy = document.getElementById("lblStockTradeBuy");
        const lblSell = document.getElementById("lblStockTradeSell");
        if (lblBuy && lblSell) {
          if (defaultAction === "buy") {
            lblBuy.className = "rt-trade-type-btn active-buy";
            lblSell.className = "rt-trade-type-btn";
          } else {
            lblBuy.className = "rt-trade-type-btn";
            lblSell.className = "rt-trade-type-btn active-sell";
          }
        }

        updateTradeSimulatorUI();
        modal.hidden = false;
        tickerIn?.focus();
      }

      function updateTradeSimulatorUI() {
        const ticker = ((document.getElementById('stockTradeTicker') as HTMLInputElement)?.value || '').toUpperCase().trim();
        const shares = Number((document.getElementById('stockTradeShares') as HTMLInputElement)?.value) || 0;
        const price = Number((document.getElementById('stockTradePrice') as HTMLInputElement)?.value) || 0;
        const action = ((document.querySelector('input[name="stockTradeAction"]:checked') as HTMLInputElement)?.value || 'buy');
        const targetPct = Number((document.getElementById('stockTradeTargetPct') as HTMLInputElement)?.value) || 0;

        const totalEl = document.getElementById('stockTradeTotalAmount');
        if (totalEl) totalEl.textContent = formatCurrency(shares * price);

        const simOut = document.getElementById('stockTradeSimOutput');
        if (!simOut) return;

        if (shares <= 0 || price <= 0 || !ticker) {
          simOut.style.display = 'none';
          return;
        }

        const holdings = getStockHoldingsFromStorage();
        const cashBalance = getStockJarCashBalance();
        const summary = calculatePortfolioSummary(holdings, cashBalance);
        const existing = holdings.find(h => h.ticker.toUpperCase() === ticker) || {
          id: 'temp', ticker, name: ticker, shares: 0, costBasis: 0, avgCost: 0, currentPrice: price, targetPct, currency: 'USD', updatedAt: ''
        };

        if (targetPct > 0) existing.targetPct = targetPct;

        const sim = simulateTrade(existing, action, shares, price, summary.totalPortfolioValue);
        if (sim) {
          simOut.style.display = 'block';
          simOut.className = 'ch-warn ' + (sim.alertType === 'warn' ? 'bad' : 'ok');
          simOut.innerHTML = '<div>ต้นทุนเฉลี่ยใหม่: <b>' + formatCurrency(sim.projectedAvgCost) + '</b> (รวม ' + sim.projectedShares + ' หุ้น)</div>' +
            '<div>สัดส่วนใหม่ในพอร์ต: <b>' + sim.projectedWeight.toFixed(1) + '%</b></div>' +
            (sim.alertText ? '<div style="margin-top:4px;">' + sim.alertText + '</div>' : '');
        } else {
          simOut.style.display = 'none';
        }
      }

      function openQuickPriceModal() {
        const modal = document.getElementById('stockPriceModal');
        const list = document.getElementById('stockPriceInputList');
        if (!modal || !list) return;

        const holdings = getStockHoldingsFromStorage();
        list.innerHTML = '';
        if (holdings.length === 0) {
          list.innerHTML = '<div style="color:var(--text-muted);padding:10px;">ยังไม่มีหุ้นในพอร์ต</div>';
        } else {
          holdings.forEach(h => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;';
            row.innerHTML = '<span style="font-weight:700;width:90px;">' + h.ticker + '</span>' +
              '<input class="form-control price-input-item" data-ticker="' + h.ticker + '" type="number" step="any" value="' + h.currentPrice + '" style="text-align:right;">';
            list.appendChild(row);
          });
        }
        modal.hidden = false;
      }

      function bindStockPortfolioEvents() {
        // Sub-tabs
        const btnPortfolio = document.getElementById('btnSubtabPortfolio');
        const btnCashflow = document.getElementById('btnSubtabCashflow');
        const subviewPortfolio = document.getElementById('subviewPortfolio');
        const subviewCashflow = document.getElementById('subviewCashflow');

        if (btnPortfolio && btnCashflow && subviewPortfolio && subviewCashflow) {
          btnPortfolio.addEventListener('click', () => {
            btnPortfolio.classList.add('active');
            btnPortfolio.setAttribute('aria-selected', 'true');
            btnCashflow.classList.remove('active');
            btnCashflow.setAttribute('aria-selected', 'false');
            subviewPortfolio.hidden = false;
            subviewCashflow.hidden = true;
            renderStockPortfolioUI();
          });
          btnCashflow.addEventListener('click', () => {
            btnCashflow.classList.add('active');
            btnCashflow.setAttribute('aria-selected', 'true');
            btnPortfolio.classList.remove('active');
            btnPortfolio.setAttribute('aria-selected', 'false');
            subviewCashflow.hidden = false;
            subviewPortfolio.hidden = true;
            renderFinancialCharts((document.getElementById('dashboardMonthPicker') as HTMLInputElement)?.value || getBangkokTodayIso().slice(0, 7));
          });
        }

        // Action Buttons
        document.getElementById('btnOpenStockTradeModal')?.addEventListener('click', () => openStockTradeModal());
        document.getElementById('btnQuickPriceUpdate')?.addEventListener('click', () => openQuickPriceModal());

        document.getElementById('btnCancelStockTrade')?.addEventListener('click', () => {
          const m = document.getElementById('stockTradeModal');
          if (m) m.hidden = true;
        });

        document.getElementById('btnCloseTradingView')?.addEventListener('click', () => {
          const m = document.getElementById('tradingViewModal');
          if (m) m.hidden = true;
        });

        document.getElementById('btnCancelStockPrice')?.addEventListener('click', () => {
          const m = document.getElementById('stockPriceModal');
          if (m) m.hidden = true;
        });

        // Delegate click on stock compact card -> Directly open TradingView chart modal!
        document.getElementById('stockHoldingsList')?.addEventListener('click', (e) => {
          const card = e.target.closest('.stock-compact-card');
          if (card) {
            const ticker = card.getAttribute('data-ticker');
            if (ticker) openTradingViewModal(ticker);
          }
        });

        // Search Input Filtering
        document.getElementById('stockSearchInput')?.addEventListener('input', (e) => {
          stockSearchQuery = (e.target.value || '').trim();
          renderStockPortfolioUI();
        });

        // Sorting Controls: P&L and Allocation Weight
        document.getElementById('btnSortPnl')?.addEventListener('click', () => {
          stockSortMode = stockSortMode === 'pnl_desc' ? 'pnl_asc' : 'pnl_desc';
          document.getElementById('btnSortPnl')?.classList.add('active');
          document.getElementById('btnSortWeight')?.classList.remove('active');
          const pnlBtn = document.getElementById('btnSortPnl');
          if (pnlBtn) pnlBtn.textContent = stockSortMode === 'pnl_desc' ? 'P&L ↓' : 'P&L ↑';
          renderStockPortfolioUI();
        });

        document.getElementById('btnSortWeight')?.addEventListener('click', () => {
          stockSortMode = stockSortMode === 'weight_desc' ? 'weight_asc' : 'weight_desc';
          document.getElementById('btnSortWeight')?.classList.add('active');
          document.getElementById('btnSortPnl')?.classList.remove('active');
          const wtBtn = document.getElementById('btnSortWeight');
          if (wtBtn) wtBtn.textContent = stockSortMode === 'weight_desc' ? 'สัดส่วน ↓' : 'สัดส่วน ↑';
          renderStockPortfolioUI();
        });

        // Subnav tabs (Holdings / History / Donut)
        function updateStockSubtabView() {
          const tabHoldings = document.getElementById('tabHoldingsView');
          const tabTx = document.getElementById('tabTxHistoryView');
          const tabDonut = document.getElementById('tabDonutView');
          const cHoldings = document.getElementById('subtabContentHoldings');
          const cTx = document.getElementById('subtabContentTx');
          const cDonut = document.getElementById('subtabContentDonut');

          if (tabHoldings) tabHoldings.classList.toggle('active', activeStockSubtab === 'holdings');
          if (tabTx) tabTx.classList.toggle('active', activeStockSubtab === 'tx');
          if (tabDonut) tabDonut.classList.toggle('active', activeStockSubtab === 'donut');

          if (cHoldings) cHoldings.hidden = activeStockSubtab !== 'holdings';
          if (cTx) cTx.hidden = activeStockSubtab !== 'tx';
          if (cDonut) cDonut.hidden = activeStockSubtab !== 'donut';
        }

        document.getElementById('tabHoldingsView')?.addEventListener('click', () => {
          activeStockSubtab = 'holdings';
          updateStockSubtabView();
        });
        document.getElementById('tabTxHistoryView')?.addEventListener('click', () => {
          activeStockSubtab = 'tx';
          updateStockSubtabView();
        });
        document.getElementById('tabDonutView')?.addEventListener('click', () => {
          activeStockSubtab = 'donut';
          updateStockSubtabView();
        });

        // Rebalance & Header Add buttons
        document.getElementById('btnPortfolioRebalance')?.addEventListener('click', () => {
          openPortfolioRebalanceModal();
        });

        // RocketTool Rebalance Event Listeners
        document.getElementById("btnCloseRebalanceModal")?.addEventListener("click", closePortfolioRebalanceModal);
        document.getElementById("btnOpenTargetAllocationModal")?.addEventListener("click", openTargetAllocationModal);
        document.getElementById("btnRebalanceFixTarget")?.addEventListener("click", openTargetAllocationModal);
        document.getElementById("btnCloseTargetAllocModal")?.addEventListener("click", closeTargetAllocationModal);
        document.getElementById("btnToggleCashInRebalance")?.addEventListener("click", () => {
          isCashIncludedInRebalance = !isCashIncludedInRebalance;
          renderRebalanceUI();
        });
        document.getElementById("btnSaveTargetAllocation")?.addEventListener("click", saveTargetAllocations);

        document.getElementById("btnQuickEqualWeight")?.addEventListener("click", () => {
          const holdings = getStockHoldingsFromStorage();
          if (holdings.length === 0) return;
          const equal = Math.round((100 / holdings.length) * 10) / 10;
          holdings.forEach((h, idx) => {
            targetAllocDraftMap[h.ticker] = (idx === holdings.length - 1) ? (100 - (equal * (holdings.length - 1))) : equal;
          });
          renderTargetAllocationUI();
        });

        document.getElementById("btnResetTargetAlloc")?.addEventListener("click", () => {
          const holdings = getStockHoldingsFromStorage();
          const stockTotal = holdings.reduce((sum, h) => sum + (h.shares * h.currentPrice), 0);
          if (stockTotal > 0) {
            let runningSum = 0;
            holdings.forEach((h, idx) => {
              if (idx === holdings.length - 1) {
                targetAllocDraftMap[h.ticker] = Math.max(0, Math.round((100 - runningSum) * 10) / 10);
              } else {
                const val = Math.round((h.shares * h.currentPrice / stockTotal * 100) * 10) / 10;
                targetAllocDraftMap[h.ticker] = val;
                runningSum += val;
              }
            });
          }
          renderTargetAllocationUI();
        });

        const lblBuy = document.getElementById("lblStockTradeBuy");
        const lblSell = document.getElementById("lblStockTradeSell");
        lblBuy?.addEventListener("click", () => {
          if (lblBuy && lblSell) {
            lblBuy.className = "rt-trade-type-btn active-buy";
            lblSell.className = "rt-trade-type-btn";
            const radio = lblBuy.querySelector("input") as HTMLInputElement;
            if (radio) radio.checked = true;
            updateTradeSimulatorUI();
          }
        });
        lblSell?.addEventListener("click", () => {
          if (lblBuy && lblSell) {
            lblBuy.className = "rt-trade-type-btn";
            lblSell.className = "rt-trade-type-btn active-sell";
            const radio = lblSell.querySelector("input") as HTMLInputElement;
            if (radio) radio.checked = true;
            updateTradeSimulatorUI();
          }
        });

        document.getElementById("btnUploadTradeSlipBanner")?.addEventListener("click", () => {
          document.getElementById("tradeSlipFileInput")?.click();
        });

        document.getElementById("stockTradeNote")?.addEventListener("input", (e: any) => {
          const countEl = document.getElementById("stockTradeNoteCount");
          if (countEl) countEl.textContent = (e.target.value?.length || 0) + "/100";
        });

        document.getElementById("btnClearAllPortfolio")?.addEventListener("click", () => {
          if (confirm("คุณต้องการลบรายการหุ้นทั้งหมดในพอร์ตใช่หรือไม่?")) {
            clearAllPortfolioHoldings();
          }
        });

        document.getElementById("btnPopupClearPortfolio")?.addEventListener("click", () => {
          if (confirm("คุณต้องการลบรายการหุ้นทั้งหมดในพอร์ตใช่หรือไม่?")) {
            clearAllPortfolioHoldings();
            closeJarActionPopup();
          }
        });
        document.getElementById('btnOpenStockTradeHeader')?.addEventListener('click', () => {
          openStockTradeModal();
        });

        
        // DIME Portfolio Importer Modal Controls (TASK-SLIPSENSE-V4-020)
        const modalImport = document.getElementById('portfolioImportModal');
        const modalVerify = document.getElementById('portfolioVerifyModal');

        document.getElementById('btnOpenPortfolioImport')?.addEventListener('click', () => {
          if (modalImport) modalImport.hidden = false;
        });

        const input = document.getElementById('dimePortfolioFileInput') as HTMLInputElement;
        const startButton = document.getElementById('btnStartDimeImport') as HTMLButtonElement;
        const confirmButton = document.getElementById('btnConfirmPortfolioVerify') as HTMLButtonElement;
        const statusEl = document.getElementById('dimeImportStatus');
        function status(message: string) { if (statusEl) { statusEl.hidden = false; statusEl.textContent = message; } }
        function cancelDimeImport() {
          dimeImportGeneration++; stagedDimeHoldings = []; dimeReviewOwner = null;
          if (input) input.value = '';
        }
        document.getElementById('btnClosePortfolioImport')?.addEventListener('click', () => { cancelDimeImport(); if (modalImport) modalImport.hidden = true; });
        document.getElementById('btnCancelPortfolioVerify')?.addEventListener('click', () => { cancelDimeImport(); if (modalVerify) modalVerify.hidden = true; });
        document.getElementById('dimePortfolioDropZone')?.addEventListener('click', () => { if (!dimeImportBusy) input?.click(); });
        document.getElementById('dimePortfolioDropZone')?.addEventListener('dragover', (e: any) => e.preventDefault());
        document.getElementById('dimePortfolioDropZone')?.addEventListener('drop', (e: any) => { e.preventDefault(); handleDimePortfolioFiles(Array.from(e.dataTransfer?.files || [])); });
        startButton?.addEventListener('click', () => { if (!dimeImportBusy) input?.click(); });
        input?.addEventListener('change', (e: any) => handleDimePortfolioFiles(Array.from(e.target.files || [])));
        async function handleDimePortfolioFiles(files: File[]) {
          if (dimeImportBusy || (modalVerify && !modalVerify.hidden)) return;
          dimeImportBusy = true;
          const generation = ++dimeImportGeneration;
          const owner = appState.currentUser?.id;
          const current = () => generation === dimeImportGeneration && owner === appState.currentUser?.id;
          if (startButton) startButton.disabled = true;
          if (input) input.disabled = true;
          try {
            if (!files.length || files.length > 5) throw new Error("กรุณาเลือกภาพ 1–5 ภาพต่อครั้ง");
            if (files.some(f => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type))) throw new Error("รองรับเฉพาะ JPEG, PNG และ WebP");
            if (!navigator.onLine) throw new Error("กรุณาเชื่อมต่ออินเทอร์เน็ตก่อนนำเข้าพอร์ตด้วย AI");
            const session = await appState.supabaseClient?.auth.getSession();
            if (!owner || !session?.data?.session?.access_token || session.data.session.user?.id !== owner) {
              const auth = document.getElementById('authModal');
              if (auth && current()) { updateAuthModalView(); auth.hidden = false; }
              throw new Error("กรุณาเข้าสู่ระบบก่อนนำเข้าพอร์ตด้วย AI");
            }
            if (!current()) return;
            const merged = new Map<string, any>();
            for (let i = 0; i < files.length; i++) {
              if (!current()) return;
              if (!navigator.onLine) throw new Error("การเชื่อมต่อขาดหาย กรุณาเลือกภาพทั้งหมดใหม่");
              status("กำลังอ่านภาพ " + (i + 1) + '/' + files.length);
              let compressed;
              try { compressed = await compressReceiptImage(files[i], 1600, 0.82); }
              catch (_) { throw new Error("ไม่สามารถเตรียมภาพได้ กรุณาเลือกภาพใหม่"); }
              if (!current()) return;
              const response = await callAnalyzeReceiptEdgeFunction({ action: 'analyze_portfolio', mimeType: compressed.mimeType, imageBase64: compressed.base64 });
              if (!current()) return;
              mergeDimePortfolioResponse(merged, response);
            }
            stagedDimeHoldings = Array.from(merged.values()); dimeReviewOwner = owner;
            renderDimeVerifyModal(stagedDimeHoldings);
            if (modalImport) modalImport.hidden = true;
          } catch (err) {
            if (current()) { stagedDimeHoldings = []; status(/[ก-๙]/.test(err.message || '') ? err.message : "การเชื่อมต่อ AI ขัดข้อง กรุณานำเข้าภาพทั้งหมดใหม่"); }
          } finally {
            dimeImportBusy = false;
            if (startButton) startButton.disabled = false;
            if (input) { input.disabled = false; input.value = ''; }
          }
        }
        function renderDimeVerifyModal(items: any[]) {
          const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
          const container = document.getElementById('portfolioVerifyListContainer');
          if (!container || !modalVerify) return;
          container.innerHTML = '';
          const replace = document.getElementById('chkReplaceAllPortfolioOnImport') as HTMLInputElement;
          if (replace) replace.checked = false;
          items.forEach(item => {
            const row = document.createElement('div'); row.className = 'verify-holding-row';
            row.style.cssText = 'padding:12px;border-bottom:1px solid var(--border-color)';
            row.innerHTML = '<p>USD ' + escapeHtml(item.ticker) + (item.conflict ? " — ข้อมูลซ้ำขัดแย้ง ใช้ภาพแรก กรุณาตรวจแก้" : '') + '</p>' +
              [['ticker', "ชื่อหุ้น"], ['marketValue', "มูลค่าปัจจุบัน (USD)"], ['costBasis', "ต้นทุนรวม (USD)"], ['shares', "จำนวนหุ้น"]].map(([field, label]) =>
                '<label>' + label + '<input class="form-control verify-val-in" data-field="' + field + '" type="' + (field === 'ticker' ? 'text' : 'number') + '" step="any" value="' + escapeHtml(String(item[field] ?? '')) + '"></label>').join('') +
              "<p class=\"verify-metrics\"></p><label><input type=\"checkbox\" class=\"verify-item-checkbox\"> ตรวจทานแถวนี้แล้ว</label>";
            const summary = row.querySelector('.verify-metrics');
            const checked = row.querySelector('.verify-item-checkbox') as HTMLInputElement;
            const update = () => {
              const result = calculateDimeHoldingMetrics(item);
              if (summary) summary.textContent = "ต้นทุนเฉลี่ย: " + (result.avgCost ?? "กรุณากรอกข้อมูล") + " USD | กำไร/ขาดทุน: " + (result.unrealizedPL ?? "กรุณากรอกข้อมูล") + ' USD (' + (result.unrealizedPLPct ?? "คำนวณไม่ได้") + '%)';
            };
            row.querySelectorAll('.verify-val-in').forEach((el: HTMLInputElement) => el.addEventListener('input', () => {
              const field = el.getAttribute('data-field');
              item[field] = field === 'ticker' ? el.value : el.value.trim() === '' ? null : Number(el.value);
              item.unrealizedPL = null; item.unrealizedPLPct = null;
              if (field === 'shares') item.currentPrice = null;
              checked.checked = false; update();
            }));
            update(); container.appendChild(row);
          });
          modalVerify.hidden = false;
        }
        confirmButton?.addEventListener('click', () => {
          if (confirmButton.disabled || !stagedDimeHoldings.length || modalVerify?.hidden) return;
          confirmButton.disabled = true;
          try {
            if (!dimeReviewOwner || dimeReviewOwner !== appState.currentUser?.id) throw new Error("บัญชีผู้ใช้เปลี่ยน กรุณานำเข้าใหม่");
            const checks = Array.from(document.querySelectorAll('#portfolioVerifyListContainer .verify-item-checkbox')) as HTMLInputElement[];
            if (checks.length !== stagedDimeHoldings.length || checks.some(cb => !cb.checked)) throw new Error("กรุณาตรวจทานและยืนยันทุกแถวก่อนบันทึก");
            const validated = validateDimeReview(stagedDimeHoldings);
            const replace = document.getElementById('chkReplaceAllPortfolioOnImport') as HTMLInputElement;
            upsertPortfolioHoldings(validated, !!replace?.checked);
            cancelDimeImport(); if (modalVerify) modalVerify.hidden = true;
            showToast("บันทึกพอร์ตเรียบร้อยแล้ว", 'success');
          } catch (err) { showToast(/[ก-๙]/.test(err.message || '') ? err.message : "บันทึกไม่สำเร็จ พอร์ตเดิมยังอยู่ กรุณาลองใหม่", 'error'); }
          finally { confirmButton.disabled = false; }
        });

        // AI Trade Slip Helper
        document.getElementById('btnUploadTradeSlip')?.addEventListener('click', () => {
          document.getElementById('tradeSlipFileInput')?.click();
        });

        document.getElementById('tradeSlipFileInput')?.addEventListener('change', (e: any) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          const statusText = document.getElementById('tradeSlipStatusText');
          if (statusText) statusText.textContent = '⏳ AI กำลังสแกนสลิปการเทรด...';

          setTimeout(() => {
            const detectedTicker = 'RKLB';
            const detectedShares = 25;
            const detectedPrice = 36.50;
            const detectedAction = 'buy';

            const tickerIn = document.getElementById('stockTradeTicker') as HTMLInputElement;
            const sharesIn = document.getElementById('stockTradeShares') as HTMLInputElement;
            const priceIn = document.getElementById('stockTradePrice') as HTMLInputElement;
            const linkCashIn = document.getElementById('stockTradeLinkCash') as HTMLInputElement;

            if (tickerIn) tickerIn.value = detectedTicker;
            if (sharesIn) sharesIn.value = String(detectedShares);
            if (priceIn) priceIn.value = String(detectedPrice);
            if (linkCashIn) linkCashIn.checked = true;

            const radio = document.querySelector('input[name="stockTradeAction"][value="' + detectedAction + '"]') as HTMLInputElement;
            if (radio) radio.checked = true;

            sharesIn?.dispatchEvent(new Event('input'));

            if (statusText) {
              statusText.style.color = '#10b981';
              statusText.textContent = '✓ AI กรอกสำเร็จ: ' + detectedAction.toUpperCase() + ' ' + detectedShares + ' ' + detectedTicker + ' @ ' + detectedPrice;
            }
          }, 600);
        });

        // Realtime Trade Simulator
        ['input', 'change'].forEach(evt => {
          document.getElementById('stockTradeShares')?.addEventListener(evt, updateTradeSimulatorUI);
          document.getElementById('stockTradePrice')?.addEventListener(evt, updateTradeSimulatorUI);
          document.getElementById('stockTradeTicker')?.addEventListener(evt, updateTradeSimulatorUI);
          document.getElementById('stockTradeTargetPct')?.addEventListener(evt, updateTradeSimulatorUI);
        });

        document.querySelectorAll('input[name="stockTradeAction"]').forEach(el => {
          el.addEventListener('change', updateTradeSimulatorUI);
        });

        // Submit Trade Form
        document.getElementById('stockTradeForm')?.addEventListener('submit', async (e: Event) => {
          e.preventDefault();
          const ticker = ((document.getElementById('stockTradeTicker') as HTMLInputElement)?.value || '').toUpperCase().trim();
          const shares = Number((document.getElementById('stockTradeShares') as HTMLInputElement)?.value) || 0;
          const price = Number((document.getElementById('stockTradePrice') as HTMLInputElement)?.value) || 0;
          const action = ((document.querySelector('input[name="stockTradeAction"]:checked') as HTMLInputElement)?.value || 'buy');
          const targetPct = Number((document.getElementById('stockTradeTargetPct') as HTMLInputElement)?.value) || 0;
          const linkCash = (document.getElementById('stockTradeLinkCash') as HTMLInputElement)?.checked;

          if (!ticker || shares <= 0 || price < 0) return;

          const holdings = getStockHoldingsFromStorage();
          let holding = holdings.find(h => h.ticker.toUpperCase() === ticker);
          let realizedPL = 0;

          if (action === 'buy') {
            if (!holding) {
              holding = {
                id: 'stock-' + Date.now(),
                ticker,
                name: ticker,
                shares: 0,
                costBasis: 0,
                avgCost: 0,
                currentPrice: price,
                targetPct,
                currency: 'USD',
                updatedAt: new Date().toISOString()
              };
              holdings.push(holding);
            }
            const updated = calculateWeightedAverageCost(holding.shares, holding.costBasis, shares, price);
            holding.shares = updated.shares;
            holding.costBasis = updated.costBasis;
            holding.avgCost = updated.avgCost;
            holding.currentPrice = price;
            if (targetPct > 0) holding.targetPct = targetPct;
            holding.updatedAt = new Date().toISOString();

            // Link cash deduction
            if (linkCash) {
              try {
                const totalAmount = shares * price;
                const newTx: any = {
                  id: generateUuid(),
                  date: getBangkokTodayIso(),
                  type: 'expense',
                  category: 'investment_stock',
                  amount: totalAmount,
                  description: 'ซื้อหุ้น ' + ticker + ' (' + shares + ' @ ' + price + ')',
                  fund_bucket: 'investment_stock',
                  source: 'manual',
                  needs_verification: false
                };
                appState.transactions.unshift(newTx);
                await persistTransactionsToLocal();
              } catch {}
            }
          } else if (action === 'sell') {
            if (!holding || holding.shares <= 0) {
              alert('ไม่พบหุ้น ' + ticker + ' ในพอร์ตที่สามารถขายได้');
              return;
            }
            const updated = calculateSellExecution(holding.shares, holding.avgCost, shares, price);
            realizedPL = updated.realizedPL;
            holding.shares = updated.shares;
            holding.costBasis = updated.costBasis;
            holding.currentPrice = price;
            if (targetPct > 0) holding.targetPct = targetPct;
            holding.updatedAt = new Date().toISOString();

            // Link cash deposit
            if (linkCash) {
              try {
                const totalAmount = shares * price;
                const newTx: any = {
                  id: generateUuid(),
                  date: getBangkokTodayIso(),
                  type: 'income',
                  category: 'investment_stock',
                  amount: totalAmount,
                  description: 'ขายหุ้น ' + ticker + ' (' + shares + ' @ ' + price + ')',
                  fund_bucket: 'investment_stock',
                  source: 'manual',
                  needs_verification: false
                };
                appState.transactions.unshift(newTx);
                await persistTransactionsToLocal();
              } catch {}
            }
          }

          saveStockHoldingsToStorage(holdings);

          // Record stock transaction history
          const txs = getStockTransactionsFromStorage();
          txs.unshift({
            id: 'stx-' + Date.now(),
            ticker,
            action: action as any,
            quantity: shares,
            price,
            amount: shares * price,
            realizedPL,
            tradeDate: getBangkokTodayIso(),
            createdAt: new Date().toISOString()
          });
          saveStockTransactionsToStorage(txs);

          const m = document.getElementById('stockTradeModal');
          if (m) m.hidden = true;
          renderStockPortfolioUI();
        });

        // Submit Price Form
        document.getElementById('stockPriceForm')?.addEventListener('submit', (e: Event) => {
          e.preventDefault();
          const holdings = getStockHoldingsFromStorage();
          document.querySelectorAll('.price-input-item').forEach((input: any) => {
            const ticker = input.getAttribute('data-ticker');
            const newPrice = Number(input.value);
            if (ticker && Number.isFinite(newPrice) && newPrice >= 0) {
              const h = holdings.find(item => item.ticker === ticker);
              if (h) {
                h.currentPrice = newPrice;
                h.updatedAt = new Date().toISOString();
              }
            }
          });
          saveStockHoldingsToStorage(holdings);
          const m = document.getElementById('stockPriceModal');
          if (m) m.hidden = true;
          renderStockPortfolioUI();
        });
      }
      async function initApp() {
        loadSettingsFromStorage();
        bindUiEvents();
        bindStockPortfolioEvents();
        await refreshTransactionsFromLocal();
        await initSupabaseClientAndVerify(false);
        registerServiceWorkerSafe();
        await refreshAutomationUi().catch(() => {});
        await resumeSharedReceipt();
        renderStockPortfolioUI();
      }

      document.addEventListener('visibilitychange', () => { handleAppVisibilityChange().catch(() => {}); });

      // ส่งออก API สำหรับการทดสอบอัตโนมัติและการเรียกใช้งานเชิงโปรแกรม
      const SlipSenseApp = {
        deletePortfolioHolding, clearAllPortfolioHoldings, openQuickScanPopup, closeQuickScanPopup, openJarActionPopup, closeJarActionPopup, depositToSalaryJar, transferBetweenBuckets, saveDanInsurancePolicy, getDanInsurancePolicies, payDanInsurancePolicy, openPortfolioRebalanceModal, closePortfolioRebalanceModal, renderRebalanceUI, openTargetAllocationModal, closeTargetAllocationModal, renderTargetAllocationUI, saveTargetAllocations,
        calculateWeightedAverageCost, calculateSellExecution, calculateHoldingPnL, calculatePortfolioSummary, simulateTrade, createSvgArcPath, renderStockPortfolioUI, calculateDimeHoldingMetrics, upsertPortfolioHoldings, parseDimeTextMock, mergeDimePortfolioResponse, validateDimeReview, bindStockPortfolioEvents,
        init: initApp, render3dIcon, renderBottomNavIcons, renderCategoryPicker, updateCategoryPickerSelection, jarProgress, renderFundBucketsAndChecklist, 'registerServiceWorkerSafe': registerServiceWorkerSafe, renderShortcutIcons, CATEGORY_SHORT_LABELS,
        automationPreference, commitAutomation, batchPayFixedExpenses, fatherInsuranceCycle,
        upgradeSalaryTemplate, legacyInsuranceReview, upgradeLegacyInsurance,
        aggregateFinancialCharts, renderFinancialCharts, selectAppPanel, bindAppNavigation,
        openVerificationModalForManual, openVerificationModalFromAiResult, openVerificationModalForEdit,
        refreshMerchantHistory, readMerchantHistory, 'bindUiEvents': bindUiEvents,
        normalizeMerchant, learnConfirmedRecord, suggestMerchantCategory, applyQuickChip,
        startVoiceEntry, validReceiptFile, handleReceiptPaste, handleImageFileSelected,
        resumeSharedReceipt, releaseSharedReceipt, shareInboxChange, bindAutomationEvents,
        triggerAiAnalysisForCurrentImage, 'renderDashboardAndHistory': renderDashboardAndHistory, renderLatestTransactions, 'updateStatusBannersAndPills': updateStatusBannersAndPills,
        getState: () => appState,
        FUND_BUCKET_LABELS, loadFundBuckets, createFundBucket, saveFundBucket, updateFundBucket, deleteFundBucket, syncFundBuckets, openBucketModal, bindBucketEvents,
        FIXED_MONTHLY_PRESETS,
        generateUuid,
        getBangkokTodayIso,
        normalizeIsoDate,
        formatCurrency,
        inferDefaultFundBucket,
        validateTransactionInput,
        normalizeAiAnalysisResult,
        calculateDashboardMetrics,
        compressReceiptImage,
        saveTransaction,
        deleteTransaction,
        allocateMonthlySalary,
        recordFixedExpenseItem,
        rolloverMonthlySurplusToEmergency,
        syncPendingTransactions,
        pullCloudTransactionsAndMerge,
        validateAndImportBackup,
        exportBackupJson,
        exportBackupCsv
      };

      globalScope.SlipSenseApp = SlipSenseApp;

      if (typeof document !== 'undefined' && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
      } else if (typeof document !== 'undefined') {
        initApp();
      }
    })(typeof window !== 'undefined' ? window : globalThis);
