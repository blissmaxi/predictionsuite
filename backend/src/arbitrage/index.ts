/**
 * Arbitrage Module
 *
 * Real-time arbitrage detection between prediction market platforms.
 */

// Classes
export { ArbitrageEngine } from './engine.js';
export { MarketPairRegistry } from './pair-registry.js';
export { OrderbookAggregator } from './orderbook-aggregator.js';

// Types
export type {
  Platform,
  PriceLevel,
  NormalizedOrderbook,
  MarketPairMapping,
  ArbitrageType,
  ArbitrageOpportunity,
  ArbitrageEngineConfig,
  ArbitrageEngineEvents,
} from './types.js';
