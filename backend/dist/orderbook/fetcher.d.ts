/**
 * Order Book Fetcher
 *
 * Unified interface for fetching order books from Polymarket and Kalshi.
 * Normalizes data into a common format for liquidity analysis.
 *
 * Key concepts:
 * - Bids: Prices buyers are willing to pay (sorted highest first)
 * - Asks: Prices sellers are offering (sorted lowest first)
 * - YES/NO: Binary outcome sides of a prediction market
 */
export interface OrderBookLevel {
    /** Price in 0-1 scale (probability) */
    price: number;
    /** Number of contracts available at this price */
    size: number;
}
export interface UnifiedOrderBook {
    platform: 'polymarket' | 'kalshi';
    marketId: string;
    /** Bids for YES outcome (sorted highest first) */
    yesBids: OrderBookLevel[];
    /** Asks for YES outcome (sorted lowest first) */
    yesAsks: OrderBookLevel[];
    /** Bids for NO outcome (sorted highest first) */
    noBids: OrderBookLevel[];
    /** Asks for NO outcome (sorted lowest first) */
    noAsks: OrderBookLevel[];
    fetchedAt: Date;
}
/**
 * Fetch order book for a Polymarket market.
 *
 * Polymarket uses separate token IDs for YES and NO outcomes.
 * Each token has its own order book that must be fetched independently.
 *
 * @param yesTokenId - CLOB token ID for YES outcome
 * @param noTokenId - CLOB token ID for NO outcome
 */
export declare function fetchPolymarketOrderBook(yesTokenId: string, noTokenId: string): Promise<UnifiedOrderBook>;
/**
 * Fetch order book for a Kalshi market.
 *
 * Kalshi's order book shows resting bids for each outcome.
 * To derive asks, we use the complement relationship:
 * - A bid of X for NO implies an ask of (1-X) for YES
 * - A bid of X for YES implies an ask of (1-X) for NO
 *
 * @param ticker - Market ticker (e.g., "KXSB-26-KC")
 */
export declare function fetchKalshiOrderBook(ticker: string): Promise<UnifiedOrderBook>;
/**
 * Check if an order book has any liquidity on any side.
 */
export declare function hasLiquidity(book: UnifiedOrderBook): boolean;
/**
 * Get best bid/ask prices from an order book.
 * Returns null for sides with no liquidity.
 */
export declare function getBestPrices(book: UnifiedOrderBook): {
    yesBestBid: number | null;
    yesBestAsk: number | null;
    noBestBid: number | null;
    noBestAsk: number | null;
};
/**
 * Calculate total depth (volume) at each side.
 */
export declare function getDepth(book: UnifiedOrderBook): {
    yesBidDepth: number;
    yesAskDepth: number;
    noBidDepth: number;
    noAskDepth: number;
};
/**
 * Calculate the spread between best bid and ask for an outcome.
 * Returns null if either side has no liquidity.
 */
export declare function getSpread(book: UnifiedOrderBook, outcome: 'yes' | 'no'): number | null;
