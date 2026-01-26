/**
 * Arbitrage Engine Types
 *
 * Shared types for the real-time arbitrage detection system.
 */

// ============ Platforms ============

export type Platform = 'kalshi' | 'polymarket';

// ============ Price Level ============

export interface PriceLevel {
  price: number; // 0-1 probability
  size: number; // quantity available
}

// ============ Normalized Orderbook ============

/**
 * Platform-agnostic orderbook representation.
 * All prices normalized to 0-1 probability scale.
 * Shows the prices to BUY each outcome.
 */
export interface NormalizedOrderbook {
  platform: Platform;
  marketId: string; // Kalshi ticker or Polymarket assetId
  yesAsks: PriceLevel[]; // Price to buy YES, sorted ascending (best first)
  noAsks: PriceLevel[]; // Price to buy NO, sorted ascending (best first)
  updatedAt: Date;
}

// ============ Market Pair Mapping ============

/**
 * Maps a market across Kalshi and Polymarket platforms.
 */
export interface MarketPairMapping {
  id: string; // Unique identifier for this pair
  kalshiTicker: string; // e.g., "KXNFLGAME-26JAN18HOUNE-NE"
  polymarketYesToken: string; // Token ID for YES outcome
  polymarketNoToken: string; // Token ID for NO outcome
  description?: string; // Human-readable description
}

// ============ Arbitrage Opportunity ============

export type ArbitrageType = 'guaranteed' | 'spread';

/**
 * Represents a detected arbitrage opportunity.
 */
export interface ArbitrageOpportunity {
  pairId: string; // Reference to MarketPairMapping.id
  type: ArbitrageType;
  spreadPercent: number; // Positive = profit opportunity
  buyYesPlatform: Platform;
  buyYesPrice: number; // 0-1
  buyNoPlatform: Platform;
  buyNoPrice: number; // 0-1
  maxContracts: number; // Limited by liquidity
  potentialProfit: number; // Per contract
  detectedAt: Date;
}

// ============ Engine Configuration ============

export interface ArbitrageEngineConfig {
  pairs: MarketPairMapping[];
  minSpreadPercent?: number; // Default: 2
  debounceMs?: number; // Default: 100
}

// ============ Engine Events ============

export interface ArbitrageEngineEvents {
  connected: (platform: Platform) => void;
  disconnected: (platform: Platform, code: number, reason: string) => void;
  error: (error: Error) => void;
  orderbook_update: (platform: Platform, marketId: string, orderbook: NormalizedOrderbook) => void;
  opportunity: (opportunity: ArbitrageOpportunity) => void;
  opportunity_closed: (pairId: string) => void;
}
