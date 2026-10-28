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
  const { api, el, context } = loadApp();
  context.localStorage.setItem('slipsense_theme', 'blue'); api.bindAutomationEvents();
  assert.equal(el('themeSelect').value, 'blue');
  for (const id of ['batchPayDate', 'fatherAnchor', 'fatherInterval', 'themeSelect']) assert(html.includes(`for="${id}"`));
  for (const id of ['captureStatus', 'voiceStatus', 'batchPayStatus', 'fatherCycleStatus']) assert.match(html, new RegExp(`id="${id}"[^>]+aria-live="polite"`));
};
