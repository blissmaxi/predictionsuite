/**
 * Kalshi Connector (SDK-based)
 *
 * Fetches and normalizes market data from Kalshi using the official TypeScript SDK.
 *
 * Key improvements over REST-based approach:
 * - Uses getEvents() with withNestedMarkets=true to fetch events AND markets in one call
 * - Eliminates N+1 API call problem completely
 * - Proper pagination with cursor support
 * - Type-safe with SDK types
 *
 * SDK Documentation: https://docs.kalshi.com/sdks/typescript/quickstart
 */
import type { UnifiedEvent, UnifiedMarket, FetchResult, PlatformConnector } from '../types/unified.js';
/**
 * Fetch and normalize Kalshi events with their markets.
 *
 * Uses SDK's getEvents() with withNestedMarkets=true to get events AND markets
 * in a single API call, eliminating the N+1 problem.
 *
 * @param limit Maximum number of events to fetch (default: 50)
 * @returns Normalized events with error log
 */
export declare function fetchKalshiEvents(limit?: number): Promise<FetchResult<UnifiedEvent>>;
/**
 * Fetch ALL Kalshi events with their markets using pagination.
 *
 * Uses SDK's cursor pagination with withNestedMarkets=true.
 * Much faster than the old N+1 approach since each page returns events WITH markets.
 *
 * @param options.batchSize Events per page (default: 200, max 200)
 * @param options.maxEvents Maximum events to fetch, 0 for all (default: 0)
 * @param options.onProgress Callback for progress updates
 * @returns All normalized events with error log
 */
export declare function fetchAllKalshiEvents(options?: {
    batchSize?: number;
    maxEvents?: number;
    onProgress?: (fetched: number, total: number) => void;
}): Promise<FetchResult<UnifiedEvent>>;
/**
 * Fetch and normalize Kalshi markets directly (without event grouping).
 *
 * Uses SDK's getMarkets() with up to 1000 results per page.
 *
 * @param limit Maximum number of markets to fetch (default: 100)
 * @returns Normalized markets with error log
 */
export declare function fetchKalshiMarkets(limit?: number): Promise<FetchResult<UnifiedMarket>>;
/**
 * Kalshi connector implementing PlatformConnector interface.
 */
export declare const kalshiConnector: PlatformConnector;
export default kalshiConnector;
