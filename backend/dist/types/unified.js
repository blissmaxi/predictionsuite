/**
 * Unified Data Model for Prediction Markets
 *
 * Platform-agnostic types that normalize markets from Polymarket and Kalshi
 * into a common schema for arbitrage detection.
 *
 * All prices are normalized to 0-1 probability scale:
 * - 0.45 = 45% implied probability
 * - YES price + NO price should approximately equal 1.0 (minus spread)
 */
// ============ Validation Helpers ============
/**
 * Check if a price is valid (between 0 and 1, exclusive).
 * Prices at exactly 0 or 1 indicate the market is resolved.
 */
export function isValidPrice(price) {
    return typeof price === 'number' && !isNaN(price) && price > 0 && price < 1;
}
/**
 * Check if a market has valid pricing data.
 * At minimum, needs valid YES and NO prices.
 */
export function hasValidPricing(market) {
    return (isValidPrice(market.yesPrice ?? 0) &&
        isValidPrice(market.noPrice ?? 0));
}
/**
 * Check if a string is non-empty after trimming whitespace.
 */
export function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
/**
 * Check if a date string is a valid ISO 8601 date.
 */
export function isValidDateString(value) {
    if (typeof value !== 'string')
        return false;
    const date = new Date(value);
    return !isNaN(date.getTime());
}
// ============ Price Calculation Helpers ============
/**
 * Calculate midpoint price from bid and ask.
 * Returns 0 if either bid or ask is invalid.
 */
export function calculateMidpoint(bid, ask) {
    if (bid <= 0 || ask <= 0 || bid >= ask)
        return 0;
    return (bid + ask) / 2;
}
/**
 * Calculate spread between bid and ask as a percentage.
 */
export function calculateSpread(bid, ask) {
    if (bid <= 0 || ask <= 0)
        return 0;
    return ask - bid;
}
