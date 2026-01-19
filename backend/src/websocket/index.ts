/**
 * WebSocket Module
 *
 * Real-time connections to prediction market platforms.
 */

// Base
export { MarketWebSocketClient } from './base-client.js';
export type { ConnectionState, BaseWebSocketEvents } from './base-client.js';

// Kalshi
export { KalshiWebSocketClient } from './kalshi-client.js';
export type {
  KalshiCredentials,
  OrderBookState,
  OrderBookLevel,
  OrderBookSnapshot,
  OrderBookDelta,
  KalshiWebSocketEvents,
} from './kalshi-types.js';

// Polymarket
export { PolymarketWebSocketClient } from './polymarket-client.js';
export type {
  PolymarketOrderBookState,
  PolymarketWebSocketEvents,
  BookMessage,
  PriceChangeMessage,
} from './polymarket-types.js';
export { parsePrice, formatPrice } from './polymarket-types.js';
