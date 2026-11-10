'use strict';

/**
 * tests/portfolio_engine.test.js
 * Comprehensive unit test suite for SlipSense Stock Portfolio & P/L Engine (RocketTool 100% Logic)
 */

const assert = require('assert');

// Pure calculation functions mirroring RocketTool logic
function calculateWeightedAverageCost(currentShares, currentCostBasis, buyQty, buyPrice) {
  const shares = Number(currentShares) || 0;
  const cost = Number(currentCostBasis) || 0;
  const qty = Number(buyQty) || 0;
  const price = Number(buyPrice) || 0;

  if (qty <= 0 || price < 0) return { shares, costBasis: cost, avgCost: shares > 0 ? cost / shares : 0 };

  const newShares = shares + qty;
  const newCostBasis = cost + (qty * price);
  const newAvgCost = newShares > 0 ? newCostBasis / newShares : 0;

  return {
    shares: newShares,
    costBasis: newCostBasis,
    avgCost: newAvgCost
  };
}

function calculateSellExecution(currentShares, currentAvgCost, sellQty, sellPrice) {
  const shares = Number(currentShares) || 0;
  const avgCost = Number(currentAvgCost) || 0;
  const qty = Number(sellQty) || 0;
  const price = Number(sellPrice) || 0;

  if (shares <= 0 || qty <= 0) {
    return { shares, costBasis: shares * avgCost, avgCost, realizedPL: 0 };
  }

  const actualSellQty = Math.min(shares, qty);
  const costOfSold = actualSellQty * avgCost;
  const proceeds = actualSellQty * price;
  const realizedPL = proceeds - costOfSold;

  const remainingShares = shares - actualSellQty;
  const remainingCostBasis = remainingShares * avgCost;

  return {
    shares: remainingShares,
    costBasis: remainingCostBasis,
    avgCost: remainingShares > 0 ? avgCost : 0,
    realizedPL
  };
}

function calculateHoldingPnL(shares, costBasis, currentPrice) {
  const s = Number(shares) || 0;
  const cost = Number(costBasis) || 0;
  const price = Number(currentPrice) || 0;

  const marketValue = s * price;
  const unrealizedPL = marketValue - cost;
  const unrealizedPLPct = cost > 0 ? (unrealizedPL / cost) * 100 : 0;

  return {
    marketValue,
    unrealizedPL,
    unrealizedPLPct
  };
}

function calculatePortfolioSummary(holdings, cashBalance) {
  const cash = Math.max(0, Number(cashBalance) || 0);
  let totalStockValue = 0;
  let totalCost = 0;

  const computedHoldings = (holdings || []).map(h => {
    const s = Number(h.shares) || 0;
    const cost = Number(h.costBasis) || 0;
    const price = Number(h.currentPrice) || 0;
    const pnl = calculateHoldingPnL(s, cost, price);
    totalStockValue += pnl.marketValue;
    totalCost += cost;
    return {
      ...h,
      ...pnl
    };
  });

  const totalPortfolioValue = totalStockValue + cash;
  const totalUnrealizedPL = totalStockValue - totalCost;
  const totalUnrealizedPLPct = totalCost > 0 ? (totalUnrealizedPL / totalCost) * 100 : 0;

  const items = computedHoldings.map(h => ({
    ticker: h.ticker,
    name: h.name || h.ticker,
    value: h.marketValue,
    weight: totalPortfolioValue > 0 ? (h.marketValue / totalPortfolioValue) * 100 : 0,
    targetPct: Number(h.targetPct) || 0,
    unrealizedPL: h.unrealizedPL,
    unrealizedPLPct: h.unrealizedPLPct
  }));

  const cashWeight = totalPortfolioValue > 0 ? (cash / totalPortfolioValue) * 100 : 0;

  return {
    totalStockValue,
    cash,
    totalPortfolioValue,
    totalCost,
    totalUnrealizedPL,
    totalUnrealizedPLPct,
    items,
    cashWeight
  };
}

function simulateTrade(holding, action, quantity, price, currentTotalPortfolioValue) {
  const qty = Number(quantity) || 0;
  const px = Number(price) || 0;
  const portVal = Number(currentTotalPortfolioValue) || 0;
  const targetPct = Number(holding.targetPct) || 0;

  if (action === 'buy') {
    const projected = calculateWeightedAverageCost(holding.shares, holding.costBasis, qty, px);
    const projectedMarketValue = projected.shares * px;
    const newPortVal = portVal + (qty * px);
    const projectedWeight = newPortVal > 0 ? (projectedMarketValue / newPortVal) * 100 : 0;

    let alertType = 'none';
    let alertText = '';
    if (targetPct > 0) {
      if (projectedWeight > targetPct) {
        alertType = 'warn';
        alertText = `⚠️ สัดส่วนจะเกินเป้า ${targetPct}% ไปเป็น ${projectedWeight.toFixed(1)}% — ตั้งใจเพิ่มน้ำหนักตัวนี้จริงไหม?`;
      } else {
        alertType = 'ok';
        alertText = `✓ ยังอยู่ในกรอบเป้า ${targetPct}% (${projectedWeight.toFixed(1)}%)`;
      }
    }

    return {
      projectedShares: projected.shares,
      projectedAvgCost: projected.avgCost,
      projectedCostBasis: projected.costBasis,
      projectedMarketValue,
      projectedWeight,
      alertType,
      alertText
    };
  }

  return null;
}

function createSvgArcPath(cx, cy, rOuter, rInner, a0, a1) {
  const pt = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [ox, oy] = pt(rOuter, a0);
  const [ux, uy] = pt(rOuter, a1);
  const [hx, hy] = pt(rInner, a1);
  const [px, py] = pt(rInner, a0);
  const largeArc = (a1 - a0 > Math.PI) ? 1 : 0;
  return `M ${ox.toFixed(2)} ${oy.toFixed(2)} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${ux.toFixed(2)} ${uy.toFixed(2)} L ${hx.toFixed(2)} ${hy.toFixed(2)} A ${rInner} ${rInner} 0 ${largeArc} 0 ${px.toFixed(2)} ${py.toFixed(2)} Z`;
}


function sortHoldings(items, sortMode) {
  const sorted = [...items];
  if (sortMode === 'pnl_desc') {
    sorted.sort((a, b) => b.unrealizedPLPct - a.unrealizedPLPct);
  } else if (sortMode === 'pnl_asc') {
    sorted.sort((a, b) => a.unrealizedPLPct - b.unrealizedPLPct);
  } else if (sortMode === 'weight_desc') {
    sorted.sort((a, b) => b.weight - a.weight);
  } else if (sortMode === 'weight_asc') {
    sorted.sort((a, b) => a.weight - b.weight);
  }
  return sorted;
}

function filterHoldings(items, query) {
  if (!query) return items;
  const q = query.toLowerCase();
  return items.filter(item => 
    item.ticker.toLowerCase().includes(q) || (item.name && item.name.toLowerCase().includes(q))
  );
}


function calculateDimeHoldingMetrics(raw) {
  const ticker = (raw.ticker || '').toUpperCase().trim();
  const marketValue = Number(raw.marketValue) || 0;
  let unrealizedPL = Number(raw.unrealizedPL);
  let unrealizedPLPct = Number(raw.unrealizedPLPct) || 0;

  if (isNaN(unrealizedPL)) {
    if (unrealizedPLPct !== 0) {
      unrealizedPL = (marketValue * (unrealizedPLPct / 100)) / (1 + (unrealizedPLPct / 100));
    } else {
      unrealizedPL = 0;
    }
  }

  const costBasis = Math.max(0, marketValue - unrealizedPL);
  let shares = Number(raw.shares) || 0;
  let currentPrice = Number(raw.currentPrice) || 0;

  if (shares <= 0 && currentPrice > 0) {
    shares = marketValue / currentPrice;
  } else if (shares <= 0) {
    shares = 1;
  }

  const avgCost = shares > 0 ? (costBasis / shares) : costBasis;
  if (currentPrice <= 0 && shares > 0) {
    currentPrice = marketValue / shares;
  }

  return {
    ticker,
    marketValue,
    unrealizedPL,
    unrealizedPLPct,
    costBasis,
    shares,
    avgCost,
    currentPrice
  };
}

function upsertPortfolioHoldings(holdingsList, newHoldings) {
  const holdings = holdingsList.map(h => ({ ...h }));
  newHoldings.forEach(nh => {
    const t = (nh.ticker || '').toUpperCase().trim();
    if (!t) return;
    const existing = holdings.find(h => h.ticker.toUpperCase() === t);
    if (existing) {
      existing.shares = nh.shares;
      existing.costBasis = nh.costBasis;
      existing.avgCost = nh.avgCost;
      existing.currentPrice = nh.currentPrice;
      if (nh.targetPct && nh.targetPct > 0) existing.targetPct = nh.targetPct;
    } else {
      holdings.push({
        ticker: t,
        shares: nh.shares,
        costBasis: nh.costBasis,
        avgCost: nh.avgCost,
        currentPrice: nh.currentPrice,
        targetPct: nh.targetPct || 0
      });
    }
  });
  return holdings;
}

module.exports = async function runPortfolioEngineTests() {
  await runServiceWorkerRegression();
  await runDimeImporterRegression();
  // 1.1 ซื้อหุ้นครั้งแรก
  const r1 = calculateWeightedAverageCost(0, 0, 10, 100);
  assert.strictEqual(r1.shares, 10);
  assert.strictEqual(r1.costBasis, 1000);
  assert.strictEqual(r1.avgCost, 100);

  // 1.2 DCA ถ่วงน้ำหนัก
  const r2 = calculateWeightedAverageCost(10, 1000, 10, 120);
  assert.strictEqual(r2.shares, 20);
  assert.strictEqual(r2.costBasis, 2200);
  assert.strictEqual(r2.avgCost, 110);

  // 1.3 ขายหุ้นและ Realized P/L
  const r3 = calculateSellExecution(20, 110, 10, 130);
  assert.strictEqual(r3.shares, 10);
  assert.strictEqual(r3.avgCost, 110);
  assert.strictEqual(r3.costBasis, 1100);
  assert.strictEqual(r3.realizedPL, 200);

  // 1.4 Unrealized P/L
  const gain = calculateHoldingPnL(10, 1100, 140);
  assert.strictEqual(gain.marketValue, 1400);
  assert.strictEqual(gain.unrealizedPL, 300);
  assert.strictEqual(Math.round(gain.unrealizedPLPct * 100) / 100, 27.27);

  const loss = calculateHoldingPnL(10, 1100, 80);
  assert.strictEqual(loss.marketValue, 800);
  assert.strictEqual(loss.unrealizedPL, -300);
  assert.strictEqual(Math.round(loss.unrealizedPLPct * 100) / 100, -27.27);

  // 1.5 ภาพรวมพอร์ต & สัดส่วน 100%
  const holdings = [
    { ticker: 'NVDA', shares: 10, costBasis: 1000, currentPrice: 140, targetPct: 40 },
    { ticker: 'AAPL', shares: 5, costBasis: 500, currentPrice: 120, targetPct: 30 }
  ];
  const cash = 1000;
  const summary = calculatePortfolioSummary(holdings, cash);
  assert.strictEqual(summary.totalStockValue, 2000);
  assert.strictEqual(summary.totalPortfolioValue, 3000);
  assert.strictEqual(summary.totalCost, 1500);
  assert.strictEqual(summary.totalUnrealizedPL, 500);

  const nvda = summary.items.find(i => i.ticker === 'NVDA');
  const aapl = summary.items.find(i => i.ticker === 'AAPL');
  assert.strictEqual(Math.round(nvda.weight * 10) / 10, 46.7);
  assert.strictEqual(Math.round(aapl.weight * 10) / 10, 20.0);
  assert.strictEqual(Math.round(summary.cashWeight * 10) / 10, 33.3);
  assert.strictEqual(Math.round(nvda.weight + aapl.weight + summary.cashWeight), 100);

  // 1.6 Simulator & Smart Alert
  const sim = simulateTrade(holdings[0], 'buy', 10, 150, 3000);
  assert.strictEqual(sim.projectedShares, 20);
  assert.strictEqual(sim.projectedCostBasis, 2500);
  assert.strictEqual(sim.projectedAvgCost, 125);
  assert.strictEqual(sim.alertType, 'warn');
  assert.ok(sim.alertText.includes('⚠️ สัดส่วนจะเกินเป้า 40%'));

  // 1.7 RocketTool cR SVG arc path math
  const path = createSvgArcPath(215, 165, 122, 74, -Math.PI / 2, 0);
  assert.ok(path.startsWith('M '));
  assert.ok(path.includes(' A 122 122 0 '));
  assert.ok(path.includes(' L '));
  assert.ok(path.includes(' A 74 74 0 '));
  assert.ok(path.endsWith(' Z'));

  // 1.8 Sort by P&L % (Desc & Asc)
  const itemsToSort = [
    { ticker: 'SNOW', unrealizedPLPct: 105.23, weight: 3.2, name: 'Snowflake' },
    { ticker: 'NVDA', unrealizedPLPct: -5.73, weight: 6.5, name: 'Nvidia' },
    { ticker: 'LLY', unrealizedPLPct: 47.76, weight: 6.0, name: 'Eli Lilly' }
  ];
  const sortedPnlDesc = sortHoldings(itemsToSort, 'pnl_desc');
  assert.strictEqual(sortedPnlDesc[0].ticker, 'SNOW');
  assert.strictEqual(sortedPnlDesc[1].ticker, 'LLY');
  assert.strictEqual(sortedPnlDesc[2].ticker, 'NVDA');

  const sortedPnlAsc = sortHoldings(itemsToSort, 'pnl_asc');
  assert.strictEqual(sortedPnlAsc[0].ticker, 'NVDA');
  assert.strictEqual(sortedPnlAsc[1].ticker, 'LLY');
  assert.strictEqual(sortedPnlAsc[2].ticker, 'SNOW');

  // 1.9 Sort by Weight (Desc & Asc)
  const sortedWeightDesc = sortHoldings(itemsToSort, 'weight_desc');
  assert.strictEqual(sortedWeightDesc[0].ticker, 'NVDA');
  assert.strictEqual(sortedWeightDesc[1].ticker, 'LLY');
  assert.strictEqual(sortedWeightDesc[2].ticker, 'SNOW');

  // 1.10 Search Filtering
  const filtered1 = filterHoldings(itemsToSort, 'snow');
  assert.strictEqual(filtered1.length, 1);
  assert.strictEqual(filtered1[0].ticker, 'SNOW');

  const filtered2 = filterHoldings(itemsToSort, 'nvidia');
  assert.strictEqual(filtered2.length, 1);
  assert.strictEqual(filtered2[0].ticker, 'NVDA');

  const filteredEmpty = filterHoldings(itemsToSort, 'XYZNONEXISTENT');
  assert.strictEqual(filteredEmpty.length, 0);

  // 1.11 DIME Screenshot Math (Profit)
  const dimeProfit = calculateDimeHoldingMetrics({
    ticker: 'RKLB',
    marketValue: 3677.75,
    unrealizedPL: 1450.97,
    unrealizedPLPct: 65.16,
    shares: 100,
    currentPrice: 36.7775
  });
  assert.strictEqual(dimeProfit.ticker, 'RKLB');
  assert.strictEqual(Math.round(dimeProfit.costBasis * 100) / 100, 2226.78);
  assert.strictEqual(Math.round(dimeProfit.avgCost * 100) / 100, 22.27);

  // 1.12 DIME Screenshot Math (Loss)
  const dimeLoss = calculateDimeHoldingMetrics({
    ticker: 'SLV',
    marketValue: 3544.20,
    unrealizedPL: -2575.80,
    unrealizedPLPct: -42.09,
    shares: 60,
    currentPrice: 59.07
  });
  assert.strictEqual(dimeLoss.ticker, 'SLV');
  assert.strictEqual(Math.round(dimeLoss.costBasis * 100) / 100, 6120.00);
  assert.strictEqual(Math.round(dimeLoss.avgCost * 100) / 100, 102.00);

  // 1.13 Selective Upsert (DIME Guideline: update existing, add new, preserve others)
  const currentHoldings = [
    { ticker: 'NVDA', shares: 10, costBasis: 1000, avgCost: 100, currentPrice: 140 },
    { ticker: 'RKLB', shares: 50, costBasis: 1000, avgCost: 20, currentPrice: 30 }
  ];
  const scanned = [
    { ticker: 'RKLB', shares: 100, costBasis: 2226.78, avgCost: 22.27, currentPrice: 36.78 },
    { ticker: 'SOFI', shares: 65, costBasis: 1784.80, avgCost: 27.46, currentPrice: 17.84 }
  ];
  const upserted = upsertPortfolioHoldings(currentHoldings, scanned);
  assert.strictEqual(upserted.length, 3);
  
  const nvdaRemain = upserted.find(h => h.ticker === 'NVDA');
  assert.strictEqual(nvdaRemain.shares, 10);
  assert.strictEqual(nvdaRemain.costBasis, 1000);

  const rklbUpdated = upserted.find(h => h.ticker === 'RKLB');
  assert.strictEqual(rklbUpdated.shares, 100);
  assert.strictEqual(rklbUpdated.costBasis, 2226.78);

  const sofiAdded = upserted.find(h => h.ticker === 'SOFI');
  assert.strictEqual(sofiAdded.shares, 65);
  assert.strictEqual(sofiAdded.costBasis, 1784.80);

  // 1.14 AI Trade Slip Mapping & DCA projection
  const slipTrade = { action: 'buy', ticker: 'RKLB', shares: 25, price: 36.50 };
  const dcaResult = calculateWeightedAverageCost(rklbUpdated.shares, rklbUpdated.costBasis, slipTrade.shares, slipTrade.price);
  assert.strictEqual(dcaResult.shares, 125);
  assert.strictEqual(Math.round(dcaResult.costBasis * 100) / 100, 3139.28);
  assert.strictEqual(Math.round(dcaResult.avgCost * 100) / 100, 25.11);

  // 1.15 User DIME USD Screenshot Extraction (AMZN, NVDA, META, GOOG, LLY, MSFT)
  const userDimeRaw = [
    { ticker: 'AMZN', marketValue: 388.95, unrealizedPL: -5.22, unrealizedPLPct: -1.32, shares: 1.85, currentPrice: 210.24 },
    { ticker: 'NVDA', marketValue: 373.28, unrealizedPL: -65.24, unrealizedPLPct: -14.88, shares: 2.66, currentPrice: 140.33 },
    { ticker: 'META', marketValue: 366.09, unrealizedPL: 4.80, unrealizedPLPct: 1.33, shares: 0.62, currentPrice: 590.47 },
    { ticker: 'GOOG', marketValue: 355.69, unrealizedPL: 50.08, unrealizedPLPct: 16.39, shares: 1.98, currentPrice: 179.64 },
    { ticker: 'LLY', marketValue: 270.80, unrealizedPL: 80.04, unrealizedPLPct: 41.96, shares: 0.34, currentPrice: 796.47 },
    { ticker: 'MSFT', marketValue: 265.31, unrealizedPL: 56.70, unrealizedPLPct: 27.18, shares: 0.63, currentPrice: 421.13 }
  ];
  const computedUserDime = userDimeRaw.map(calculateDimeHoldingMetrics);
  assert.strictEqual(computedUserDime.length, 6);
  const amzn = computedUserDime.find(h => h.ticker === 'AMZN');
  assert.strictEqual(Math.round(amzn.costBasis * 100) / 100, 394.17);
  const lly = computedUserDime.find(h => h.ticker === 'LLY');
  assert.strictEqual(Math.round(lly.costBasis * 100) / 100, 190.76);
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.includes('id="btnClearAllPortfolio"'), 'Portfolio header should include clear all portfolio button');
  assert.ok(html.includes('id="btnPopupClearPortfolio"'), 'Portfolio 3D dialog should include clear portfolio button');
  assert.ok(html.includes('id="chkReplaceAllPortfolioOnImport"'), 'DIME verify dialog should include replace-all checkbox');
  assert.ok(html.includes('deletePortfolioHolding'), 'Bundle should include deletePortfolioHolding');
  assert.ok(html.includes('clearAllPortfolioHoldings'), 'Bundle should include clearAllPortfolioHoldings');
};


async function runServiceWorkerRegression() {
  const fs = require('fs'), vm = require('vm'), http = require('http');
  const { stripTypeScriptTypes } = require('node:module');
  const server = http.createServer((req, res) => { res.end(req.url.includes('index.html') ? fs.readFileSync('dist/index.html') : 'asset'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const variant of ['source', 'built']) {
      const old = 'slipsense-app-shell-v4-3d-cute-3-battery-v8', version = 'slipsense-app-shell-v4-3d-cute-3-dime-v9';
      const cache = new Map([[old, new Map()], ['another-app', new Map()]]), events = {};
      let skipped = 0, claimed = 0, failed = true;
      const context = {
        self: { location: { origin }, registration: { scope: origin + '/' }, addEventListener: (type, fn) => events[type] = fn,
          skipWaiting: async () => { skipped++; }, clients: { claim: async () => { claimed++; } } },
        caches: { keys: async () => [...cache.keys()], delete: async key => cache.delete(key), open: async key => {
          if (!cache.has(key)) cache.set(key, new Map());
          const entries = cache.get(key);
          return { put: async (asset, value) => entries.set(asset, value), match: async asset => entries.get(asset) };
        } },
        Request: class extends Request { constructor(url, options) { super(new URL(url, origin), options); } },
        Response, URL, fetch: request => failed ? Promise.resolve(new Response('', { status: 503 })) : fetch(request),
        indexedDB: { deleteDatabase() { throw Error('local data must survive'); }, open() { throw Error('no database access during update'); } }
      };
      vm.runInNewContext(variant === 'source' ? stripTypeScriptTypes(fs.readFileSync('src/sw.ts', 'utf8')) : fs.readFileSync('dist/sw.js', 'utf8'), context);
      let installation;
      events.install({ waitUntil: promise => installation = promise });
      await assert.rejects(installation); assert.equal(skipped, 0); assert(cache.has(old), 'failed installation retains old shell');
      failed = false; events.install({ waitUntil: promise => installation = promise }); await installation;
      assert.equal(skipped, 1); assert(cache.has(old), 'cleanup waits for activation');
      let activation; events.activate({ waitUntil: promise => activation = promise }); await activation;
      assert(!cache.has(old)); assert(cache.has(version)); assert(cache.has('another-app')); assert.equal(claimed, 1);
      const html = await cache.get(version).get('./index.html').text(); assert(html.includes('analyze_portfolio'));
      let reported; events.message({ data: { type: 'GET_VERSION' }, ports: [{ postMessage: data => reported = data.version }] });
      assert.equal(reported, version);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
}

async function runDimeImporterRegression() {
  const fs = require('fs'), vm = require('vm');
  const { stripTypeScriptTypes } = require('node:module');
  const { createBrowserSandbox } = require('../scripts/run_tests');
  const key = 'slipsense_stock_holdings_v1';
  const fixture = ticker => ({ ticker, marketValue: 150, unrealizedPL: 50, shares: 2, currentPrice: 75 });
  const response = holdings => ({ ok: true, data: { currency: 'USD', holdings } });
  for (const variant of ['source', 'built']) {
    function load() {
      const c = createBrowserSandbox(); c.document.readyState = 'loading';
      const html = fs.readFileSync('dist/index.html', 'utf8');
      const code = variant === 'source' ? stripTypeScriptTypes(fs.readFileSync('src/app.ts', 'utf8')) : [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('SlipSenseApp'));
      vm.runInContext(code, c);
      const api = c.SlipSenseApp, state = api.getState(), el = id => c.document.getElementById(id);
      state.currentUser = { id: 'owner' }; state.settings.supabaseUrl = 'https://example.supabase.co'; state.settings.supabaseAnonKey = 'public';
      state.supabaseClient = { auth: { getSession: async () => ({ data: { session: { access_token: 'test-jwt', user: { id: 'owner' } } } }) } };
      el('portfolioVerifyModal').hidden = true;
      let compressFailure = false, reads = 0;
      c.FileReader = class { readAsDataURL() { reads++; this.result = 'data:image/png;base64,' + 'A'.repeat(80); this.onload(); } };
      c.Image = class { constructor() { this.naturalWidth = 2000; this.naturalHeight = 1000; } set src(v) { if (v) queueMicrotask(() => compressFailure ? this.onerror() : this.onload()); } };
      const create = c.document.createElement;
      const rows = [];
      c.document.createElement = tag => {
        const node = create(tag);
        if (tag === 'canvas') node.toDataURL = () => 'data:image/jpeg;base64,' + 'B'.repeat(80);
        if (tag === 'div') {
          const fields = ['ticker', 'marketValue', 'costBasis', 'shares'].map(field => { const n = create('input'); n.setAttribute('data-field', field); return n; });
          const check = create('input'), summary = create('p');
          node.querySelector = selector => selector === '.verify-item-checkbox' ? check : summary;
          node.querySelectorAll = () => fields; node.fields = fields; node.check = check;
        }
        return node;
      };
      el('portfolioVerifyListContainer').appendChild = row => { rows.push(row); return row; };
      c.document.querySelectorAll = selector => selector.includes('portfolioVerifyListContainer') ? rows.map(row => row.check) : [];
      const calls = []; let replies = [response([fixture(' aapl ')])];
      c.fetch = async (url, options) => { calls.push({ url, options, payload: JSON.parse(options.body) }); const reply = replies.shift(); if (reply instanceof Error) throw reply; return { ok: reply?.status ? false : true, status: reply?.status || 200, json: async () => reply }; };
      api.bindStockPortfolioEvents();
      const upload = files => el('dimePortfolioFileInput').emit('change', { target: { files } });
      const image = { type: 'image/png', size: 100 };
      return { c, api, state, el, calls, rows, upload, image, reads: () => reads, replies: value => replies = value, failCompression: () => compressFailure = true };
    }
    {
      const h = load(), merged = new Map();
      h.api.mergeDimePortfolioResponse(merged, response(Array.from({ length: 23 }, (_, i) => fixture('S' + i))));
      h.api.mergeDimePortfolioResponse(merged, response([fixture(' s0 '), { ...fixture('S1'), marketValue: 200 }]));
      assert.equal(merged.size, 23); assert.equal(merged.get('S0').shares, 2); assert.equal(merged.get('S1').marketValue, 150); assert(merged.get('S1').conflict);
      const metrics = h.api.calculateDimeHoldingMetrics(fixture('A'));
      assert.equal(metrics.costBasis, 100); assert.equal(metrics.avgCost, 50); assert.equal(metrics.unrealizedPLPct, 50);
      assert.equal(h.api.calculateDimeHoldingMetrics({ ticker: 'A' }).shares, null);
      assert.equal(h.api.calculateDimeHoldingMetrics({ ticker: 'A', marketValue: 10, unrealizedPL: 10 }).unrealizedPLPct, null);
      assert.throws(() => h.api.validateDimeReview([{ ...metrics, shares: null }]));
      assert.throws(() => h.api.validateDimeReview([metrics, metrics]));
      for (const invalid of [null, response([]), response([{ ...fixture('A'), shares: 'bad' }]), { ok: true, data: { currency: 'THB', holdings: [fixture('A')] } }]) assert.throws(() => h.api.mergeDimePortfolioResponse(new Map(), invalid));
    }
    for (const replace of [false, true]) {
      const h = load(); h.c.localStorage.setItem(key, JSON.stringify([{ id: 'keep-id', ticker: 'AAPL', name: 'Apple', targetPct: 20, currency: 'USD', note: 'keep' }, { id: 'other', ticker: 'OTHER' }]));
      h.replies([response([fixture(' aapl ')]), response([fixture('AAPL'), fixture('MSFT')])]);
      await h.upload([h.image, h.image]);
      assert.equal(h.calls.length, 2);
      for (const call of h.calls) { assert.equal(call.payload.action, 'analyze_portfolio'); assert.equal(call.payload.imageBase64, 'B'.repeat(80)); assert.equal(call.payload.mimeType, 'image/jpeg'); assert.equal(call.options.headers.Authorization, 'Bearer test-jwt'); }
      assert.equal(h.rows.length, 2, h.el('dimeImportStatus').textContent); assert.equal(h.el('portfolioVerifyModal').hidden, false);
      await h.el('btnConfirmPortfolioVerify').emit('click'); assert.equal(JSON.parse(h.c.localStorage.getItem(key)).length, 2, 'review required');
      const shares = h.rows[0].fields[3]; shares.value = '4'; await shares.emit('input');
      h.rows.forEach(row => row.check.checked = true);
      h.el('chkReplaceAllPortfolioOnImport').checked = replace;
      await h.el('btnConfirmPortfolioVerify').emit('click');
      const saved = JSON.parse(h.c.localStorage.getItem(key)); assert.equal(saved.length, replace ? 2 : 3);
      const aapl = saved.find(row => row.ticker === 'AAPL'); assert.equal(aapl.id, 'keep-id'); assert.equal(aapl.shares, 4); assert.equal(aapl.avgCost, 25); assert.equal(aapl.note, 'keep');
      const before = h.c.localStorage.getItem(key); await h.el('btnConfirmPortfolioVerify').emit('click'); assert.equal(h.c.localStorage.getItem(key), before);
    }
    for (const failure of ['offline', 'auth', 'count', 'type', 'compression', 'network', 401, 403, 429, 500, 'malformed', 'empty']) {
      const h = load(); h.c.localStorage.setItem(key, '[]');
      let files = [h.image];
      if (failure === 'offline') h.c.navigator.onLine = false;
      if (failure === 'auth') h.state.currentUser = null;
      if (failure === 'count') files = Array(6).fill(h.image);
      if (failure === 'type') files = [{ type: 'text/plain' }];
      if (failure === 'compression') h.failCompression();
      if (failure === 'network') h.replies([Error('network')]);
      if (typeof failure === 'number') h.replies([{ status: failure }]);
      if (failure === 'malformed') h.replies([{}]);
      if (failure === 'empty') h.replies([response([])]);
      const pending = h.upload(files);
      if (failure === 'offline' || failure === 'auth') {
        const toast = h.el('toastStack').children.at(-1);
        assert(toast, 'error toast appears synchronously before upload settles');
        assert.equal(toast.children[0].textContent, h.el('dimeImportStatus').textContent);
      }
      await pending;
      assert.equal(h.el('portfolioVerifyModal').hidden, true, String(failure)); assert.equal(h.c.localStorage.getItem(key), '[]');
      assert.equal(h.el('dimePortfolioFileInput').value, ''); assert.equal(h.el('btnStartDimeImport').disabled, false);
      assert(/[ก-๙]/.test(h.el('dimeImportStatus').textContent));
      if (failure === 'offline' || failure === 'auth') {
        assert.equal(h.calls.length, 0, 'blocked import never calls AI');
        assert.equal(h.reads(), 0, 'blocked import never reads files');
        const toast = h.el('toastStack').children.at(-1);
        assert.equal(toast.className, 'toast error');
        assert.equal(toast.children[0].textContent, h.el('dimeImportStatus').textContent);
      }
    }
    {
      const h = load(); h.replies([response([fixture('A')]), Error('network')]); await h.upload([h.image, h.image]); assert.equal(h.rows.length, 0); assert.equal(h.el('portfolioVerifyModal').hidden, true);
    }
    {
      const h = load(); await h.upload([h.image]); h.rows.forEach(row => row.check.checked = true);
      const before = h.c.localStorage.getItem(key); const set = h.c.localStorage.setItem;
      h.c.localStorage.setItem = () => { throw Error('quota'); }; await h.el('btnConfirmPortfolioVerify').emit('click');
      assert.equal(h.c.localStorage.getItem(key), before); assert.equal(h.el('portfolioVerifyModal').hidden, false);
      h.c.localStorage.setItem = set; await h.el('btnConfirmPortfolioVerify').emit('click'); assert.equal(h.el('portfolioVerifyModal').hidden, true);
    }
    {
      const h = load(); let finish;
      h.c.fetch = () => new Promise(resolve => { finish = resolve; });
      const pending = h.upload([h.image]);
      for (let i = 0; i < 10 && !finish; i++) await new Promise(resolve => setImmediate(resolve));
      assert(finish); await h.upload([h.image]);
      await h.el('btnClosePortfolioImport').emit('click');
      finish({ ok: true, json: async () => response([fixture('A')]) }); await pending;
      assert.equal(h.rows.length, 0); assert.equal(h.el('portfolioVerifyModal').hidden, true);
    }
    {
      const h = load(); let finish;
      h.c.fetch = () => new Promise(resolve => { finish = resolve; });
      const pending = h.upload([h.image]);
      for (let i = 0; i < 10 && !finish; i++) await new Promise(resolve => setImmediate(resolve));
      h.state.currentUser = { id: 'other' };
      finish({ ok: true, json: async () => response([fixture('A')]) }); await pending;
      assert.equal(h.rows.length, 0, 'account switch ignores old result');
    }
    {
      const h = load(); h.replies([response([fixture('A'), fixture('B')])]); await h.upload([h.image]);
      const ticker = h.rows[1].fields[0]; ticker.value = ' a '; await ticker.emit('input'); h.rows.forEach(row => row.check.checked = true);
      h.c.localStorage.setItem(key, '[]'); await h.el('btnConfirmPortfolioVerify').emit('click');
      assert.equal(h.c.localStorage.getItem(key), '[]', 'edited duplicate rejected'); assert.equal(h.el('portfolioVerifyModal').hidden, false);
      ticker.value = 'B'; await ticker.emit('input');
      const cost = h.rows[0].fields[2]; cost.value = ''; await cost.emit('input'); h.rows.forEach(row => row.check.checked = true);
      await h.el('btnConfirmPortfolioVerify').emit('click'); assert.equal(h.c.localStorage.getItem(key), '[]', 'blank cost rejected');
      cost.value = '100'; await cost.emit('input'); h.rows.forEach(row => row.check.checked = true);
      h.c.localStorage.setItem(key, JSON.stringify([{ id: 'latest', ticker: 'NEW', shares: 1, costBasis: 1, avgCost: 1, currentPrice: 1, currency: 'USD' }]));
      await h.el('btnConfirmPortfolioVerify').emit('click'); assert(JSON.parse(h.c.localStorage.getItem(key)).some(row => row.id === 'latest'), 'read latest portfolio at confirm');
    }
    {
      const h = load(), events = {}, docEvents = {}, timers = [];
      let updates = 0, registrations = 0, reloads = 0, dialog = null;
      h.c.setTimeout = fn => { timers.push(fn); return timers.length; };
      h.c.document.querySelector = () => dialog;
      h.c.document.addEventListener = (type, fn) => { docEvents[type] = fn; };
      h.c.addEventListener = (type, fn) => { events[type] = fn; };
      h.c.location.reload = () => { reloads++; };
      h.c.navigator.serviceWorker = {
        controller: {}, addEventListener: (type, fn) => { events[type] = fn; },
        register: async (url, options) => {
          registrations++; assert.equal(url, './sw.js'); assert.equal(options.updateViaCache, 'none');
          return { update: async () => { updates++; if (updates === 3) throw Error('network'); } };
        }
      };
      await h.api.registerServiceWorkerSafe(); await h.api.registerServiceWorkerSafe();
      assert.equal(registrations, 1); assert.equal(updates, 1);
      h.c.document.hidden = true; await docEvents.visibilitychange(); assert.equal(updates, 1);
      h.c.document.hidden = false; await docEvents.visibilitychange(); assert.equal(updates, 2);
      await events.online(); assert.equal(updates, 3, 'update failure is harmless');
      h.c.navigator.onLine = false; await events.online(); assert.equal(updates, 3);
      h.c.navigator.onLine = true;
      h.state.isAnalyzingAi = true; events.controllerchange(); assert.equal(reloads, 0);
      h.state.isAnalyzingAi = false; dialog = {}; timers.shift()(); assert.equal(reloads, 0, 'review protects draft');
      dialog = null;
      const field = { isConnected: true, type: 'text', value: 'draft', defaultValue: '', matches: () => true };
      docEvents.input({ target: field }); timers.shift()(); assert.equal(reloads, 0, 'unsaved field protects draft');
      field.value = ''; timers.shift()(); assert.equal(reloads, 1);
      events.controllerchange(); await events.online(); assert.equal(reloads, 1, 'single reload');
      const fresh = load(); let controllerChange;
      fresh.c.navigator.serviceWorker = { controller: null, addEventListener: (_, fn) => controllerChange = fn, register: async () => ({ update: async () => {} }) };
      fresh.c.location.reload = () => { throw Error('first install must not reload'); };
      fresh.c.document.querySelector = () => null;
      await fresh.api.registerServiceWorkerSafe(); controllerChange();
    }
    console.log('  [PASS] DIME importer ' + variant + ': payload, 23 holdings, review, atomic storage, cancellation, 12 failure paths and safe PWA updates');
  }
}
