/**
 * Liquidity Analyzer
 *
 * Analyzes order book depth to determine the maximum executable size
 * of an arbitrage opportunity before the spread disappears.
 *
 * Key insight: The "spread" shown from last trade prices may differ
 * significantly from the actual executable spread in the order book.
 */

import type { UnifiedOrderBook, OrderBookLevel } from '../orderbook/fetcher.js';
import type { ArbitrageOpportunity } from './calculator.js';

// ============ Types ============

/** Details of a single price level in the liquidity analysis */
export interface LiquidityLevel {
  /** Contracts available at this price combination */
  contracts: number;
  /** Polymarket YES ask price (0-1) */
  polyPrice: number;
  /** Kalshi NO ask price (0-1) */
  kalshiPrice: number;
  /** Total cost per contract (polyPrice + kalshiPrice) */
  costPerContract: number;
  /** Net profit per contract after fees */
  profitPerContract: number;
  /** Running total of contracts through this level */
  cumulativeContracts: number;
  /** Running total cost through this level */
  cumulativeCost: number;
  /** Running total profit through this level */
  cumulativeProfit: number;
}

/** What factor is limiting the arbitrage opportunity */
export type LimitingFactor =
  | 'polymarket_liquidity'  // Polymarket order book exhausted first
  | 'kalshi_liquidity'      // Kalshi order book exhausted first
  | 'spread_exhausted'      // Prices converged, no more profit
  | 'spread_closed'         // Order book prices already unfavorable
  | 'no_liquidity';         // One or both order books are empty

/** Complete analysis of an arbitrage opportunity's liquidity */
export interface LiquidityAnalysis {
  /** The original arbitrage opportunity */
  opportunity: ArbitrageOpportunity;

  /** Maximum contracts that can be executed profitably */
  maxContracts: number;
  /** Total investment required for max contracts */
  maxInvestment: number;
  /** Total profit at max contracts */
  maxProfit: number;
  /** Average profit percentage across all levels */
  avgProfitPct: number;

  /** Breakdown by price level */
  levels: LiquidityLevel[];

  /** What's limiting the opportunity */
  limitedBy: LimitingFactor;

  /** Total depth on Polymarket side */
  polymarketDepth: number;
  /** Total depth on Kalshi side */
  kalshiDepth: number;

  /** Best Polymarket YES ask price (for diagnostics) */
  bestPolyAsk?: number;
  /** Best Kalshi NO ask price (for diagnostics) */
  bestKalshiAsk?: number;
  /** Sum of best asks (cost to execute 1 contract) */
  orderBookCost?: number;
}

/** Options for liquidity analysis */
export interface LiquidityOptions {
  /** Polymarket fee as decimal (e.g., 0.02 for 2%) */
  polymarketFee?: number;
  /** Kalshi fee as decimal (e.g., 0.01 for 1%) */
  kalshiFee?: number;
  /** Minimum profit percentage to continue (default: 0) */
  minProfitPct?: number;
}

// ============ Main Analysis ============

/**
 * Analyze the executable liquidity of an arbitrage opportunity.
 *
 * Strategy: Buy Polymarket YES + Buy Kalshi NO
 * - Walks through both order books simultaneously
 * - Consumes liquidity at each price level
 * - Stops when cost >= $1 (no more profit)
 *
 * @param opportunity - The arbitrage opportunity to analyze
 * @param polyOrderBook - Polymarket order book
 * @param kalshiOrderBook - Kalshi order book
 * @param options - Fee and threshold configuration
 */
export function analyzeLiquidity(
  opportunity: ArbitrageOpportunity,
  polyOrderBook: UnifiedOrderBook,
  kalshiOrderBook: UnifiedOrderBook,
  options: LiquidityOptions = {}
): LiquidityAnalysis {
  const { polymarketFee = 0, kalshiFee = 0, minProfitPct = 0 } = options;
  const totalFees = polymarketFee + kalshiFee;
  const minProfitThreshold = minProfitPct / 100;

  // Get the relevant order book sides for this strategy
  const polyAsks = [...polyOrderBook.yesAsks];
  const kalshiAsks = [...kalshiOrderBook.noAsks];

  // Calculate total available depth
  const polymarketDepth = sumLevels(polyAsks);
  const kalshiDepth = sumLevels(kalshiAsks);

  // Early return: no liquidity
  if (polyAsks.length === 0 || kalshiAsks.length === 0) {
    return createNoLiquidityResult(opportunity, polymarketDepth, kalshiDepth);
  }

  // Check if spread is already closed at best prices
  const bestPolyAsk = polyAsks[0].price;
  const bestKalshiAsk = kalshiAsks[0].price;
  const orderBookCost = bestPolyAsk + bestKalshiAsk;
  const initialProfit = 1 - orderBookCost - totalFees;

  if (initialProfit <= minProfitThreshold) {
    return createSpreadClosedResult(
      opportunity,
      polymarketDepth,
      kalshiDepth,
      bestPolyAsk,
      bestKalshiAsk,
      orderBookCost
    );
  }

  // Walk through order books and accumulate profitable trades
  const { levels, totalContracts, totalCost, totalProfit, limitedBy } =
    walkOrderBooks(polyAsks, kalshiAsks, totalFees, minProfitThreshold);

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

// ============ Order Book Walking ============

interface WalkResult {
  levels: LiquidityLevel[];
  totalContracts: number;
  totalCost: number;
  totalProfit: number;
  limitedBy: LimitingFactor;
}

/**
 * Walk through both order books, matching liquidity at each level.
 */
function walkOrderBooks(
  polyAsks: OrderBookLevel[],
  kalshiAsks: OrderBookLevel[],
  totalFees: number,
  minProfitThreshold: number
): WalkResult {
  const levels: LiquidityLevel[] = [];
  let totalContracts = 0;
  let totalCost = 0;
  let totalProfit = 0;

  let polyIdx = 0;
  let kalshiIdx = 0;
  let polyRemaining = polyAsks[0]?.size || 0;
  let kalshiRemaining = kalshiAsks[0]?.size || 0;

  while (polyIdx < polyAsks.length && kalshiIdx < kalshiAsks.length) {
    const polyLevel = polyAsks[polyIdx];
    const kalshiLevel = kalshiAsks[kalshiIdx];

    const costPerContract = polyLevel.price + kalshiLevel.price;
    const profitPerContract = 1 - costPerContract - totalFees;

    // Stop if no longer profitable
    if (profitPerContract <= minProfitThreshold) {
      break;
    }

    // Take the minimum available from both sides
    const available = Math.min(polyRemaining, kalshiRemaining);

    if (available > 0) {
      totalContracts += available;
      totalCost += available * costPerContract;
      totalProfit += available * profitPerContract;

      levels.push({
        contracts: available,
        polyPrice: polyLevel.price,
        kalshiPrice: kalshiLevel.price,
        costPerContract,
        profitPerContract,
        cumulativeContracts: totalContracts,
        cumulativeCost: totalCost,
        cumulativeProfit: totalProfit,
      });

      polyRemaining -= available;
      kalshiRemaining -= available;
    }

    // Advance to next level if current is exhausted
    if (polyRemaining <= 0) {
      polyIdx++;
      polyRemaining = polyAsks[polyIdx]?.size || 0;
    }
    if (kalshiRemaining <= 0) {
      kalshiIdx++;
      kalshiRemaining = kalshiAsks[kalshiIdx]?.size || 0;
    }
  }

  const limitedBy = determineLimitingFactor(
    totalContracts,
    polyIdx,
    kalshiIdx,
    polyAsks.length,
    kalshiAsks.length
  );

  return { levels, totalContracts, totalCost, totalProfit, limitedBy };
}

/**
 * Determine what factor limited the arbitrage opportunity.
 */
function determineLimitingFactor(
  totalContracts: number,
  polyIdx: number,
  kalshiIdx: number,
  polyLength: number,
  kalshiLength: number
): LimitingFactor {
  if (totalContracts === 0) {
    return 'no_liquidity';
  }
  if (polyIdx >= polyLength && kalshiIdx < kalshiLength) {
    return 'polymarket_liquidity';
  }
  if (kalshiIdx >= kalshiLength && polyIdx < polyLength) {
    return 'kalshi_liquidity';
  }
  return 'spread_exhausted';
}

// ============ Result Builders ============

function createNoLiquidityResult(
  opportunity: ArbitrageOpportunity,
  polymarketDepth: number,
  kalshiDepth: number
): LiquidityAnalysis {
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

function createSpreadClosedResult(
  opportunity: ArbitrageOpportunity,
  polymarketDepth: number,
  kalshiDepth: number,
  bestPolyAsk: number,
  bestKalshiAsk: number,
  orderBookCost: number
): LiquidityAnalysis {
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

// ============ Summary ============

/** Summary statistics for multiple liquidity analyses */
export interface LiquiditySummary {
  totalOpportunities: number;
  withLiquidity: number;
  totalDeployableCapital: number;
  totalPotentialProfit: number;
  avgProfitPct: number;
  over100: number;
  over1000: number;
}

/**
 * Summarize multiple liquidity analyses.
 */
export function summarizeLiquidity(analyses: LiquidityAnalysis[]): LiquiditySummary {
  const withLiquidity = analyses.filter((a) => a.maxContracts > 0);
  const totalDeployableCapital = withLiquidity.reduce((sum, a) => sum + a.maxInvestment, 0);
  const totalPotentialProfit = withLiquidity.reduce((sum, a) => sum + a.maxProfit, 0);

  return {
    totalOpportunities: analyses.length,
    withLiquidity: withLiquidity.length,
    totalDeployableCapital,
    totalPotentialProfit,
    avgProfitPct: totalDeployableCapital > 0
      ? (totalPotentialProfit / totalDeployableCapital) * 100
      : 0,
    over100: withLiquidity.filter((a) => a.maxInvestment >= 100).length,
    over1000: withLiquidity.filter((a) => a.maxInvestment >= 1000).length,
  };
}

// ============ Helpers ============

function sumLevels(levels: OrderBookLevel[]): number {
  return levels.reduce((sum, l) => sum + l.size, 0);
}
