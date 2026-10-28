'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const { loadApp } = require('./app_harness');
module.exports = async function () {
  const { api, el } = loadApp();
  let prevented = 0;
  const paste = (file, type = file.type) => api.handleReceiptPaste({ clipboardData: { items: [{ kind: 'file', type, getAsFile: () => file }] }, preventDefault() { prevented++; } });
  api.handleReceiptPaste({ clipboardData: { items: [{ kind: 'string', type: 'text/plain' }] }, preventDefault() { prevented++; } });
  assert.equal(prevented, 0);
  paste({ type: 'image/svg+xml', size: 50 }); paste({ type: 'image/png', size: 21 * 1024 * 1024 });
  assert.equal(prevented, 0);
  assert.equal(api.validReceiptFile({ type: 'image/webp', size: 1 }), true);
  assert.equal(api.validReceiptFile({ type: 'image/png', size: 0 }), false);
  paste({ name: 'receipt.png', type: 'image/png', size: 10 });
  assert.equal(prevented, 1);
  await new Promise(resolve => setTimeout(resolve, 20));
  // The sandbox canvas produces JPEG data; capture still requires review before saving.
  assert.equal(api.getState().transactions.length, 0);
  assert.equal(api.getState().currentCompressedImage.mimeType, 'image/jpeg');
  assert.match(api.getState().currentCompressedImage.dataUrl, /^data:image\/jpeg;base64,/);
  assert(api.getState().currentCompressedImage.base64.length > 0);
  await api.triggerAiAnalysisForCurrentImage(); // no authenticated Edge client
  assert.equal(api.getState().transactions.length, 0);
  assert.equal(el('aiAnalysisErrorBox').hidden, false);
  const source = fs.readFileSync('src/app.ts', 'utf8');
  assert(!source.includes('generativelanguage.googleapis.com'));
  assert(source.includes('openVerificationModalFromAiResult(aiData)'));
};
