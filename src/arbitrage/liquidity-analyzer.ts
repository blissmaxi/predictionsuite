/**
 * Liquidity Analyzer
 *
 * Analyzes order book depth to determine the maximum size of an
 * arbitrage opportunity before the spread disappears.
 */

import type { UnifiedOrderBook, OrderBookLevel } from '../orderbook/fetcher.js';
import type { ArbitrageOpportunity } from './calculator.js';

// ============ Types ============

export interface LiquidityLevel {
  contracts: number;
  polyPrice: number;
  kalshiPrice: number;
  costPerContract: number;
  profitPerContract: number;
  cumulativeContracts: number;
  cumulativeCost: number;
  cumulativeProfit: number;
}

export interface LiquidityAnalysis {
  opportunity: ArbitrageOpportunity;

  // Maximum position before arb exhausts
  maxContracts: number;
  maxInvestment: number;
  maxProfit: number;
  avgProfitPct: number;

  // Breakdown by price level
  levels: LiquidityLevel[];

  // What's limiting the opportunity
  limitedBy: 'polymarket_liquidity' | 'kalshi_liquidity' | 'spread_exhausted' | 'spread_closed' | 'no_liquidity';

  // Depth info
  polymarketDepth: number;
  kalshiDepth: number;

  // Best order book prices (for diagnostics when spread is closed)
  bestPolyAsk?: number;
  bestKalshiAsk?: number;
  orderBookCost?: number;  // bestPolyAsk + bestKalshiAsk
}

export interface LiquidityOptions {
  polymarketFee?: number;  // Default: 0 (fees vary by market)
  kalshiFee?: number;      // Default: 0 (fees vary by market)
  minProfitPct?: number;   // Stop when profit drops below this (default: 0)
}

// ============ Analyzer ============

/**
 * Analyze the liquidity/capacity of an arbitrage opportunity.
 *
 * For guaranteed arb (Poly YES + Kalshi NO < $1):
 * - Buy from Polymarket YES asks
 * - Buy from Kalshi NO asks
 *
 * Walk through both order books, consuming levels until cost >= $1.
 */
export function analyzeLiquidity(
  opportunity: ArbitrageOpportunity,
  polyOrderBook: UnifiedOrderBook,
  kalshiOrderBook: UnifiedOrderBook,
  options: LiquidityOptions = {}
): LiquidityAnalysis {
  const {
    polymarketFee = 0,
    kalshiFee = 0,
    minProfitPct = 0,
  } = options;

  // Determine which sides to use based on the arb strategy
  // For guaranteed arb: we buy Poly YES + Kalshi NO
  // So we need Poly YES asks and Kalshi NO asks
  const polyAsks = [...polyOrderBook.yesAsks];
  const kalshiAsks = [...kalshiOrderBook.noAsks];

  // Track totals
  let totalContracts = 0;
  let totalCost = 0;
  let totalProfit = 0;
  const levels: LiquidityLevel[] = [];

  // Calculate depths
  const polymarketDepth = polyAsks.reduce((sum, l) => sum + l.size, 0);
  const kalshiDepth = kalshiAsks.reduce((sum, l) => sum + l.size, 0);

  // Handle no liquidity case (empty order books)
  if (polyAsks.length === 0 || kalshiAsks.length === 0) {
    return {
      opportunity,
      maxContracts: 0,
      maxInvestment: 0,
      maxProfit: 0,
      avgProfitPct: 0,
      levels: [],
      limitedBy: 'no_liquidity',
      polymarketDepth,
      kalshiDepth,
    };
  }

  // Get best order book prices for diagnostics
  const bestPolyAsk = polyAsks[0].price;
  const bestKalshiAsk = kalshiAsks[0].price;
  const orderBookCost = bestPolyAsk + bestKalshiAsk;

  // Check if spread is closed (order book prices make arb unprofitable)
  const initialGrossProfit = 1 - orderBookCost;
  const initialNetProfit = initialGrossProfit - (polymarketFee + kalshiFee);
  if (initialNetProfit <= minProfitPct / 100) {
    return {
      opportunity,
      maxContracts: 0,
      maxInvestment: 0,
      maxProfit: 0,
      avgProfitPct: 0,
      levels: [],
      limitedBy: 'spread_closed',
      polymarketDepth,
      kalshiDepth,
      bestPolyAsk,
      bestKalshiAsk,
      orderBookCost,
    };
  }

  // Walk through order books
  let polyIdx = 0;
  let kalshiIdx = 0;
  let polyRemaining = polyAsks[0]?.size || 0;
  let kalshiRemaining = kalshiAsks[0]?.size || 0;

  while (polyIdx < polyAsks.length && kalshiIdx < kalshiAsks.length) {
    const polyLevel = polyAsks[polyIdx];
    const kalshiLevel = kalshiAsks[kalshiIdx];

    // Cost to buy 1 contract of each
    const costPerContract = polyLevel.price + kalshiLevel.price;

    // Profit per contract (payout is always $1)
    const grossProfit = 1 - costPerContract;
    const netProfit = grossProfit - (polymarketFee + kalshiFee);

    // Check if still profitable
    if (netProfit <= minProfitPct / 100) {
      break;
    }

    // How many can we buy at this level?
    const available = Math.min(polyRemaining, kalshiRemaining);

    if (available > 0) {
      totalContracts += available;
      totalCost += available * costPerContract;
      totalProfit += available * netProfit;

      levels.push({
        contracts: available,
        polyPrice: polyLevel.price,
        kalshiPrice: kalshiLevel.price,
        costPerContract,
        profitPerContract: netProfit,
        cumulativeContracts: totalContracts,
        cumulativeCost: totalCost,
        cumulativeProfit: totalProfit,
      });

      // Consume from order books
      polyRemaining -= available;
      kalshiRemaining -= available;
    }

    // Move to next level if exhausted
    if (polyRemaining <= 0) {
      polyIdx++;
      polyRemaining = polyAsks[polyIdx]?.size || 0;
    }
    if (kalshiRemaining <= 0) {
      kalshiIdx++;
      kalshiRemaining = kalshiAsks[kalshiIdx]?.size || 0;
    }
  }

  // Determine limiting factor
  let limitedBy: LiquidityAnalysis['limitedBy'];
  if (totalContracts === 0) {
    limitedBy = 'no_liquidity';
  } else if (polyIdx >= polyAsks.length && kalshiIdx < kalshiAsks.length) {
    limitedBy = 'polymarket_liquidity';
  } else if (kalshiIdx >= kalshiAsks.length && polyIdx < polyAsks.length) {
    limitedBy = 'kalshi_liquidity';
  } else {
    limitedBy = 'spread_exhausted';
  }

  return {
    opportunity,
    maxContracts: totalContracts,
    maxInvestment: totalCost,
    maxProfit: totalProfit,
    avgProfitPct: totalContracts > 0 ? (totalProfit / totalCost) * 100 : 0,
    levels,
    limitedBy,
    polymarketDepth,
    kalshiDepth,
    bestPolyAsk,
    bestKalshiAsk,
    orderBookCost,
  };
}

/**
 * Format liquidity analysis for display.
 */
export function formatLiquidityAnalysis(analysis: LiquidityAnalysis): string {
  const lines: string[] = [];

  if (analysis.maxContracts === 0) {
    if (analysis.limitedBy === 'spread_closed') {
      // Show detailed info about why the spread is closed
      lines.push(`  Spread closed at order book prices`);
      if (analysis.bestPolyAsk !== undefined && analysis.bestKalshiAsk !== undefined) {
        lines.push(`    Poly YES ask: ${formatCents(analysis.bestPolyAsk)} + Kalshi NO ask: ${formatCents(analysis.bestKalshiAsk)} = ${formatCents(analysis.orderBookCost!)}`);
        const loss = (analysis.orderBookCost! - 1) * 100;
        lines.push(`    Execution would lose ${loss.toFixed(1)}%`);
      }
      lines.push(`    (Last trade prices showed profit, but order book has moved)`);
    } else if (analysis.limitedBy === 'no_liquidity') {
      lines.push(`  No liquidity (empty order book)`);
      lines.push(`    Polymarket depth: ${analysis.polymarketDepth.toFixed(0)} contracts`);
      lines.push(`    Kalshi depth: ${analysis.kalshiDepth.toFixed(0)} contracts`);
    } else {
      lines.push(`  No executable arbitrage`);
    }
    return lines.join('\n');
  }

  lines.push(`  Max Contracts: ${analysis.maxContracts.toLocaleString()}`);
  lines.push(`  Max Investment: $${analysis.maxInvestment.toFixed(2)}`);
  lines.push(`  Max Profit: $${analysis.maxProfit.toFixed(2)} (${analysis.avgProfitPct.toFixed(2)}%)`);
  lines.push(`  Limited by: ${formatLimitedBy(analysis.limitedBy)}`);

  if (analysis.levels.length > 0 && analysis.levels.length <= 5) {
    lines.push('');
    lines.push('  Price Levels:');
    for (const level of analysis.levels) {
      const pct = (level.profitPerContract * 100).toFixed(1);
      lines.push(`    ${level.contracts} @ Poly ${formatCents(level.polyPrice)} + Kalshi ${formatCents(level.kalshiPrice)} = ${pct}% profit`);
    }
  } else if (analysis.levels.length > 5) {
    lines.push('');
    lines.push(`  Price Levels: ${analysis.levels.length} levels (showing first 3)`);
    for (const level of analysis.levels.slice(0, 3)) {
      const pct = (level.profitPerContract * 100).toFixed(1);
      lines.push(`    ${level.contracts} @ Poly ${formatCents(level.polyPrice)} + Kalshi ${formatCents(level.kalshiPrice)} = ${pct}% profit`);
    }
  }

  return lines.join('\n');
}

function formatCents(price: number): string {
  return (price * 100).toFixed(1) + '¢';
}

function formatLimitedBy(limitedBy: LiquidityAnalysis['limitedBy']): string {
  switch (limitedBy) {
    case 'polymarket_liquidity':
      return 'Polymarket liquidity';
    case 'kalshi_liquidity':
      return 'Kalshi liquidity';
    case 'spread_exhausted':
      return 'Spread exhausted (prices converged)';
    case 'spread_closed':
      return 'Spread closed (order book prices unfavorable)';
    case 'no_liquidity':
      return 'No liquidity (empty order book)';
  }
}

/**
 * Summarize multiple liquidity analyses.
 */
export function summarizeLiquidity(analyses: LiquidityAnalysis[]): {
  totalOpportunities: number;
  withLiquidity: number;
  totalDeployableCapital: number;
  totalPotentialProfit: number;
  avgProfitPct: number;
  over100: number;
  over1000: number;
} {
  const withLiquidity = analyses.filter(a => a.maxContracts > 0);
  const totalDeployableCapital = withLiquidity.reduce((sum, a) => sum + a.maxInvestment, 0);
  const totalPotentialProfit = withLiquidity.reduce((sum, a) => sum + a.maxProfit, 0);

  return {
    totalOpportunities: analyses.length,
    withLiquidity: withLiquidity.length,
    totalDeployableCapital,
    totalPotentialProfit,
    avgProfitPct: totalDeployableCapital > 0 ? (totalPotentialProfit / totalDeployableCapital) * 100 : 0,
    over100: withLiquidity.filter(a => a.maxInvestment >= 100).length,
    over1000: withLiquidity.filter(a => a.maxInvestment >= 1000).length,
  };
}
