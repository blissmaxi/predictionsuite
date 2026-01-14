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
import { EventsApi, MarketApi, Configuration, } from 'kalshi-typescript';
import { isNonEmptyString } from '../types/unified.js';
// ============ Constants ============
const KALSHI_API_URL = 'https://api.elections.kalshi.com/trade-api/v2';
const KALSHI_BASE_URL = 'https://kalshi.com';
// Rate limiting: delay between pagination calls (ms)
// With SDK and withNestedMarkets=true, we make far fewer calls
const API_DELAY_MS = 50;
// ============ SDK Configuration ============
const config = new Configuration({
    basePath: KALSHI_API_URL,
});
const eventsApi = new EventsApi(config);
const marketApi = new MarketApi(config);
// ============ Helpers ============
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Normalize Kalshi title to match frontend display.
 *
 * The Kalshi API returns titles like "Fed decision in Jan 2026?"
 * but the frontend displays "Fed decision in January?"
 *
 * This function:
 * 1. Expands month abbreviations (Jan → January, Feb → February, etc.)
 * 2. Removes year suffix from titles (e.g., "in January 2026?" → "in January?")
 */
function normalizeKalshiTitle(title) {
    // Month abbreviation expansions
    const monthExpansions = [
        [/\bJan\b/g, 'January'],
        [/\bFeb\b/g, 'February'],
        [/\bMar\b/g, 'March'],
        [/\bApr\b/g, 'April'],
        [/\bJun\b/g, 'June'],
        [/\bJul\b/g, 'July'],
        [/\bAug\b/g, 'August'],
        [/\bSep\b/g, 'September'],
        [/\bSept\b/g, 'September'],
        [/\bOct\b/g, 'October'],
        [/\bNov\b/g, 'November'],
        [/\bDec\b/g, 'December'],
    ];
    let normalized = title;
    // Expand month abbreviations
    for (const [pattern, replacement] of monthExpansions) {
        normalized = normalized.replace(pattern, replacement);
    }
    // Remove year suffix ONLY when directly after a month
    // "in January 2026?" → "in January?"
    // "Q4 2025?" → "Q4?"
    // But keep: "before 2027?" → "before 2027?" (no month before year)
    normalized = normalized.replace(/(\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Q[1-4]))\s+20\d{2}(\??)$/i, '$1$2');
    return normalized;
}
/**
 * Parse dollar string to number (e.g., "0.4500" -> 0.45)
 */
function parseDollars(value) {
    if (!value)
        return 0;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
}
// ============ Validation ============
/**
 * Check if a Kalshi market is valid for normalization.
 */
function isValidKalshiMarket(market) {
    // Must be active
    if (market.status !== 'active')
        return false;
    // Must be binary
    if (market.market_type !== 'binary')
        return false;
    // Must have valid YES prices
    const yesBid = parseDollars(market.yes_bid_dollars);
    const yesAsk = parseDollars(market.yes_ask_dollars);
    // Allow markets with at least some pricing data
    if (yesBid <= 0 && yesAsk <= 0)
        return false;
    return true;
}
// ============ Normalization ============
/**
 * Normalize a Kalshi market to unified format.
 * SDK provides prices in dollar format (e.g., "0.4500") which maps directly to 0-1 probability.
 */
function normalizeMarket(market, event) {
    // Parse dollar prices (already in 0-1 format)
    const yesBid = parseDollars(market.yes_bid_dollars);
    const yesAsk = parseDollars(market.yes_ask_dollars);
    const noBid = parseDollars(market.no_bid_dollars);
    const noAsk = parseDollars(market.no_ask_dollars);
    const lastPrice = parseDollars(market.last_price_dollars);
    // Calculate YES price as midpoint if bid/ask available, otherwise use last_price
    let yesPrice = lastPrice;
    if (yesBid > 0 && yesAsk > 0 && yesAsk > yesBid) {
        yesPrice = (yesBid + yesAsk) / 2;
    }
    // NO price is complement of YES
    let noPrice = 1 - yesPrice;
    if (noBid > 0 && noAsk > 0 && noAsk > noBid) {
        noPrice = (noBid + noAsk) / 2;
    }
    // Use yes_sub_title for market name (Kalshi's convention)
    const question = market.yes_sub_title || market.title || 'Unknown';
    // Parse liquidity from dollars string
    const liquidityDollars = parseDollars(market.liquidity_dollars);
    return {
        id: market.ticker,
        platform: 'kalshi',
        question,
        eventId: event.event_ticker,
        eventTitle: event.title,
        // Prices (already 0-1 from SDK dollar format)
        yesPrice,
        noPrice,
        yesBid,
        yesAsk,
        noBid,
        noAsk,
        // Metadata
        volume: market.volume,
        liquidity: liquidityDollars,
        endDate: market.expiration_time || market.close_time,
        // Source info
        sourceUrl: `${KALSHI_BASE_URL}/markets/${market.ticker}`,
        lastUpdated: new Date().toISOString(),
    };
}
/**
 * Normalize a Kalshi event with its nested markets.
 */
function normalizeEvent(event, errors) {
    // Skip events without title
    if (!isNonEmptyString(event.title)) {
        errors.push(`Skipped event ${event.event_ticker}: missing title`);
        return null;
    }
    // Get markets from nested response
    const markets = event.markets ?? [];
    // Normalize valid markets
    const normalizedMarkets = [];
    for (const market of markets) {
        if (!isValidKalshiMarket(market)) {
            errors.push(`Skipped market ${market.ticker}: failed validation (inactive, non-binary, or no prices)`);
            continue;
        }
        normalizedMarkets.push(normalizeMarket(market, event));
    }
    // Skip events with no valid markets
    if (normalizedMarkets.length === 0) {
        errors.push(`Skipped event ${event.event_ticker} "${event.title}": no valid markets`);
        return null;
    }
    return {
        id: event.event_ticker,
        platform: 'kalshi',
        title: normalizeKalshiTitle(event.title),
        category: event.category || undefined,
        markets: normalizedMarkets,
        endDate: undefined,
        sourceUrl: `${KALSHI_BASE_URL}/events/${event.event_ticker}`,
    };
}
// ============ Connector Implementation ============
/**
 * Fetch and normalize Kalshi events with their markets.
 *
 * Uses SDK's getEvents() with withNestedMarkets=true to get events AND markets
 * in a single API call, eliminating the N+1 problem.
 *
 * @param limit Maximum number of events to fetch (default: 50)
 * @returns Normalized events with error log
 */
export async function fetchKalshiEvents(limit = 50) {
    const errors = [];
    const fetchedAt = new Date().toISOString();
    try {
        // Use SDK to fetch events with nested markets
        const response = await eventsApi.getEvents(Math.min(limit, 200), // limit (max 200 per page)
        undefined, // cursor (first page)
        true, // withNestedMarkets - KEY: includes markets!
        false, // withMilestones
        'open', // status
        undefined, // seriesTicker
        undefined // minCloseTs
        );
        const normalizedEvents = [];
        for (const event of response.data.events ?? []) {
            const normalized = normalizeEvent(event, errors);
            if (normalized) {
                normalizedEvents.push(normalized);
            }
        }
        return {
            data: normalizedEvents,
            errors,
            fetchedAt,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to fetch Kalshi events: ${message}`);
        return {
            data: [],
            errors,
            fetchedAt,
        };
    }
}
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
export async function fetchAllKalshiEvents(options = {}) {
    const { batchSize = 200, maxEvents = 0, onProgress } = options;
    const errors = [];
    const fetchedAt = new Date().toISOString();
    try {
        const allEvents = [];
        let cursor;
        let totalFetched = 0;
        while (true) {
            // Fetch page of events with nested markets
            const response = await eventsApi.getEvents(Math.min(batchSize, 200), cursor, true, // withNestedMarkets
            false, // withMilestones
            'open', // status
            undefined, // seriesTicker
            undefined // minCloseTs
            );
            const events = response.data.events ?? [];
            totalFetched += events.length;
            // Normalize each event
            for (const event of events) {
                const normalized = normalizeEvent(event, errors);
                if (normalized) {
                    allEvents.push(normalized);
                }
            }
            onProgress?.(totalFetched, 0);
            // Check if we should stop
            if (events.length < batchSize || !response.data.cursor) {
                break;
            }
            if (maxEvents > 0 && totalFetched >= maxEvents) {
                break;
            }
            cursor = response.data.cursor;
            // Small delay between pagination calls
            await sleep(API_DELAY_MS);
        }
        // Trim to maxEvents if specified
        const result = maxEvents > 0 ? allEvents.slice(0, maxEvents) : allEvents;
        return {
            data: result,
            errors,
            fetchedAt,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to fetch Kalshi events: ${message}`);
        return {
            data: [],
            errors,
            fetchedAt,
        };
    }
}
/**
 * Fetch and normalize Kalshi markets directly (without event grouping).
 *
 * Uses SDK's getMarkets() with up to 1000 results per page.
 *
 * @param limit Maximum number of markets to fetch (default: 100)
 * @returns Normalized markets with error log
 */
export async function fetchKalshiMarkets(limit = 100) {
    const errors = [];
    const fetchedAt = new Date().toISOString();
    try {
        const response = await marketApi.getMarkets(Math.min(limit, 1000), // limit (max 1000)
        undefined, // cursor
        undefined, // eventTicker
        undefined, // seriesTicker
        undefined, // minCreatedTs
        undefined, // maxCreatedTs
        undefined, // maxCloseTs
        undefined, // minCloseTs
        undefined, // minSettledTs
        undefined, // maxSettledTs
        'open', // status
        undefined, // tickers
        'exclude' // mveFilter - exclude multivariate/combo markets
        );
        const normalizedMarkets = [];
        for (const market of response.data.markets ?? []) {
            if (!isValidKalshiMarket(market)) {
                errors.push(`Skipped market ${market.ticker}: failed validation`);
                continue;
            }
            // Create minimal event context
            const event = {
                event_ticker: market.event_ticker,
                series_ticker: '',
                title: market.yes_sub_title || market.title || 'Unknown Event',
                sub_title: market.subtitle || '',
                category: '',
                mutually_exclusive: false,
            };
            normalizedMarkets.push(normalizeMarket(market, event));
        }
        return {
            data: normalizedMarkets,
            errors,
            fetchedAt,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to fetch Kalshi markets: ${message}`);
        return {
            data: [],
            errors,
            fetchedAt,
        };
    }
}
// ============ Connector Export ============
/**
 * Kalshi connector implementing PlatformConnector interface.
 */
export const kalshiConnector = {
    platform: 'kalshi',
    fetchEvents: fetchKalshiEvents,
    fetchMarkets: fetchKalshiMarkets,
};
export default kalshiConnector;
