/**
 * Arbitrage Calculator
 *
 * Calculates arbitrage opportunities between matched market pairs.
 */
import type { MarketPair } from '../matching/market-matcher.js';
export interface ArbitrageOpportunity {
    pair: MarketPair;
    type: 'simple' | 'guaranteed';
    profitPct: number;
    action: string;
    guaranteedProfit?: number;
}
/**
 * Calculate arbitrage opportunity for a market pair.
 *
 * @param pair The matched market pair
 * @returns ArbitrageOpportunity if spread is significant, null otherwise
 */
export declare function calculateArbitrage(pair: MarketPair): ArbitrageOpportunity | null;
/**
 * Calculate all arbitrage opportunities from a list of market pairs.
 *
 * @param pairs List of matched market pairs
 * @returns Array of arbitrage opportunities sorted by profit potential
 */
export declare function findArbitrageOpportunities(pairs: MarketPair[]): ArbitrageOpportunity[];
/**
 * Create opportunities for ALL market pairs, including those without significant spreads.
 * This is used to display all matched markets in the frontend.
 *
 * @param pairs List of matched market pairs
 * @returns Array of all opportunities (with or without arbitrage potential)
 */
export declare function createOpportunitiesFromAllPairs(pairs: MarketPair[]): ArbitrageOpportunity[];
/**
 * Summarize arbitrage opportunities.
 */
export declare function summarizeOpportunities(opportunities: ArbitrageOpportunity[]): {
    total: number;
    guaranteed: number;
    simple: number;
    avgSpreadPct: number;
    maxSpreadPct: number;
};
