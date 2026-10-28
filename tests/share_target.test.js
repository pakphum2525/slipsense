'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const { createIndexedDB } = require('./idb_harness');
const { loadApp } = require('./app_harness');
module.exports = async function () {
  const idb = createIndexedDB(), events = {}, scope = 'https://example.test/slipsense/';
  const worker = vm.createContext({ self: { location: new URL(scope), registration: { scope }, addEventListener: (name, fn) => { events[name] = fn; }, clients: { claim: async () => {} } },
    indexedDB: idb, crypto, URL, Response, Request, Date, Promise,
    caches: { keys: async () => ['other-app', 'slipsense-app-shell-old'], delete: async key => { assert.equal(key, 'slipsense-app-shell-old'); },
      open: async () => ({ match: async () => new Response('<html>offline shell</html>') }) },
    fetch: async () => { throw new Error('offline'); } });
  vm.runInContext(stripTypeScriptTypes(fs.readFileSync('src/sw.ts', 'utf8')), worker);
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.equal(new URL(manifest.share_target.action, scope).pathname, '/slipsense/share-target');
  assert.equal(manifest.share_target.params.files[0].name, 'receipt');
  const submit = async (file, path = 'share-target') => {
    const data = new FormData(); data.append('receipt', file, 'receipt.png');
    let response, pending;
    events.fetch({ request: new Request(new URL(path, scope), { method: 'POST', body: data }), respondWith: p => { response = p; }, waitUntil: p => { pending = p; } });
    if (!response) return null;
    const result = await response; await pending; return result;
  };
  assert.equal(await submit(new Blob(['a'], { type: 'image/png' }), '../share-target'), null);
  assert.equal((await submit(new Blob(['a'], { type: 'text/plain' }))).status, 415);
  assert.equal((await submit(new Blob([], { type: 'image/png' }))).status, 413);
  assert.equal((await submit(new Blob([new Uint8Array(20 * 1024 * 1024 + 1)], { type: 'image/png' }))).status, 413);
  idb.failWrites = true;
  assert.equal((await submit(new Blob(['a'], { type: 'image/png' }))).status, 507);
  idb.failWrites = false;
  const response = await submit(new Blob(['image'], { type: 'image/png' }));
  assert.equal(response.status, 303);
  const location = response.headers.get('location'); assert(location.startsWith(scope + 'index.html?share='));
  const id = new URL(location).searchParams.get('share');
  const a = loadApp(idb), b = loadApp(idb);
  a.context.location.href = location; b.context.location.href = location;
  await a.api.resumeSharedReceipt(); assert.match(a.el('captureStatus').textContent, /เข้าสู่ระบบ/);
  a.api.getState().currentUser = { id: 'user-a' }; b.api.getState().currentUser = { id: 'user-a' };
  await a.api.resumeSharedReceipt(); await b.api.resumeSharedReceipt();
  assert.match(b.el('captureStatus').textContent, /แท็บอื่น/);
  await a.api.releaseSharedReceipt();
  b.api.getState().currentUser = { id: 'user-b' }; await b.api.resumeSharedReceipt();
  assert.match(b.el('captureStatus').textContent, /บัญชีอื่น/);
  b.api.getState().currentUser = { id: 'user-a' }; await b.api.resumeSharedReceipt();
  await b.api.releaseSharedReceipt(true);
  await a.api.resumeSharedReceipt(); assert.match(a.el('captureStatus').textContent, /รับแล้ว/);
  const acked = await a.api.shareInboxChange(id, row => row);
  assert.equal(acked.state, 'acked'); assert.equal(acked.file, null);
  const next = await submit(new Blob(['image'], { type: 'image/png' }));
  const nextId = new URL(next.headers.get('location')).searchParams.get('share');
  await a.api.shareInboxChange(nextId, row => ({ ...row, expires: Date.now() - 1 }));
  assert.equal(await a.api.shareInboxChange(nextId, row => row), null);
  let activation;
  events.activate({ waitUntil: p => { activation = p; } }); await activation;
  let navigation;
  events.fetch({ request: { url: location, method: 'GET', mode: 'navigate', headers: new Headers() }, respondWith: p => { navigation = p; } });
  assert.match(await (await navigation).text(), /offline shell/);
};
