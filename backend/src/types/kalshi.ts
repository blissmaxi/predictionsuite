/**
 * Kalshi API Type Definitions
 * Based on https://api.elections.kalshi.com/trade-api/v2
 */

// ============ Event Types ============

export interface KalshiEvent {
  event_ticker: string;
  series_ticker: string;
  title: string;
  sub_title: string;
  category: string;
  mutually_exclusive: boolean;
  available_on_brokers: boolean;
  collateral_return_type: string;
  strike_period: string;
}

export interface KalshiEventWithMarkets {
  event: KalshiEvent;
  markets: KalshiMarket[];
}

// ============ Market Types ============

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle: string;
  status: 'active' | 'closed' | 'settled' | 'unopened';
  market_type: 'binary';

  // Pricing (in cents, 0-100)
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;

  // Pricing (in dollars, for convenience)
  yes_bid_dollars: string;
  yes_ask_dollars: string;
  no_bid_dollars: string;
  no_ask_dollars: string;
  last_price_dollars: string;

  // Volume & Liquidity
  volume: number;
  volume_24h: number;
  liquidity: number;
  liquidity_dollars: string;
  open_interest: number;

  // Timing
  open_time: string;
  close_time: string;
  expiration_time: string;
  expected_expiration_time: string;
  latest_expiration_time: string;
  created_time: string;

  // Resolution
  result: string;
  rules_primary: string;
  rules_secondary: string;
  early_close_condition?: string;
  can_close_early: boolean;
  settlement_timer_seconds: number;

  // Price structure
  tick_size: number;
  notional_value: number;
  notional_value_dollars: string;
  price_level_structure: 'linear_cent' | 'deci_cent';
  price_ranges: KalshiPriceRange[];
  response_price_units: string;

  // Subtitles for YES/NO outcomes
  yes_sub_title: string;
  no_sub_title: string;

  // Previous prices (for change tracking)
  previous_price: number;
  previous_price_dollars: string;
  previous_yes_ask: number;
  previous_yes_ask_dollars: string;
  previous_yes_bid: number;
  previous_yes_bid_dollars: string;

  // Multivariate event fields (optional)
  mve_collection_ticker?: string;
  mve_selected_legs?: KalshiMveLeg[];
  custom_strike?: Record<string, string>;
  strike_type?: string;
}

export interface KalshiPriceRange {
  start: string;
  end: string;
  step: string;
}

export interface KalshiMveLeg {
  event_ticker: string;
  market_ticker: string;
  side: 'yes' | 'no';
}

// ============ Series Types ============

export interface KalshiSeries {
  ticker: string;
  title: string;
  category: string;
  frequency: string;
  fee_type: string;
  fee_multiplier: number;
  tags: string[] | null;
  settlement_sources: KalshiSettlementSource[];
  contract_url: string;
  contract_terms_url: string;
  additional_prohibitions: string[] | null;
}

export interface KalshiSettlementSource {
  name: string;
  url: string;
}

// ============ Order Book Types ============

export interface KalshiOrderBook {
  orderbook: {
    yes: KalshiOrderBookLevel[] | null;
    no: KalshiOrderBookLevel[] | null;
    yes_dollars: KalshiOrderBookLevelDollars[] | null;
    no_dollars: KalshiOrderBookLevelDollars[] | null;
  };
}

// [price_cents, quantity]
export type KalshiOrderBookLevel = [number, number];

// ["price_dollars", quantity]
export type KalshiOrderBookLevelDollars = [string, number];

// ============ API Response Types ============

export interface KalshiEventsResponse {
  events: KalshiEvent[];
  cursor: string;
  milestones?: unknown[];
}

export interface KalshiMarketsResponse {
  markets: KalshiMarket[];
  cursor: string;
}

export interface KalshiSeriesResponse {
  series: KalshiSeries[];
}

// ============ Explorer Output Types ============

export interface KalshiMarketSummary {
  ticker: string;
  title: string;
  eventTicker: string;
  yesBid: number; // 0-1 probability
  yesAsk: number;
  noBid: number;
  noAsk: number;
  lastPrice: number;
  volume: number;
  liquidity: number;
  status: string;
}

export interface KalshiEventSummary {
  ticker: string;
  title: string;
  category: string;
  marketCount: number;
  markets: KalshiMarketSummary[];
}
