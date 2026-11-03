'use strict';
const fs = require('fs');
const assert = require('node:assert/strict');
const { loadApp } = require('./app_harness');
module.exports = async function () {
  const html = fs.readFileSync('src/index.template.html', 'utf8');
  for (const removed of ['heroCapture', 'btnAiReceiptCallout', 'class="hero-action"']) assert(!html.includes(removed));
  assert.equal((html.match(/id="uploadDropZone"/g) || []).length, 1);
  assert.equal((html.match(/aria-labelledby="scanSectionTitle"/g) || []).length, 1);
  for (const [id, label] of [['btnStartScanCamera', '📸 ถ่ายสลิป'], ['btnChooseGallery', '🖼️ เลือกรูป'], ['btnOpenManualEntry', '✏️ จดเอง']]) {
    assert.equal(html.match(new RegExp('<button[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</button>'))[1].trim(), label);
  }
  assert.match(html, /\.camera-btn-pair \{ display:grid; grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  const shortcuts = html.match(/<div class="app-grid">([\s\S]*?)<\/div>/)[1];
  for (const label of ['กระปุก', 'กราฟ', 'ประวัติ', 'แบ่งงบ']) assert(shortcuts.includes('</span>' + label));
  for (const id of ['bucketFormName', 'bucketFormIcon', 'bucketFormColor', 'bucketFormCumulative', 'bucketDeleteTarget', 'bucketDeleteConfirm']) assert(html.includes('for="' + id + '"'));
  assert.match(html, /id="bucketModal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="bucketModalTitle"/);
  assert.match(html, /id="bucketIconPicker"[^>]*role="group"[^>]*aria-label=/);
  assert.match(html, /id="bucketFormError" role="alert"/);
  assert(!html.includes('รองรับไฟล์ JPEG, PNG, WebP'));
  const bucketApp = loadApp(); bucketApp.api.bindBucketEvents();
  assert.equal(bucketApp.el('bucketIconPicker').children.length, 19);
  assert.deepEqual(bucketApp.el('bucketIconPicker').children.map(n => n.getAttribute('data-icon')), ['🐷', '🏡', '📈', '🍜', '🛟', '🛡️', '✈️', '🐱', '🚗', '🎁', '💎', '☕', '🍔', '🎓', '📌', '🌈', '🍄', '🍎', '🐝']);
  assert(bucketApp.el('bucketIconPicker').children.every(n => n.children[0]?.className === 'icon-3d-badge' && n.children[0]?.children[0]?.getAttribute('class') === 'cute-3d-svg'));
  for (const name of ['light', 'dark', 'blue', 'dark-red', 'fintrack']) {
    const block = html.match(new RegExp('\\[data-theme="' + name + '"\\]\\s*\\{([^}]+)'))[1];
    const alpha = Number(block.match(/--glass:rgba\([^,]+,[^,]+,[^,]+,([\d.]+)\)/)[1]);
    assert(alpha >= .05 && alpha <= .10);
    for (const token of ['text-main', 'text-secondary', 'text-muted', 'aurora-blue', 'aurora-green', 'aurora-purple']) assert(block.includes(`--${token}:`));
    assert(!/\bopacity\s*:/.test(block));
  }
  assert.match(html, /\.app-header, \.card, \.fund-card \{ background:var\(--glass\)/);
  assert.match(html, /@supports not.*backdrop-filter/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /transition:none !important/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'DOM ids are unique');
  const panel = html.match(/<section class="card automation-panel"[\s\S]*?<\/section>/)[0];
  assert(!/<(?:fieldset|legend)\b/.test(panel));
  assert.equal((panel.match(/class="glass-subcard" role="group" aria-labelledby="[^"]+"/g) || []).length, 2);
  for (const id of ['batchPayTitle', 'fatherCycleTitle']) assert(panel.includes('id="' + id + '"'));
  // Original controls retain all attributes, including labels and live regions.
  const baseline = [
  "<h2 id=\"automationTitle\">",
  "<select id=\"themeSelect\">",
  "<button id=\"btnUseSalaryTemplate\" type=\"button\" class=\"btn btn-secondary\">",
  "<button id=\"btnClearSalaryTemplate\" type=\"button\" class=\"btn btn-secondary\">",
  "<button id=\"btnVoiceEntry\" type=\"button\" class=\"btn btn-secondary\">",
  "<p id=\"captureStatus\" role=\"status\" aria-live=\"polite\">",
  "<button id=\"btnResumeShare\" type=\"button\" class=\"btn btn-secondary\">",
  "<p id=\"voiceStatus\" role=\"status\" aria-live=\"polite\">",
  "<div id=\"dailyQuickChips\" class=\"automation-bar\" aria-label=\"รายจ่ายที่เคยยืนยัน\">",
  "<button id=\"btnClearLearning\" type=\"button\" class=\"btn btn-secondary\">",
  "<input id=\"batchPayDate\" type=\"date\" required>",
  "<div id=\"batchPayItems\">",
  "<button id=\"btnBatchPay\" type=\"button\" class=\"btn btn-primary\">",
  "<p id=\"batchPayStatus\" role=\"status\" aria-live=\"polite\">",
  "<input id=\"fatherAnchor\" type=\"date\">",
  "<input id=\"fatherInterval\" type=\"number\" min=\"1\" max=\"120\" step=\"1\">",
  "<button id=\"btnSaveFatherCycle\" type=\"button\" class=\"btn btn-secondary\">",
  "<p id=\"fatherCycleStatus\" role=\"status\" aria-live=\"polite\">"
];
  for (const tag of baseline) assert(panel.includes(tag), 'preserve automation markup: ' + tag);
  const blue = html.match(/\[data-theme="blue"\]\s*\{([^}]+)/)[1];
  assert(blue.includes('--bg-app:#071526;'));
  assert.match(html, /linear-gradient\(155deg,#071526/);
  assert.match(html, /transform:none !important/);
  const red = html.match(/\[data-theme="dark-red"\]\s*\{([^}]+)/)[1];
  for (const token of ['--bg-app:#12070a', '--bg-surface:#200910', '--text-main:#fff0f3', '--text-secondary:#f4bac4', '--brand-primary:#e11d48', '--glass:rgba(225,29,72,0.08)']) assert(red.includes(token));
  const wallpaper = html.match(/\[data-theme="dark-red"\] body\s*\{([^}]+)/)[1];
  assert.equal((wallpaper.match(/radial-gradient/g) || []).length, 2);
  assert.match(wallpaper, /linear-gradient/);
  assert(wallpaper.includes("url('./icons/dark_red_finance_bg.png') center / cover no-repeat,#12070a"));
  assert.match(html, /<option value="dark-red">แดงทับทิม<\/option>/);
  assert.match(html, /\[data-theme="dark-red"\] \.kpi-box \{ background:var\(--bg-surface\)/);
  assert.match(html, /\[data-theme="dark-red"\] \.form-control:focus-visible \{ outline:3px solid #ff91ad/);
  for (const file of ['src/sw.ts', 'sw.js']) {
    const sw = fs.readFileSync(file, 'utf8');
    for (const name of ['dark_red_finance_bg', 'aurora_finance_bg']) {
      assert.equal(sw.split(`'./icons/${name}.png'`).length - 1, 1, 'wallpaper precached exactly once');
      const png = fs.readFileSync(`icons/${name}.png`);
      assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert(png.readUInt32BE(16) > 1000 && png.readUInt32BE(20) > 500);
      assert(png.equals(fs.readFileSync(`dist/icons/${name}.png`)), 'deployed wallpaper matches source');
      assert.equal(new URL(`./icons/${name}.png`, 'https://example.com/slipsense/').pathname, `/slipsense/icons/${name}.png`);
    }
    assert(sw.includes('v4-3d-cute-1'));
  }
  const { api, el, context } = loadApp();
  api.bindAutomationEvents();
  assert.equal(el('themeSelect').value, 'fintrack', 'new users default to FinTrack');
  assert.equal(context.document.documentElement.getAttribute('data-theme'), 'fintrack');
  assert.equal(context.localStorage.getItem('slipsense_theme'), null, 'initialization does not persist a preference');
  for (const theme of ['light', 'dark', 'blue', 'dark-red', 'fintrack']) {
    const saved = loadApp(); saved.context.localStorage.setItem('slipsense_theme', theme);
    saved.api.bindAutomationEvents(); assert.equal(saved.el('themeSelect').value, theme);
    assert.equal(saved.context.document.documentElement.getAttribute('data-theme'), theme);
    el('themeSelect').value = theme;
    el('themeSelect').dispatchEvent({ type: 'change', target: el('themeSelect') });
    assert.equal(context.document.documentElement.getAttribute('data-theme'), theme);
    assert.equal(context.localStorage.getItem('slipsense_theme'), theme);
    const reloaded = loadApp();
    reloaded.context.localStorage.setItem('slipsense_theme', context.localStorage.getItem('slipsense_theme'));
    reloaded.api.bindAutomationEvents();
    assert.equal(reloaded.el('themeSelect').value, theme);
    assert.equal(reloaded.context.document.documentElement.getAttribute('data-theme'), theme);
  }
  const blocked = loadApp(); blocked.context.localStorage.getItem = () => { throw new Error('storage unavailable'); };
  blocked.api.bindAutomationEvents(); assert.equal(blocked.el('themeSelect').value, 'fintrack');
  blocked.context.localStorage.setItem = () => { throw new Error('storage unavailable'); };
  blocked.el('themeSelect').value = 'blue';
  blocked.el('themeSelect').dispatchEvent({ type: 'change', target: blocked.el('themeSelect') });
  assert.equal(blocked.context.document.documentElement.getAttribute('data-theme'), 'blue');
  const early = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const vm = require('node:vm');
  for (const stored of [null, 'light', 'dark', 'blue', 'dark-red', 'fintrack', 'invalid']) {
    let actual;
    vm.runInNewContext(early, { localStorage: { getItem: () => stored }, document: { documentElement: { setAttribute: (_, value) => { actual = value; } } } });
    const expected = stored === 'invalid' ? 'light' : stored ?? 'fintrack';
    assert.equal(actual, expected, 'theme applied before first paint');
    const app = loadApp();
    if (stored !== null) app.context.localStorage.setItem('slipsense_theme', stored);
    app.api.bindAutomationEvents();
    assert.equal(app.el('themeSelect').value, expected);
  }
  assert.match(html, /<html[^>]*data-theme="fintrack"/);
  vm.runInNewContext(early, { localStorage: { getItem: () => { throw new Error('blocked'); } } });
  context.localStorage.setItem('slipsense_theme', 'blue'); api.bindAutomationEvents();
  assert.equal(el('themeSelect').value, 'blue');
  for (const id of ['batchPayDate', 'fatherAnchor', 'fatherInterval', 'themeSelect']) assert(html.includes(`for="${id}"`));
  for (const id of ['captureStatus', 'voiceStatus', 'batchPayStatus', 'fatherCycleStatus']) assert.match(html, new RegExp(`id="${id}"[^>]+aria-live="polite"`));
  for (const color of ['#090a0f', '#12141c', '#1e2230', '#10b981', '#6366f1', '#f43f5e']) assert(html.includes(color));
  for (const token of ['mobile-frame-glow', 'dynamic-island', '@keyframes scanLaser', '.laser-line', 'repeat(5,minmax(0,1fr))', 'min-width:1024px']) assert(html.includes(token));
  assert(!/overflow-x:\s*hidden/.test(html), 'no page-wide overflow suppression');
  for (const variant of ['source', 'built']) {
    const app = loadApp(undefined, variant), { api, el, context } = app;
    let captures = 0; el('btnChooseGallery').click = () => captures++;
    api.bindAppNavigation(); api.bindAppNavigation();
    for (const name of ['home', 'funds', 'analytics', 'history']) {
      el('tab-' + name).click();
      assert.equal(el('tab-' + name).getAttribute('aria-selected'), 'true');
      assert.equal(el('tab-' + name).tabIndex, 0);
      assert.equal(el('panel-' + name).hidden, false);
    }
    await el('tab-funds').emit('keydown', { key:'ArrowRight' });
    assert.equal(context.document.activeElement.id, 'tab-analytics', 'arrow skips action FAB');
    for (const id of ['btnBottomCenterScan']) el(id).click();
    assert.equal(captures, 1, 'capture handlers bound once');
    api.getState().isAnalyzingAi = true; el('btnBottomCenterScan').click(); assert.equal(captures, 1);
    api.getState().isAnalyzingAi = false;
    const tx = (id, type, source_type, date='2026-11-01', user_id=null) => ({ id, type, source_type, transaction_date:date, user_id, amount:100, currency:'THB', merchant:'<long unsafe merchant>', category:type==='income'?'salary_income':'food_drink', fund_bucket:'general_expense', sync_status:'local_only' });
    api.getState().transactions = [tx('a','expense','receipt'), tx('b','income','manual'), tx('c','income','transfer_slip'), tx('d','expense','receipt','2026-10-01'), tx('e','expense','receipt','2026-11-01','another-user')];
    el('dashboardMonthPicker').value = '2026-11';
    const list = el('latestTransactionList');
    // DOM mock innerHTML is a plain property; emulate its child clearing for repeated renders.
    Object.defineProperty(list, 'innerHTML', { set() { this.children.length=0; }, get() { return ''; } });
    const allNodes = node => [node, ...(node.children || []).flatMap(allNodes)];
    api.renderLatestTransactions(); assert.equal(list.children.length, 3);
    const nodes = allNodes(list);
    assert.equal(nodes.filter(n=>n.className==='ai-badge').length, 2);
    assert(nodes.some(n=>n.className==='tx-merchant' && n.textContent==='<long unsafe merchant>'));
    assert(nodes.some(n=>n.className==='tx-amount income' && n.textContent.startsWith('+฿')));
    assert(nodes.some(n=>n.className==='tx-amount expense' && n.textContent.startsWith('-฿')));
    el('filterTypeSelect').value='income'; el('latest-expense').click();
    assert.equal(list.children.length, 1); assert.equal(el('filterTypeSelect').value,'income');
    el('latest-income').click(); assert.equal(list.children.length, 2);
    api.getState().transactions=[]; api.renderLatestTransactions(); assert.equal(list.children[0].className,'empty-state');
    api.getState().currentCompressedImage={mimeType:'image/jpeg',base64:'AAAA'};
    // An unconfigured client rejects through the actual analysis catch/finally path.
    const pending = api.triggerAiAnalysisForCurrentImage();
    assert.equal(el('imagePreviewPanel').getAttribute('aria-busy'),'true');
    assert.equal(el('scanLaserLine').hidden,false); assert.equal(el('btnBottomCenterScan').disabled,true);
    await pending;
    assert.equal(api.getState().isAnalyzingAi,false); assert.equal(el('scanLaserLine').hidden,true);
    assert.equal(el('imagePreviewPanel').getAttribute('aria-busy'),'false'); assert.equal(el('btnBottomCenterScan').disabled,false);
    // Verify 3D Cute Kawaii UI icons, Jar Shelf, and SW update check
    const badge = api.render3dIcon('🐷', 64);
    assert.equal(badge.className, 'icon-3d-badge');
    assert.equal(badge.getAttribute('data-icon-key'), 'pig');
    assert.equal(badge.children[0].getAttribute('class'), 'cute-3d-svg');
    const defs = badge.children[0].children[0];
    assert.deepEqual(defs.children.map(c => c.tagName), ['RADIALGRADIENT', 'LINEARGRADIENT', 'FILTER']);
    assert.equal(api.render3dIcon('<svg onload=alert(1)>', -10).getAttribute('data-icon-key'), 'pig');
    assert.equal(api.jarProgress(17400, 34800), 50);
    assert.equal(api.jarProgress(-500, 1000), 0);
    assert.equal(api.jarProgress(5000, 1000), 100);
    assert.equal(api.jarProgress(100, 0), 0);
    api.renderDashboardAndHistory();
    assert.equal(el('homeJarShelf').children.length, 7);
    assert.equal(el('homeJarShelf').children[6].className, 'jar-add-card');
    assert.equal(el('fundBucketsContainer').children.at(-1).className, 'jar-add-card');
    let swUpdated = 0;
    context.navigator.serviceWorker = { register: () => Promise.resolve({ update: () => { swUpdated++; } }) };
    await api.registerServiceWorkerSafe();
    assert.equal(swUpdated, 1, 'SW registration triggers update()');

  }
};
