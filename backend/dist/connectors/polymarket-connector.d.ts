/**
 * Polymarket Connector
 *
 * Fetches and normalizes market data from Polymarket's Gamma API.
 *
 * API Documentation: https://docs.polymarket.com/
 *
 * Key API quirks handled:
 * - Fields like `outcomes`, `outcomePrices`, `clobTokenIds` are JSON-encoded strings
 * - Prices are already in 0-1 decimal format
 * - Events contain nested markets array
 * - Volume/liquidity may be strings or numbers depending on endpoint
 */
import type { UnifiedEvent, UnifiedMarket, FetchResult, PlatformConnector } from '../types/unified.js';
/**
 * Fetch and normalize Polymarket events with their markets.
 *
 * @param limit Maximum number of events to fetch (default: 100)
 * @returns Normalized events with error log
 */
export declare function fetchPolymarketEvents(limit?: number): Promise<FetchResult<UnifiedEvent>>;
/**
 * Fetch ALL Polymarket events using pagination.
 *
 * This function fetches all available events by paginating through the API.
 * May take longer and use more requests than the non-paginated version.
 *
 * @param options.batchSize Events per request (default: 200)
 * @param options.maxEvents Maximum events to fetch, 0 for all (default: 0)
 * @param options.onProgress Callback for progress updates
 * @returns All normalized events with error log
 */
export declare function fetchAllPolymarketEvents(options?: {
    batchSize?: number;
    maxEvents?: number;
    onProgress?: (fetched: number) => void;
}): Promise<FetchResult<UnifiedEvent>>;
/**
 * Fetch and normalize Polymarket markets (without event grouping).
 *
 * Note: Markets fetched this way may have limited event context.
 * The events array on each market may be populated but with less detail.
 *
 * @param limit Maximum number of markets to fetch (default: 100)
 * @returns Normalized markets with error log
 */
export declare function fetchPolymarketMarkets(limit?: number): Promise<FetchResult<UnifiedMarket>>;
/**
 * Polymarket connector implementing PlatformConnector interface.
 */
export declare const polymarketConnector: PlatformConnector;
export default polymarketConnector;
