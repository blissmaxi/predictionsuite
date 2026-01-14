/**
 * Liquidity Analyzer
 *
 * Analyzes order book depth to determine the maximum executable size
 * of an arbitrage opportunity before the spread disappears.
 *
 * Key insight: The "spread" shown from last trade prices may differ
 * significantly from the actual executable spread in the order book.
 */
import type { UnifiedOrderBook } from '../orderbook/fetcher.js';
import type { ArbitrageOpportunity } from './calculator.js';
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
export type LimitingFactor = 'polymarket_liquidity' | 'kalshi_liquidity' | 'spread_exhausted' | 'spread_closed' | 'no_liquidity';
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
export declare function analyzeLiquidity(opportunity: ArbitrageOpportunity, polyOrderBook: UnifiedOrderBook, kalshiOrderBook: UnifiedOrderBook, options?: LiquidityOptions): LiquidityAnalysis;
/**
 * Format liquidity analysis for console display.
 */
export declare function formatLiquidityAnalysis(analysis: LiquidityAnalysis): string;
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
export declare function summarizeLiquidity(analyses: LiquidityAnalysis[]): LiquiditySummary;
