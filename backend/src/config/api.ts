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

// ============ Arbitrage Thresholds ============

export const ARBITRAGE = {
  /** Minimum spread percentage to consider as opportunity */
  MIN_SPREAD_PCT: 2.0,

  /** Minimum profit percentage after fees */
  MIN_PROFIT_PCT: 1.0,

  /** Estimated Polymarket fee (varies by market) */
  POLYMARKET_FEE_PCT: 2.0,

  /** Estimated Kalshi fee (varies by market) */
  KALSHI_FEE_PCT: 1.0,
} as const;

// ============ Scanner Settings ============

export const SCANNER = {
  /** Delay between API calls to avoid rate limiting (ms) */
  RATE_LIMIT_DELAY_MS: 150,

  /** Number of days to scan for dynamic mappings */
  DYNAMIC_SCAN_DAYS: 3,

  /** Maximum opportunities to analyze for liquidity */
  MAX_LIQUIDITY_ANALYSIS: 25,

  /** Polling interval for continuous scanning (ms) */
  POLL_INTERVAL_MS: 60_000,
} as const;

// ============ Display Formatting ============

export const DISPLAY = {
  /** Width of separator lines in console output */
  SEPARATOR_WIDTH: 70,

  /** Maximum markets to show in preview lists */
  PREVIEW_LIMIT: 3,

  /** Maximum price levels to show in liquidity analysis */
  PRICE_LEVELS_PREVIEW: 3,

  /** Maximum price levels before truncating */
  PRICE_LEVELS_FULL: 5,
} as const;
