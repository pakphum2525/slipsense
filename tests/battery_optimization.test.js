'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { stripTypeScriptTypes } = require('node:module');
const { createBrowserSandbox } = require('../scripts/run_tests');
const tick = () => new Promise(resolve => setImmediate(resolve));
function load(variant) {
  const context = createBrowserSandbox(), listeners = {}, timers = new Map();
  let timer = 0;
  context.document.readyState = 'loading';
  context.document.hidden = false;
  context.document.addEventListener = (name, fn) => { (listeners[name] ||= []).push(fn); };
  context.setInterval = fn => { timers.set(++timer, fn); return timer; };
  context.clearInterval = id => timers.delete(id);
  const html = fs.readFileSync(variant === 'source' ? 'src/index.template.html' : 'dist/index.html', 'utf8');
  const code = variant === 'source' ? stripTypeScriptTypes(fs.readFileSync('src/app.ts', 'utf8'))
    : [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('SlipSenseApp'));
  vm.runInContext(code, context);
  return { context, api: context.SlipSenseApp, timers, listeners,
    async visibility(hidden) { context.document.hidden = hidden; listeners.visibilitychange.forEach(fn => fn()); await new Promise(resolve => setTimeout(resolve, 40)); } };
}
module.exports = async function () {
  for (const variant of ['source', 'built']) {
    const h = load(variant), state = h.api.getState();
    let created = 0, removed = [], session = async () => ({ data: { session: { user: { id: 'owner' } } } });
    state.currentUser = { id: 'owner' };
    state.supabaseClient = {
      auth: { getSession: () => session() },
      channel() { created++; return { on() { return this; }, subscribe() { return this; } }; },
      async removeChannel(channel) { removed.push(channel); },
      from() { throw Error('REST unavailable'); }
    };
    assert.equal(h.listeners.visibilitychange.length, 1);
    const unrelated = {};
    state.realtimeChannel = unrelated;
    await h.visibility(true);
    assert.equal(state.realtimeChannel, null);
    assert.deepEqual(removed, [unrelated]);
    await h.visibility(false);
    assert.equal(created, 1);
    await h.visibility(false);
    assert.equal(created, 2);
    assert.equal(removed.length, 2, 'only the owned channel is removed');
    let resolveSession;
    session = () => new Promise(resolve => { resolveSession = resolve; });
    await h.visibility(false);
    await h.visibility(true);
    resolveSession({ data: { session: { user: { id: 'owner' } } } });
    await tick();
    assert.equal(created, 2, 'hidden cancels a pending resume');
    await h.visibility(false);
    state.currentUser = null;
    resolveSession({ data: { session: { user: { id: 'owner' } } } });
    await tick();
    assert.equal(created, 2, 'logout cancels a pending resume');
    state.currentUser = { id: 'owner' };
    session = async () => { throw Error('session unavailable'); };
    await h.visibility(false);
    assert.equal(created, 2);

    session = async () => ({ data: { session: { user: { id: 'owner' } } } });
    let resolveRemoval;
    const foreignChannel = {};
    state.realtimeChannel = {};
    state.supabaseClient.removeChannel = channel => {
      assert.notEqual(channel, foreignChannel, 'leave other features channels alone');
      removed.push(channel);
      return new Promise(resolve => { resolveRemoval = resolve; });
    };
    await h.visibility(false);
    await h.visibility(true);
    resolveRemoval(); await tick();
    assert.equal(created, 2, 'hidden invalidates setup awaiting asynchronous removal');
    state.supabaseClient.removeChannel = async channel => { removed.push(channel); };
    session = async () => ({ data: { session: { user: { id: 'other-user' } } } });
    await h.visibility(false);
    assert.equal(created, 2, 'do not reconnect for a mismatched session');

    // Real inbox mock exercises renewal, pause, resumption, release and claim loss.
    session = async () => ({ data: { session: { user: { id: 'owner' } } } });
    h.context.location.href = 'http://127.0.0.1:8080/?share=receipt';
    const db = await new Promise(resolve => { const req = h.context.indexedDB.open('slipsense_share_inbox', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('images', { keyPath: 'id' }); req.onsuccess = () => resolve(req.result); });
    await new Promise(resolve => { const tx = db.transaction('images', 'readwrite'); tx.objectStore('images').put({
      id: 'receipt', expires: Date.now() + 100000, state: 'pending', file: { type: 'image/png', size: 10 }
    }); tx.oncomplete = resolve; }); db.close();
    await h.api.resumeSharedReceipt(); assert.equal(h.timers.size, 1);
    await h.visibility(true); assert.equal(h.timers.size, 0);
    await h.visibility(false); assert.equal(h.timers.size, 1);
    // A queued renewal from a stopped interval cannot cancel its replacement.
    const staleRenewal = [...h.timers.values()][0];
    staleRenewal();
    await h.visibility(true);
    await h.visibility(false); assert.equal(h.timers.size, 1);
    await h.api.releaseSharedReceipt(); assert.equal(h.timers.size, 0);
    await h.visibility(false); assert.equal(h.timers.size, 0);
    await h.api.resumeSharedReceipt(); assert.equal(h.timers.size, 1);
    await h.visibility(true);
    await h.api.shareInboxChange('receipt', row => ({ ...row, claim: 'another-tab' }));
    await h.visibility(false); assert.equal(h.timers.size, 0);

    for (const failure of [null, 'decode', 'context', 'draw', 'encode', 'invalid']) {
      let image, canvas, decoded;
      h.context.FileReader = class { readAsDataURL() { this.result = 'data:image/png;base64,AAAA'; this.onload(); } };
      h.context.Image = class {
        constructor() { image = this; this.naturalWidth = 3200; this.naturalHeight = 1600; }
        set src(value) { this.value = value; if (value) decoded = () => failure === 'decode' ? this.onerror() : this.onload(); }
      };
      h.context.document.createElement = () => (canvas = { width: 0, height: 0,
        getContext: () => failure === 'context' ? null : { fillRect() {}, drawImage() { if (failure === 'draw') throw Error('draw'); } },
        toDataURL(type, quality) { assert.equal(type, 'image/jpeg'); assert.equal(quality, .82);
          assert.equal(canvas.width, 1600); assert.equal(canvas.height, 800);
          if (failure === 'encode') throw Error('encode'); return failure === 'invalid' ? '' : 'data:image/jpeg;base64,AAAA'; }
      });
      const promise = h.api.compressReceiptImage({ type: 'image/png', size: 10 });
      const outcome = failure ? assert.rejects(promise) : promise;
      await tick(); assert(image.value); decoded();
      const result = await outcome;
      if (!failure) { assert.equal(result.width, 1600); assert.equal(result.height, 800); assert.equal(result.base64, 'AAAA'); }
      assert.equal(image.value, ''); assert.equal(image.onload, null); assert.equal(image.onerror, null);
      if (canvas) { assert.equal(canvas.width, 0); assert.equal(canvas.height, 0); }
    }
  }
  for (const file of ['src/index.template.html', 'index.html', 'dist/index.html']) {
    const html = fs.readFileSync(file, 'utf8');
    assert.equal([...html.matchAll(/id="appFixedBg"/g)].length, 1);
    assert.match(html, /id="appFixedBg"[^>]*aria-hidden="true"/);
    const css = html.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
    assert(!/background-attachment\s*:\s*fixed/.test(css));
    assert.match(css, /\.app-fixed-bg\s*\{[^}]*position:\s*fixed[^}]*pointer-events:\s*none[^}]*translateZ\(0\)[^}]*z-index:\s*-1/);
    for (const match of css.matchAll(/(?:-webkit-)?backdrop-filter:\s*blur\((\d+)px\)/g)) assert(Number(match[1]) <= 14);
    for (const theme of ['cute-pastel', 'fintrack', 'dark-red', 'blue']) assert(css.includes('[data-theme="' + theme + '"] .app-fixed-bg') || css.includes('[data-theme="' + theme + '"] .app-fixed-bg'.replace('] ', ']')));
    assert(css.includes('var(--aurora-green)'));
    const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]).sort();
    const sourceIds = [...fs.readFileSync('src/index.template.html', 'utf8').matchAll(/\bid="([^"]+)"/g)].map(m => m[1]).sort();
    assert.deepEqual(ids, sourceIds, 'generated HTML preserves every template DOM ID');
  }
};

// Run the existing pipeline while enforcing the task's exact filesystem scope.
module.exports.buildScoped = function () {
  const root = path.resolve(__dirname, '..');
  const allowed = new Set(['index.html', 'sw.js', 'dist/index.html', 'dist/sw.js', 'dist/BUILD_MANIFEST.json']);
  const original = Object.fromEntries(['rmSync', 'mkdirSync', 'writeFileSync', 'copyFileSync'].map(k => [k, fs[k]]));
  const relative = p => path.relative(root, path.resolve(p)).replace(/\\/g, '/');
  try {
    fs.rmSync = p => {
      assert.equal(path.resolve(p), path.join(root, 'dist'));
      for (const rel of allowed) if (rel.startsWith('dist/') && fs.existsSync(path.join(root, rel))) {
        fs.unlinkSync(path.join(root, rel));
      }
    };
    fs.mkdirSync = p => { assert(fs.existsSync(p), 'build cannot create an unapproved directory'); };
    fs.writeFileSync = (p, data, options) => {
      if (allowed.has(relative(p))) return original.writeFileSync(p, data, options);
      assert(fs.existsSync(p) && fs.readFileSync(p).equals(Buffer.from(data)), 'unapproved build write: ' + relative(p));
    };
    fs.copyFileSync = (src, dest) => {
      assert(fs.existsSync(dest) && fs.readFileSync(src).equals(fs.readFileSync(dest)), 'static asset differs: ' + relative(dest));
    };
    require('../scripts/build_prod').main();
  } finally { Object.assign(fs, original); }
};
