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
