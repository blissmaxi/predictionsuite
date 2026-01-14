/**
 * Polymarket API Type Definitions
 * Based on Gamma API and CLOB API documentation
 */

// ============ Gamma API Types ============

export interface PolymarketEvent {
  id: string;
  ticker: string;
  slug: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  new: boolean;
  featured: boolean;
  restricted: boolean;
  liquidity: number;
  volume: number;
  openInterest: number;
  commentCount: number;
  markets: PolymarketMarket[];
  tags?: PolymarketTag[];
}

export interface PolymarketMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  endDate: string;
  description?: string;
  outcomes: string; // JSON string: "[\"Yes\", \"No\"]"
  outcomePrices: string; // JSON string: "[\"0.45\", \"0.55\"]"
  volume: string; // String number
  volumeNum?: number;
  liquidity: string;
  liquidityNum?: number;
  active: boolean;
  closed: boolean;
  archived: boolean;
  acceptingOrders?: boolean;
  clobTokenIds: string; // JSON string: "[\"tokenId1\", \"tokenId2\"]"
  createdAt: string;
  updatedAt: string;
  new?: boolean;
  featured?: boolean;
  restricted?: boolean;
  negRisk?: boolean;
  events?: PolymarketEvent[];
}

// Parsed/normalized market for internal use
export interface ParsedPolymarketMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  endDate: string;
  outcomes: string[];
  outcomePrices: number[];
  volume: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  clobTokenIds: string[];
}

export interface PolymarketTag {
  id: string;
  label: string;
  slug: string;
}

// ============ CLOB API Types ============

export interface ClobOrderBook {
  market: string;
  asset_id: string;
  hash: string;
  timestamp: string;
  bids: ClobOrderBookLevel[];
  asks: ClobOrderBookLevel[];
  min_order_size?: string;
  tick_size?: string;
  neg_risk?: boolean;
  last_trade_price?: string;
}

export interface ClobOrderBookLevel {
  price: string; // Price as string (0-1)
  size: string; // Size in shares
}

export interface ClobPrice {
  tokenId: string;
  price: string;
  side: 'buy' | 'sell';
}

export interface ClobMidpoint {
  mid: string; // Midpoint price as string
}

export interface ClobMarketInfo {
  conditionId: string;
  questionId: string;
  tokens: ClobToken[];
  minOrderSize: string;
  tickSize: string;
}

export interface ClobToken {
  tokenId: string;
  outcome: string; // "Yes" or "No"
  price: string;
}

// ============ API Response Wrappers ============

export interface GammaEventsResponse {
  events: PolymarketEvent[];
  pagination?: {
    limit: number;
    offset: number;
    count: number;
  };
}

export interface GammaMarketsResponse {
  markets: PolymarketMarket[];
}

// ============ Explorer Output Types ============

export interface MarketSummary {
  id: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  active: boolean;
  clobTokenIds: string[];
}

export interface EventSummary {
  id: string;
  title: string;
  slug: string;
  marketCount: number;
  totalVolume: number;
  totalLiquidity: number;
  markets: MarketSummary[];
}
