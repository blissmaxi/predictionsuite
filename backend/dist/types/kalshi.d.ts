/**
 * Kalshi API Type Definitions
 * Based on https://api.elections.kalshi.com/trade-api/v2
 */
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
export interface KalshiMarket {
    ticker: string;
    event_ticker: string;
    title: string;
    subtitle: string;
    status: 'active' | 'closed' | 'settled' | 'unopened';
    market_type: 'binary';
    yes_bid: number;
    yes_ask: number;
    no_bid: number;
    no_ask: number;
    last_price: number;
    yes_bid_dollars: string;
    yes_ask_dollars: string;
    no_bid_dollars: string;
    no_ask_dollars: string;
    last_price_dollars: string;
    volume: number;
    volume_24h: number;
    liquidity: number;
    liquidity_dollars: string;
    open_interest: number;
    open_time: string;
    close_time: string;
    expiration_time: string;
    expected_expiration_time: string;
    latest_expiration_time: string;
    created_time: string;
    result: string;
    rules_primary: string;
    rules_secondary: string;
    early_close_condition?: string;
    can_close_early: boolean;
    settlement_timer_seconds: number;
    tick_size: number;
    notional_value: number;
    notional_value_dollars: string;
    price_level_structure: 'linear_cent' | 'deci_cent';
    price_ranges: KalshiPriceRange[];
    response_price_units: string;
    yes_sub_title: string;
    no_sub_title: string;
    previous_price: number;
    previous_price_dollars: string;
    previous_yes_ask: number;
    previous_yes_ask_dollars: string;
    previous_yes_bid: number;
    previous_yes_bid_dollars: string;
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
export interface KalshiOrderBook {
    orderbook: {
        yes: KalshiOrderBookLevel[] | null;
        no: KalshiOrderBookLevel[] | null;
        yes_dollars: KalshiOrderBookLevelDollars[] | null;
        no_dollars: KalshiOrderBookLevelDollars[] | null;
    };
}
export type KalshiOrderBookLevel = [number, number];
export type KalshiOrderBookLevelDollars = [string, number];
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
export interface KalshiMarketSummary {
    ticker: string;
    title: string;
    eventTicker: string;
    yesBid: number;
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
