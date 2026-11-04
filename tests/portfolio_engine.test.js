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
};
