/**
 * Kalshi NBA Game Parser
 *
 * Parses and generates Kalshi NBA game tickers.
 *
 * URL Format: KXNBAGAME-{YY}{MON}{DD}{AWAY}{HOME}
 * Example: KXNBAGAME-26JAN13PHXMIA
 */

import type { ParsedNbaGame } from '../types.js';

// ============ Constants ============

const MONTHS_SHORT = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

/** Kalshi series ticker for NBA games */
export const KALSHI_NBA_SERIES = 'KXNBAGAME';

/** Regex to parse Kalshi NBA game ticker */
const KALSHI_NBA_TICKER_REGEX = /^KXNBAGAME-(\d{2})([A-Z]{3})(\d{2})([A-Z]{3})([A-Z]{3})$/;

// ============ Ticker Parsing ============

/**
 * Parse a Kalshi NBA game ticker.
 *
 * @param ticker - e.g., "KXNBAGAME-26JAN13PHXMIA"
 * @returns Parsed data or null if not a valid NBA game ticker
 */
export function parseKalshiNbaTicker(ticker: string): ParsedNbaGame | null {
  const match = ticker.match(KALSHI_NBA_TICKER_REGEX);
  if (!match) return null;

  const [, yy, mon, dd, awayCode, homeCode] = match;

  const monthIndex = MONTHS_SHORT.indexOf(mon);
  if (monthIndex === -1) return null;

  const year = 2000 + parseInt(yy, 10);
  const day = parseInt(dd, 10);
  const date = new Date(year, monthIndex, day);

  return {
    awayCode: awayCode.toLowerCase(),
    homeCode: homeCode.toLowerCase(),
    date,
  };
}

