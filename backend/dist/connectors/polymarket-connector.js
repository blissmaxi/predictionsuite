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
import { isNonEmptyString, } from '../types/unified.js';
// ============ Constants ============
const GAMMA_API_URL = 'https://gamma-api.polymarket.com';
const POLYMARKET_BASE_URL = 'https://polymarket.com';
// ============ JSON Parsing Helpers ============
/**
 * Safely parse a JSON-encoded string field.
 * Polymarket API returns some array fields as JSON strings.
 *
 * @example
 * parseJsonField('[\"Yes\", \"No\"]', []) // Returns ["Yes", "No"]
 * parseJsonField(undefined, []) // Returns []
 */
function parseJsonField(value, fallback) {
    if (Array.isArray(value))
        return value;
    if (!value || typeof value !== 'string')
        return fallback;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : fallback;
    }
    catch {
        return fallback;
    }
}
/**
 * Parse a numeric value that may be a string or number.
 */
function parseNumber(value) {
    if (typeof value === 'number')
        return value;
    if (!value)
        return 0;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
}
// ============ Validation ============
/**
 * Check if a Polymarket market is valid for normalization.
 *
 * Requirements:
 * - Must be active and not closed
 * - Must have exactly 2 outcomes (binary: Yes/No)
 * - Must have valid prices
 * - Must have a question/title
 */
function isValidPolymarketMarket(market) {
    // Must be active and not closed
    if (!market.active || market.closed)
        return false;
    // Must have a question
    if (!isNonEmptyString(market.question))
        return false;
    // Parse outcomes - must be exactly 2 for binary market
    const outcomes = parseJsonField(market.outcomes, []);
    if (outcomes.length !== 2)
        return false;
    // Parse prices - must have 2 valid prices
    const prices = parseJsonField(market.outcomePrices, []);
    if (prices.length !== 2)
        return false;
    const yesPrice = parseFloat(prices[0]);
    const noPrice = parseFloat(prices[1]);
    // Prices must be valid numbers between 0 and 1
    if (isNaN(yesPrice) || isNaN(noPrice))
        return false;
    if (yesPrice <= 0 || yesPrice >= 1)
        return false;
    if (noPrice <= 0 || noPrice >= 1)
        return false;
    return true;
}
// ============ Normalization ============
/**
 * Normalize a Polymarket market to unified format.
 *
 * Price mapping:
 * - outcomePrices[0] = YES price (already 0-1)
 * - outcomePrices[1] = NO price (already 0-1)
 *
 * Note: Polymarket Gamma API provides snapshot prices, not live order book.
 * For more accurate bid/ask, you'd need to query CLOB API separately.
 * Here we use the snapshot price for both bid and ask as approximation.
 */
function normalizeMarket(market, eventId, eventTitle, eventSlug) {
    const prices = parseJsonField(market.outcomePrices, ['0', '0']);
    const yesPrice = parseFloat(prices[0]) || 0;
    const noPrice = parseFloat(prices[1]) || 0;
    // Polymarket Gamma API doesn't provide bid/ask separately
    // Using snapshot price as approximation (CLOB API would give real bid/ask)
    // Small spread added for realism
    const spreadEstimate = 0.01; // 1% estimated spread
    return {
        id: market.id,
        platform: 'polymarket',
        question: market.question,
        eventId,
        eventTitle,
        // Prices (already 0-1 from Polymarket)
        yesPrice,
        noPrice,
        yesBid: Math.max(0, yesPrice - spreadEstimate / 2),
        yesAsk: Math.min(1, yesPrice + spreadEstimate / 2),
        noBid: Math.max(0, noPrice - spreadEstimate / 2),
        noAsk: Math.min(1, noPrice + spreadEstimate / 2),
        // Metadata
        volume: market.volumeNum ?? parseNumber(market.volume),
        liquidity: market.liquidityNum ?? parseNumber(market.liquidity),
        endDate: market.endDate,
        // Source info
        sourceUrl: `${POLYMARKET_BASE_URL}/event/${eventSlug}`,
        lastUpdated: new Date().toISOString(),
    };
}
/**
 * Normalize a Polymarket event with its markets.
 */
function normalizeEvent(event, errors) {
    // Skip events without title
    if (!isNonEmptyString(event.title)) {
        errors.push(`Skipped event ${event.id}: missing title`);
        return null;
    }
    // Normalize valid markets within this event
    const markets = [];
    for (const market of event.markets ?? []) {
        if (!isValidPolymarketMarket(market)) {
            errors.push(`Skipped market ${market.id}: failed validation (non-binary, closed, or invalid prices)`);
            continue;
        }
        markets.push(normalizeMarket(market, event.id, event.title, event.slug));
    }
    // Skip events with no valid markets
    if (markets.length === 0) {
        errors.push(`Skipped event ${event.id} "${event.title}": no valid binary markets`);
        return null;
    }
    return {
        id: event.id,
        platform: 'polymarket',
        title: event.title,
        category: undefined, // Polymarket doesn't provide category in events response
        markets,
        endDate: event.endDate,
        sourceUrl: `${POLYMARKET_BASE_URL}/event/${event.slug}`,
    };
}
// ============ API Functions ============
/**
 * Fetch events from Polymarket Gamma API.
 *
 * Endpoint: GET /events
 * Returns events with nested markets array.
 */
async function fetchRawEvents(limit, offset = 0) {
    const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        active: 'true',
        closed: 'false',
    });
    const response = await fetch(`${GAMMA_API_URL}/events?${params}`);
    if (!response.ok) {
        throw new Error(`Polymarket API error: ${response.status} ${response.statusText}`);
    }
    // Gamma API returns array directly (not wrapped in object)
    const events = await response.json();
    return events;
}
/**
 * Fetch all events from Polymarket using pagination.
 *
 * @param batchSize Number of events per request (max ~500)
 * @param maxEvents Maximum total events to fetch (0 = unlimited)
 * @param onProgress Optional callback for progress updates
 */
async function fetchAllRawEvents(batchSize = 200, maxEvents = 0, onProgress) {
    const allEvents = [];
    let offset = 0;
    while (true) {
        const events = await fetchRawEvents(batchSize, offset);
        allEvents.push(...events);
        onProgress?.(allEvents.length);
        // Stop if we got fewer than requested (end of data)
        if (events.length < batchSize)
            break;
        // Stop if we've reached the max
        if (maxEvents > 0 && allEvents.length >= maxEvents) {
            return allEvents.slice(0, maxEvents);
        }
        offset += batchSize;
    }
    return allEvents;
}
/**
 * Fetch individual markets from Polymarket Gamma API.
 *
 * Endpoint: GET /markets
 * Returns markets without full event context.
 */
async function fetchRawMarkets(limit) {
    const params = new URLSearchParams({
        limit: limit.toString(),
        active: 'true',
        closed: 'false',
    });
    const response = await fetch(`${GAMMA_API_URL}/markets?${params}`);
    if (!response.ok) {
        throw new Error(`Polymarket API error: ${response.status} ${response.statusText}`);
    }
    const markets = await response.json();
    return markets;
}
// ============ Connector Implementation ============
/**
 * Fetch and normalize Polymarket events with their markets.
 *
 * @param limit Maximum number of events to fetch (default: 100)
 * @returns Normalized events with error log
 */
export async function fetchPolymarketEvents(limit = 100) {
    const errors = [];
    const fetchedAt = new Date().toISOString();
    try {
        const rawEvents = await fetchRawEvents(limit);
        const normalizedEvents = [];
        for (const event of rawEvents) {
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
        errors.push(`Failed to fetch Polymarket events: ${message}`);
        return {
            data: [],
            errors,
            fetchedAt,
        };
    }
}
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
export async function fetchAllPolymarketEvents(options = {}) {
    const { batchSize = 200, maxEvents = 0, onProgress } = options;
    const errors = [];
    const fetchedAt = new Date().toISOString();
    try {
        const rawEvents = await fetchAllRawEvents(batchSize, maxEvents, onProgress);
        const normalizedEvents = [];
        for (const event of rawEvents) {
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
        errors.push(`Failed to fetch Polymarket events: ${message}`);
        return {
            data: [],
            errors,
            fetchedAt,
        };
    }
}
/**
 * Fetch and normalize Polymarket markets (without event grouping).
 *
 * Note: Markets fetched this way may have limited event context.
 * The events array on each market may be populated but with less detail.
 *
 * @param limit Maximum number of markets to fetch (default: 100)
 * @returns Normalized markets with error log
 */
export async function fetchPolymarketMarkets(limit = 100) {
    const errors = [];
    const fetchedAt = new Date().toISOString();
    try {
        const rawMarkets = await fetchRawMarkets(limit);
        const normalizedMarkets = [];
        for (const market of rawMarkets) {
            if (!isValidPolymarketMarket(market)) {
                errors.push(`Skipped market ${market.id}: failed validation`);
                continue;
            }
            // Extract event info from market if available
            const event = market.events?.[0];
            const eventId = event?.id ?? market.id;
            const eventTitle = event?.title ?? market.question;
            const eventSlug = event?.slug ?? market.slug;
            normalizedMarkets.push(normalizeMarket(market, eventId, eventTitle, eventSlug));
        }
        return {
            data: normalizedMarkets,
            errors,
            fetchedAt,
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to fetch Polymarket markets: ${message}`);
        return {
            data: [],
            errors,
            fetchedAt,
        };
    }
}
// ============ Connector Export ============
/**
 * Polymarket connector implementing PlatformConnector interface.
 */
export const polymarketConnector = {
    platform: 'polymarket',
    fetchEvents: fetchPolymarketEvents,
    fetchMarkets: fetchPolymarketMarkets,
};
export default polymarketConnector;
