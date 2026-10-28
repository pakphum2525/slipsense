'use strict';
const fs = require('fs');
const assert = require('node:assert/strict');
const { loadApp } = require('./app_harness');
module.exports = async function () {
  const html = fs.readFileSync('src/index.template.html', 'utf8');
  for (const name of ['light', 'dark', 'blue', 'dark-red']) {
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
    assert(sw.includes('v4-dark-red-1'));
  }
  const { api, el, context } = loadApp();
  api.bindAutomationEvents();
  assert.equal(el('themeSelect').value, 'dark-red', 'new users default to dark red');
  assert.equal(context.document.documentElement.getAttribute('data-theme'), 'dark-red');
  assert.equal(context.localStorage.getItem('slipsense_theme'), null, 'initialization does not persist a preference');
  for (const theme of ['light', 'dark', 'blue', 'dark-red']) {
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
  blocked.api.bindAutomationEvents(); assert.equal(blocked.el('themeSelect').value, 'dark-red');
  blocked.context.localStorage.setItem = () => { throw new Error('storage unavailable'); };
  blocked.el('themeSelect').value = 'blue';
  blocked.el('themeSelect').dispatchEvent({ type: 'change', target: blocked.el('themeSelect') });
  assert.equal(blocked.context.document.documentElement.getAttribute('data-theme'), 'blue');
  const early = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const vm = require('node:vm');
  for (const stored of [null, 'light', 'dark', 'blue', 'dark-red', 'invalid']) {
    let actual;
    vm.runInNewContext(early, { localStorage: { getItem: () => stored }, document: { documentElement: { setAttribute: (_, value) => { actual = value; } } } });
    const expected = stored === 'invalid' ? 'light' : stored ?? 'dark-red';
    assert.equal(actual, expected, 'theme applied before first paint');
    const app = loadApp();
    if (stored !== null) app.context.localStorage.setItem('slipsense_theme', stored);
    app.api.bindAutomationEvents();
    assert.equal(app.el('themeSelect').value, expected);
  }
  assert.match(html, /<html[^>]*data-theme="dark-red"/);
  vm.runInNewContext(early, { localStorage: { getItem: () => { throw new Error('blocked'); } } });
  context.localStorage.setItem('slipsense_theme', 'blue'); api.bindAutomationEvents();
  assert.equal(el('themeSelect').value, 'blue');
  for (const id of ['batchPayDate', 'fatherAnchor', 'fatherInterval', 'themeSelect']) assert(html.includes(`for="${id}"`));
  for (const id of ['captureStatus', 'voiceStatus', 'batchPayStatus', 'fatherCycleStatus']) assert.match(html, new RegExp(`id="${id}"[^>]+aria-live="polite"`));
};
