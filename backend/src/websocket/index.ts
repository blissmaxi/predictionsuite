/**
 * WebSocket Module
 *
 * Real-time connections to prediction market platforms.
 */

export { KalshiWebSocketClient } from './kalshi-client.js';
export type {
  KalshiCredentials,
  ConnectionState,
  OrderBookState,
  OrderBookLevel,
  OrderBookSnapshot,
  OrderBookDelta,
  KalshiWebSocketEvents,
} from './types.js';
