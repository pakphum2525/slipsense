'use strict';
const fs = require('fs');
const assert = require('node:assert/strict');
const { loadApp } = require('./app_harness');
module.exports = async function () {
  const html = fs.readFileSync('src/index.template.html', 'utf8');
  for (const name of ['light', 'dark', 'blue']) {
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
  const { api, el, context } = loadApp();
  api.bindAutomationEvents();
  assert.equal(el('themeSelect').value, 'blue', 'new users default to aurora');
  assert.equal(context.localStorage.getItem('slipsense_theme'), null, 'initialization does not persist a preference');
  for (const theme of ['light', 'dark', 'blue']) {
    const saved = loadApp(); saved.context.localStorage.setItem('slipsense_theme', theme);
    saved.api.bindAutomationEvents(); assert.equal(saved.el('themeSelect').value, theme);
  }
  const blocked = loadApp(); blocked.context.localStorage.getItem = () => { throw new Error('storage unavailable'); };
  blocked.api.bindAutomationEvents(); assert.equal(blocked.el('themeSelect').value, 'blue');
  const early = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const vm = require('node:vm');
  for (const stored of [null, 'light', 'dark', 'blue']) {
    let actual;
    vm.runInNewContext(early, { localStorage: { getItem: () => stored }, document: { documentElement: { setAttribute: (_, value) => { actual = value; } } } });
    assert.equal(actual, stored ?? 'blue', 'theme applied before first paint');
  }
  context.localStorage.setItem('slipsense_theme', 'blue'); api.bindAutomationEvents();
  assert.equal(el('themeSelect').value, 'blue');
  for (const id of ['batchPayDate', 'fatherAnchor', 'fatherInterval', 'themeSelect']) assert(html.includes(`for="${id}"`));
  for (const id of ['captureStatus', 'voiceStatus', 'batchPayStatus', 'fatherCycleStatus']) assert.match(html, new RegExp(`id="${id}"[^>]+aria-live="polite"`));
};
