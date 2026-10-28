'use strict';
const fs = require('fs');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const { createServer } = require('../scripts/dev_server');
module.exports = async function () {
  const build = spawnSync(process.execPath, ['scripts/build_prod.js'], { encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, build.stderr);
  const firstManifest = fs.readFileSync('dist/BUILD_MANIFEST.json', 'utf8');
  const rebuild = spawnSync(process.execPath, ['scripts/build_prod.js'], { encoding: 'utf8', windowsHide: true });
  assert.equal(rebuild.status, 0, rebuild.stderr);
  assert.equal(fs.readFileSync('dist/BUILD_MANIFEST.json', 'utf8'), firstManifest, 'QA rebuild must leave committed artifacts unchanged');
  assert.equal(fs.readFileSync('index.html', 'utf8'), fs.readFileSync('dist/index.html', 'utf8'));
  assert.equal(fs.readFileSync('sw.js', 'utf8'), fs.readFileSync('dist/sw.js', 'utf8'));
  assert.equal(fs.readFileSync('manifest.json', 'utf8'), fs.readFileSync('dist/manifest.json', 'utf8'));
  for (const id of ['btnBatchPay', 'btnUseSalaryTemplate', 'btnVoiceEntry', 'dailyQuickChips']) assert(fs.readFileSync('dist/index.html', 'utf8').includes(`id="${id}"`));
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8080, '127.0.0.1', resolve); });
  try {
    const response = await fetch('http://127.0.0.1:8080/dist/index.html');
    assert.equal(response.status, 200); assert((await response.text()).includes('btnBatchPay'));
    assert.equal((await fetch('http://127.0.0.1:8080/dist/manifest.json')).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
};
