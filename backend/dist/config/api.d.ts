/**
 * API Configuration
 *
 * Centralized configuration for all external API endpoints,
 * timeouts, and request parameters.
 */
export declare const POLYMARKET: {
    /** Discovery API for events and markets */
    readonly GAMMA_API_URL: "https://gamma-api.polymarket.com";
    /** Trading API for order books */
    readonly CLOB_API_URL: "https://clob.polymarket.com";
    /** Maximum events per request */
    readonly BATCH_SIZE: 200;
    /** Request timeout in milliseconds */
    readonly TIMEOUT_MS: 30000;
};
export declare const KALSHI: {
    /** Main trading API */
    readonly API_URL: "https://api.elections.kalshi.com/trade-api/v2";
    /** Maximum markets per request */
    readonly BATCH_SIZE: 200;
    /** Request timeout in milliseconds */
    readonly TIMEOUT_MS: 30000;
};
export declare const ARBITRAGE: {
    /** Minimum spread percentage to consider as opportunity */
    readonly MIN_SPREAD_PCT: 2;
    /** Minimum profit percentage after fees */
    readonly MIN_PROFIT_PCT: 1;
    /** Estimated Polymarket fee (varies by market) */
    readonly POLYMARKET_FEE_PCT: 2;
    /** Estimated Kalshi fee (varies by market) */
    readonly KALSHI_FEE_PCT: 1;
};
export declare const SCANNER: {
    /** Delay between API calls to avoid rate limiting (ms) */
    readonly RATE_LIMIT_DELAY_MS: 350;
    /** Number of days to scan for dynamic mappings */
    readonly DYNAMIC_SCAN_DAYS: 3;
    /** Maximum opportunities to analyze for liquidity */
    readonly MAX_LIQUIDITY_ANALYSIS: 25;
    /** Polling interval for continuous scanning (ms) */
    readonly POLL_INTERVAL_MS: 60000;
};
export declare const DISPLAY: {
    /** Width of separator lines in console output */
    readonly SEPARATOR_WIDTH: 70;
    /** Maximum markets to show in preview lists */
    readonly PREVIEW_LIMIT: 3;
    /** Maximum price levels to show in liquidity analysis */
    readonly PRICE_LEVELS_PREVIEW: 3;
    /** Maximum price levels before truncating */
    readonly PRICE_LEVELS_FULL: 5;
};
