'use strict';
const fs = require('fs');
const vm = require('vm');
const { stripTypeScriptTypes } = require('node:module');
const { createBrowserSandbox } = require('../scripts/run_tests');
function loadApp(idb) {
  const context = createBrowserSandbox();
  context.document.readyState = 'loading';
  if (idb) context.indexedDB = idb;
  vm.runInContext(stripTypeScriptTypes(fs.readFileSync('src/app.ts', 'utf8')), context);
  const api = context.SlipSenseApp;
  const el = id => context.document.getElementById(id);
  return { api, context, el };
}
module.exports = { loadApp };
