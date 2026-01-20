/**
 * API Configuration
 *
 * Centralized configuration for all external API endpoints,
 * timeouts, and request parameters.
 */

// ============ Polymarket ============

export const POLYMARKET = {
  /** Discovery API for events and markets */
  GAMMA_API_URL: 'https://gamma-api.polymarket.com',

  /** Trading API for order books */
  CLOB_API_URL: 'https://clob.polymarket.com',

  /** Maximum events per request */
  BATCH_SIZE: 200,

  /** Request timeout in milliseconds */
  TIMEOUT_MS: 30_000,
} as const;

// ============ Kalshi ============

export const KALSHI = {
  /** Main trading API */
  API_URL: 'https://api.elections.kalshi.com/trade-api/v2',

  /** Maximum markets per request */
  BATCH_SIZE: 200,

  /** Request timeout in milliseconds */
  TIMEOUT_MS: 30_000,
} as const;

// ============ Scanner Settings ============

export const SCANNER = {
  /** Delay between API calls to avoid rate limiting (ms) */
  RATE_LIMIT_DELAY_MS: 50,

  /** Number of days to scan for dynamic mappings */
  DYNAMIC_SCAN_DAYS: 3,

  /** Maximum opportunities to analyze for liquidity */
  MAX_LIQUIDITY_ANALYSIS: 25,

  /** Polling interval for continuous scanning (ms) */
  POLL_INTERVAL_MS: 60_000,
} as const;

