'use strict';
const fs = require('fs');
const vm = require('vm');
const { stripTypeScriptTypes } = require('node:module');
const { createBrowserSandbox } = require('../scripts/run_tests');
function loadApp(idb, variant = 'source') {
  const context = createBrowserSandbox();
  context.document.readyState = 'loading';
  if (idb) context.indexedDB = idb;
  const html = fs.readFileSync(variant === 'built' ? 'dist/index.html' : 'src/index.template.html', 'utf8');
  // Seed real markup attributes; this sandbox does not implement HTML layout/parsing.
  for (const match of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const node = context.document.getElementById(match[3]);
    node.tagName = match[1].toUpperCase();
    node.open = /\sopen(?:\s|=|$)/.test(match[2]);
    for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) node.setAttribute(attr[1], attr[2]);
  }
  const code = variant === 'built'
    ? [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(code => code.includes('SlipSenseApp'))
    : stripTypeScriptTypes(fs.readFileSync('src/app.ts', 'utf8'));
  vm.runInContext(code, context);
  const api = context.SlipSenseApp;
  const el = id => context.document.getElementById(id);
  return { api, context, el, html, emit: (id, type, properties) => el(id).emit(type, properties) };
}
module.exports = { loadApp };
