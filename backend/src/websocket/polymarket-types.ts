/**
 * Polymarket WebSocket Types
 *
 * Types for the Polymarket CLOB WebSocket market channel.
 * Prices use tenth of cent precision (0-1000 for 0-100¢).
 */

// ============ Subscription Messages ============

export interface PolymarketSubscription {
  assets_ids: string[];
  type: 'market';
}

export interface PolymarketUnsubscribe {
  assets_ids: string[];
  operation: 'unsubscribe';
}

// ============ WebSocket Messages ============

export interface BookMessage {
  event_type: 'book';
  asset_id: string;
  market: string; // condition ID
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  timestamp: string;
  hash: string;
}

export interface PriceChangeMessage {
  event_type: 'price_change';
  market: string;
  price_changes: Array<{
    asset_id: string;
    price: string;
    size: string;
    side: 'BUY' | 'SELL';
    best_bid?: string;
    best_ask?: string;
    hash?: string;
  }>;
  timestamp: string;
}

export type WebSocketMessage =
  | BookMessage
  | PriceChangeMessage
  | { event_type: string; [key: string]: unknown };

// ============ Orderbook State ============

/**
 * Orderbook state for a single Polymarket token.
 *
 * Each binary market has 2 tokens (YES and NO outcomes).
 * Prices are stored as integers in tenths of cent (0-1000).
 * Example: 485 = 48.5¢ = $0.485
 */
export interface PolymarketOrderBookState {
  assetId: string;
  conditionId: string;
  bids: Map<number, number>; // price (tenths of cent) -> size
  asks: Map<number, number>; // price (tenths of cent) -> size
  updatedAt: Date;
}

// ============ Events ============

export interface PolymarketWebSocketEvents {
  connected: () => void;
  disconnected: (code: number, reason: string) => void;
  error: (error: Error) => void;
  subscribed: (assetId: string) => void;
  book: (assetId: string, orderbook: PolymarketOrderBookState) => void;
  price_change: (assetId: string, side: 'BUY' | 'SELL', price: number, size: number) => void;
  orderbook: (assetId: string, orderbook: PolymarketOrderBookState) => void;
}

// ============ Utilities ============

/**
 * Parse a Polymarket price string to tenths of cent integer.
 * Example: ".485" -> 485, ".48" -> 480, "0.5" -> 500
 */
export function parsePrice(priceStr: string): number {
  return Math.round(parseFloat(priceStr) * 1000);
}

/**
 * Format tenths of cent to display string.
 * Example: 485 -> "48.5¢", 500 -> "50.0¢"
 */
export function formatPrice(price: number): string {
  return `${(price / 10).toFixed(1)}¢`;
}
