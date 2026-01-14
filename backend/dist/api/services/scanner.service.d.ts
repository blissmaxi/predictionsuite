/**
 * Scanner Service
 *
 * Orchestrates the full arbitrage scanning pipeline.
 * Wraps the existing scanner logic for use by the API.
 */
import { type MarketPair, type MarketData } from '../../matching/market-matcher.js';
import { type ArbitrageOpportunity } from '../../arbitrage/calculator.js';
import { type LiquidityAnalysis } from '../../arbitrage/liquidity-analyzer.js';
export interface MatchedEvent {
    name: string;
    category: string;
    type: string;
    polymarketSlug: string;
    kalshiTicker: string;
    kalshiSeries?: string;
    kalshiImageUrl?: string;
    date?: Date;
    polymarket: {
        found: boolean;
        title?: string;
        markets?: MarketData[];
    };
    kalshi: {
        found: boolean;
        title?: string;
        markets?: MarketData[];
    };
    marketPairs?: MarketPair[];
}
export interface OpportunityWithLiquidity {
    opportunity: ArbitrageOpportunity;
    liquidity: LiquidityAnalysis | null;
}
export interface ScanResult {
    events: MatchedEvent[];
    opportunities: OpportunityWithLiquidity[];
    scannedAt: Date;
}
export declare function runScan(forceRefresh?: boolean): Promise<ScanResult>;
export declare function getCachedResult(): ScanResult | null;
