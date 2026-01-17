/**
 * Order Book Fetcher
 *
 * Unified interface for fetching order books from prediction markets.
 * Platform-specific implementations are in:
 * - ./polymarket/fetcher.ts
 * - ./kalshi/fetcher.ts
 */

// Re-export types
export type { OrderBookLevel, UnifiedOrderBook } from './types.js';
export { createEmptyOrderBook } from './types.js';

// Re-export platform-specific fetchers
export { fetchPolymarketOrderBook } from './polymarket/fetcher.js';
export { fetchKalshiOrderBook } from './kalshi/fetcher.js';
