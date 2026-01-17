/**
 * Order Book Types
 *
 * Shared interfaces for order book data structures.
 */

/**
 * A single price level in an order book.
 */
export interface OrderBookLevel {
  /** Price in 0-1 scale (probability) */
  price: number;
  /** Number of contracts available at this price */
  size: number;
}

/**
 * Unified order book format across platforms.
 */
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
 * Create an empty order book (used for error cases).
 */
export function createEmptyOrderBook(
  platform: 'polymarket' | 'kalshi',
  marketId: string
): UnifiedOrderBook {
  return {
    platform,
    marketId,
    yesBids: [],
    yesAsks: [],
    noBids: [],
    noAsks: [],
    fetchedAt: new Date(),
  };
}
