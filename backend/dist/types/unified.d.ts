/**
 * Unified Data Model for Prediction Markets
 *
 * Platform-agnostic types that normalize markets from Polymarket and Kalshi
 * into a common schema for arbitrage detection.
 *
 * All prices are normalized to 0-1 probability scale:
 * - 0.45 = 45% implied probability
 * - YES price + NO price should approximately equal 1.0 (minus spread)
 */
/**
 * Supported prediction market platforms
 */
export type Platform = 'polymarket' | 'kalshi';
/**
 * A normalized binary market from any platform.
 *
 * Binary markets have exactly two outcomes: YES and NO.
 * Prices represent the cost to buy one share that pays $1 if correct.
 */
export interface UnifiedMarket {
    /** Platform-specific market identifier */
    id: string;
    /** Source platform */
    platform: Platform;
    /** The market question (e.g., "Will Bitcoin reach $100k in 2025?") */
    question: string;
    /** Parent event ID on the source platform */
    eventId: string;
    /** Parent event title for context */
    eventTitle: string;
    /**
     * Current YES price - midpoint or last trade price.
     * Represents implied probability of YES outcome.
     */
    yesPrice: number;
    /**
     * Current NO price - midpoint or last trade price.
     * Represents implied probability of NO outcome.
     */
    noPrice: number;
    /** Best bid price for YES shares (what you'd get selling YES) */
    yesBid: number;
    /** Best ask price for YES shares (what you'd pay buying YES) */
    yesAsk: number;
    /** Best bid price for NO shares (what you'd get selling NO) */
    noBid: number;
    /** Best ask price for NO shares (what you'd pay buying NO) */
    noAsk: number;
    /** Total trading volume in USD */
    volume: number;
    /** Available liquidity in USD */
    liquidity: number;
    /** ISO 8601 date when market closes/resolves */
    endDate: string;
    /** Direct URL to view market on source platform */
    sourceUrl: string;
    /** ISO 8601 timestamp when this data was fetched */
    lastUpdated: string;
}
/**
 * A normalized event containing one or more related markets.
 *
 * Events group related markets together (e.g., "2024 Election" event
 * might contain markets for different state outcomes).
 */
export interface UnifiedEvent {
    /** Platform-specific event identifier */
    id: string;
    /** Source platform */
    platform: Platform;
    /** Event title (e.g., "2024 Presidential Election") */
    title: string;
    /** Event category if available (e.g., "Politics", "Sports") */
    category?: string;
    /** Markets belonging to this event */
    markets: UnifiedMarket[];
    /** ISO 8601 date when event closes (may differ from individual markets) */
    endDate?: string;
    /** Direct URL to view event on source platform */
    sourceUrl?: string;
}
/**
 * Result of fetching and normalizing data from a platform.
 *
 * Includes both successful data and a log of skipped/failed items
 * for debugging without crashing.
 */
export interface FetchResult<T> {
    /** Successfully normalized items */
    data: T[];
    /** Log of skipped items with reasons (for debugging) */
    errors: string[];
    /** ISO 8601 timestamp when fetch completed */
    fetchedAt: string;
}
/**
 * Interface that all platform connectors must implement.
 * Ensures consistent API across different platforms.
 */
export interface PlatformConnector {
    /** Platform this connector fetches from */
    platform: Platform;
    /**
     * Fetch and normalize events with their markets.
     * @param limit Maximum number of events to fetch
     */
    fetchEvents(limit?: number): Promise<FetchResult<UnifiedEvent>>;
    /**
     * Fetch and normalize individual markets (without event grouping).
     * @param limit Maximum number of markets to fetch
     */
    fetchMarkets(limit?: number): Promise<FetchResult<UnifiedMarket>>;
}
/**
 * Check if a price is valid (between 0 and 1, exclusive).
 * Prices at exactly 0 or 1 indicate the market is resolved.
 */
export declare function isValidPrice(price: number): boolean;
/**
 * Check if a market has valid pricing data.
 * At minimum, needs valid YES and NO prices.
 */
export declare function hasValidPricing(market: Partial<UnifiedMarket>): boolean;
/**
 * Check if a string is non-empty after trimming whitespace.
 */
export declare function isNonEmptyString(value: unknown): value is string;
/**
 * Check if a date string is a valid ISO 8601 date.
 */
export declare function isValidDateString(value: unknown): boolean;
/**
 * Calculate midpoint price from bid and ask.
 * Returns 0 if either bid or ask is invalid.
 */
export declare function calculateMidpoint(bid: number, ask: number): number;
/**
 * Calculate spread between bid and ask as a percentage.
 */
export declare function calculateSpread(bid: number, ask: number): number;
